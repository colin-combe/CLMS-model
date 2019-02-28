//      xiNET cross-link viewer
//      Copyright 2013 Rappsilber Laboratory
//
//      author: Colin Combe
//
//      CLMS.model.SpectrumMatch.js

//temp
CLMS.model.dupScans = new Map();
CLMS.model.dupCount = 0;

CLMS.model.SpectrumMatch = function(containingModel, participants, crossLinks, peptides, rawMatches) {

    // single 'rawMatch'looks like {"id":25918012,"ty":1,"pi":8485630,"lp":0,
    // "sc":3.25918,"si":624, dc:"f", "av":"f", (optional v:"A", rj: "f" ),
    // "si":"searchId", "src":"to look up runname", "sn":6395,"pc":2, cm:"calc_mass"},
    //
    // it's a join of spectrum_match and matched_peptide tables in DB,
    //
    // may seem convoluted but its to reduce amount of data need to transfer
    //
    // id = spectrumMatch id, ty = "match_type" (match_type != protduct_type)
    // pi = peptide_id, lp = link position, sc = score, si = search_id,
    // dc = is_decoy, av = autovalidated, v = validated, rj = rejected,
    // sn = scan_number, pc_c = precursor charge, src = for run name look up
    // cm = calc-mass

    this.containingModel = containingModel; //containing BB model

    //following are duplicated in each raw_match (they are from spectrum _match table)
    // take values from rawMatches[0]
    this.id = rawMatches[0].id;
    this.spectrumId = rawMatches[0].spec;
    this.searchId = rawMatches[0].si.toString();
    this.crosslinker_id = rawMatches[0].cl;
    if (rawMatches[0].dc) {
        this.is_decoy = (rawMatches[0].dc == 't') ? true : false;
    }
    if (this.is_decoy === true) {
        this.containingModel.set("decoysPresent", true);
    }
    this.scanNumber = +rawMatches[0].sn;
    this.scanIndex = +rawMatches[0].sc_i;
    this.precursor_intensity = +rawMatches[0].pc_i;
    this.elution_time_start = +rawMatches[0].e_s;
    this.elution_time_end = +rawMatches[0].e_e;

    this.src = +rawMatches[0].src; //for looking up run name
    this.plf = +rawMatches[0].plf; //for looking up peak list file name
    //run name may have come from csv file
    if (rawMatches[0].run_name) {
        this.run_name = rawMatches[0].run_name;
    }

    this.precursorCharge = +rawMatches[0].pc_c;
    if (this.precursorCharge == -1) {
        this.precursorCharge = undefined;
    }

    this.precursorMZ = +rawMatches[0].pc_mz;
    this.calc_mass = +rawMatches[0].cm;
    this._score = +rawMatches[0].sc;
    //autovalidated - another attribute
    if (rawMatches[0].av) {
        if (rawMatches[0].av == "t") {
            this.autovalidated = true;
        } else {
            this.autovalidated = false;
        }
        this.containingModel.set("autoValidatedPresent", true);
    }
    // used in Rappsilber Lab to record manual validation status
    if (rawMatches[0].v) {
        this.validated = rawMatches[0].v;
        this.containingModel.set("manualValidatedPresent", true);
    }

    if (!this.autovalidated && !this.validated) {
        this.containingModel.set("unvalidatedPresent", true);
    }

    if (peptides) { //this is a bit tricky, see below*
        this.matchedPeptides = [];
        this.matchedPeptides[0] = peptides.get(rawMatches[0].pi);
        // following will be inadequate for trimeric and higher order cross-links
        if (rawMatches[1]) {
            this.matchedPeptides[1] = peptides.get(rawMatches[1].pi);
        }
    } else { //*here - if its from a csv file use rawMatches as the matchedPep array,
        //makes it easier to construct as parsing CSV
        this.matchedPeptides = rawMatches;
    }

    //if the match is ambiguous it will relate to many crossLinks
    this.crossLinks = [];
    this.linkPos1 = +rawMatches[0].lp;
    if (rawMatches[1]) {
        this.linkPos2 = +rawMatches[1].lp;
    }

    if (this.linkPos1 == 0) { //would have been -1 in DB but 1 was added to it during query
        //its a linear
        this.containingModel.set("linearsPresent", true);
        for (var i = 0; i < this.matchedPeptides[0].prt.length; i++) {
            p1ID = this.matchedPeptides[0].prt[i];
            this.associateWithLink(participants, crossLinks, p1ID);
        }
        if (this.matchedPeptides[1]) {
            for (var i = 0; i < this.matchedPeptides[1].prt.length; i++) {
                p1ID = this.matchedPeptides[1].prt[i];
                this.associateWithLink(participants, crossLinks, p1ID);
            }
        }
        return;
    }

    this.couldBelongToBetweenLink = false;
    this.couldBelongToSelfLink = false;

    var self = this;

    // the protein IDs and residue numers we eventually want to get:-
    var p1ID, p2ID, res1, res2;
    //used along the way:-
    var iProt, jProt;

    //loop to produce all alternative linkage site combinations
    //(position1 count * position2 count alternative)
    for (var i = 0; i < this.matchedPeptides[0].pos.length; i++) {
        for (var j = 0; j < this.matchedPeptides[1].pos.length; j++) {

            if (i > 0 || j > 0) {
                this.containingModel.set("ambiguousPresent", true);
            }

            //some files are not puting in duplicate protein ids in ambig links
            //in this case use last one
            if (i < this.matchedPeptides[0].prt.length) {
                p1ID = this.matchedPeptides[0].prt[i];
            } else {
                p1ID = this.matchedPeptides[0].prt[this.matchedPeptides[0].prt.length - 1];
            }
            if (j < this.matchedPeptides[1].prt.length) {
                p2ID = this.matchedPeptides[1].prt[j];
            } else {
                p2ID = this.matchedPeptides[1].prt[this.matchedPeptides[1].prt.length - 1];
            }

            // * residue numbering starts at 1 *
            res1 = +this.matchedPeptides[0].pos[i] - 1 + this.linkPos1;
            res2 = +this.matchedPeptides[1].pos[j] - 1 + this.linkPos2;

            this.associateWithLink(participants, crossLinks, p1ID, p2ID, res1, res2, this.matchedPeptides[0].pos[i] - 0, this.matchedPeptides[0].sequence.length, this.matchedPeptides[1].pos[j], this.matchedPeptides[1].sequence.length);
        }
    }

    //identify homodimers: if peptides overlap its a homodimer
    this.confirmedHomomultimer = false;
    this.overlap = [];
    if (p1ID === p2ID) { //todo: fix potential problem here regarding ambiguous homo-multimer link

        if (this.matchedPeptides[0].sequence && this.matchedPeptides[1].sequence) {

            var pep1length = this.matchedPeptides[0].sequence.length;
            var pep2length = this.matchedPeptides[1].sequence.length;
            var pep1_start = +this.matchedPeptides[0].pos[0];
            var pep2_start = +this.matchedPeptides[1].pos[0];
            var pep1_end = pep1_start + (pep1length - 1);
            var pep2_end = pep2_start + (pep2length - 1);
            if (pep1_start >= pep2_start && pep1_start <= pep2_end) {
                this.confirmedHomomultimer = true;
                this.overlap[0] = pep1_start - 1;
                if (pep1_end < pep2_end) {
                    this.overlap[1] = pep1_end;
                } else {
                    this.overlap[1] = pep2_end;
                }
            } else if (pep2_start >= pep1_start && pep2_start <= pep1_end) {
                this.confirmedHomomultimer = true;
                this.overlap[0] = pep2_start - 1;
                if (pep2_end < pep1_end) {
                    this.overlap[1] = pep2_end;
                } else {
                    this.overlap[1] = pep1_end;
                }
            }
        } else if (res1 === res2) {
            this.confirmedHomomultimer = true;
            this.overlap[0] = res1 - 1;
            this.overlap[1] = res2;
        }
    }
}

CLMS.model.SpectrumMatch.prototype.associateWithLink = function(proteins, crossLinks, p1ID, p2ID, res1, res2, //following params may be null :-
    pep1_start, pep1_length, pep2_start, pep2_length) {

    // we don't want two different ID's, e.g. one thats "33-66" and one thats "66-33"
    //following puts lower protein_ID first in link_ID

    //todo: this end swapping thing, its a possible source of confusion

    var fromProt, toProt;

    if (!p2ID || p2ID == "" || p2ID == '-' || p2ID == 'n/a') { //its  a linear peptide (no crosslinker of any product type))
        this.containingModel.set("linearsPresent", true);
        fromProt = proteins.get(p1ID);
        if (!fromProt) {
            alert("FAIL: not protein with ID " + p1ID);
        }
    } else
    if (p1ID <= p2ID) {
        fromProt = proteins.get(p1ID);
        toProt = proteins.get(p2ID);
        if (!fromProt) {
            alert("FAIL: not protein with ID " + p1ID);
        }
        if (!toProt) {
            alert("FAIL: not protein with ID " + p2ID);
        }
    } else {
        fromProt = proteins.get(p2ID);
        toProt = proteins.get(p1ID);
        if (!fromProt) {
            alert("FAIL: not protein with ID " + p2ID);
        }
        if (!toProt) {
            alert("FAIL: not protein with ID " + p1ID);
        }
    }

    if (this.containingModel.isMatchingProteinPair(fromProt, toProt)) {
        this.couldBelongToSelfLink = true;
    } else {
        this.couldBelongToBetweenLink = true;
    }

    // again, order id string by prot id or by residue if self-link
    var endsReversedInResLinkId = false;
    var crossLinkID;
    if (!p2ID || p2ID == "" || p2ID == '-' || p2ID == 'n/a') {
        crossLinkID = p1ID + "_linears";
    } else if (p1ID === p2ID || p2ID === null) {
        if ((res1 - 0) < (res2 - 0) || res2 === null) {
            crossLinkID = p1ID + "_" + res1 + "-" + p2ID + "_" + res2;
        } else {
            crossLinkID = p2ID + "_" + res2 + "-" + p1ID + "_" + res1;
            endsReversedInResLinkId = true;
        }
    } else if (p1ID < p2ID) {
        crossLinkID = p1ID + "_" + res1 + "-" + p2ID + "_" + res2;
    } else {
        crossLinkID = p2ID + "_" + res2 + "-" + p1ID + "_" + res1;
        endsReversedInResLinkId = true;
    }

    //get or create residue link
    var resLink = crossLinks.get(crossLinkID);
    if (typeof resLink == 'undefined') {
        //to and from proteins were already swapped over above

        //WATCH OUT - residues need to be in correct order
        if (!p2ID) {
            resLink = new CLMS.model.CrossLink(crossLinkID, fromProt,
                null, null, null, this.containingModel);
        } else if (p1ID === p2ID) {
            if ((res1 - 0) < (res2 - 0)) {
                resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res1, toProt, res2, this.containingModel);
            } else {
                resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res2, toProt, res1, this.containingModel);
            }
        }
        //
        else if (p1ID == fromProt.id) {
            resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res1, toProt, res2, this.containingModel);
        } else {
            //WATCH OUT - residues need to be in correct oprder
            resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res2, toProt, res1, this.containingModel);
        }
        crossLinks.set(crossLinkID, resLink);

        fromProt.crossLinks.push(resLink);
        if (toProt != null && (toProt != fromProt)) {
            toProt.crossLinks.push(resLink);
        }
    }

    var peptidePositions = [];
    if (endsReversedInResLinkId === false) {
        peptidePositions.push({
            start: pep1_start,
            length: pep1_length
        });
        peptidePositions.push({
            start: pep2_start,
            length: pep2_length
        });
    } else {
        peptidePositions.push({
            start: pep2_start,
            length: pep2_length
        });
        peptidePositions.push({
            start: pep1_start,
            length: pep1_length
        });
    }
    resLink.matches_pp.push({
        match: this,
        pepPos: peptidePositions
    });
    this.crossLinks.push(resLink);
}

CLMS.model.SpectrumMatch.prototype.isAmbig = function() {
    if (this.matchedPeptides[0].pos.length > 1 ||
        (this.matchedPeptides[1] && this.matchedPeptides[1].pos.length > 1)) {
        return true;
    }
    return false;
}


CLMS.model.SpectrumMatch.prototype.heavyIsAmbig = function() {
    if (this.matchedPeptides[0].ambig ||
        (this.matchedPeptides[1] && this.matchedPeptides[1].ambig)) {
        return true;
    }
    return false;
}

CLMS.model.SpectrumMatch.prototype.isDecoy = function() {
    if (this.is_decoy) {
        return this.is_decoy;
    } else {
        //its from csv not database, for simplicity lets just look at first crosslink //todo - look at again
        return this.crossLinks[0].isDecoyLink();
    }
}

CLMS.model.SpectrumMatch.prototype.isLinear = function() {
    return this.linkPos1 === 0;
}

CLMS.model.SpectrumMatch.prototype.runName = function() {
    if (this.run_name) {
        return this.run_name;
    }
    var runName = this.containingModel.get("spectrumSources").get(this.src);
    return runName;
}

CLMS.model.SpectrumMatch.prototype.peakListFileName = function() {
    var peakListName = this.containingModel.get("peakListFiles").get(this.plf);
    return peakListName;
}

CLMS.model.SpectrumMatch.prototype.group = function() {
    var group = this.containingModel.get("searches").get(this.searchId).group;
    return group;
}

CLMS.model.SpectrumMatch.prototype.expMZ = function() {
    return this.precursorMZ;
}

CLMS.model.SpectrumMatch.protonMass = 1.007276466879;

CLMS.model.SpectrumMatch.prototype.expMass = function() {
    return this.precursorMZ * this.precursorCharge - (this.precursorCharge * CLMS.model.SpectrumMatch.protonMass);
}

CLMS.model.SpectrumMatch.prototype.calcMZ = function() {
    return (this.calc_mass + (this.precursorCharge * CLMS.model.SpectrumMatch.protonMass)) / this.precursorCharge;
}

CLMS.model.SpectrumMatch.prototype.calcMass = function() {
    return this.calc_mass;
}

CLMS.model.SpectrumMatch.prototype.massError = function() {
    return ((this.expMass() - this.calcMass()) / this.calcMass()) * 1000000;
}

CLMS.model.SpectrumMatch.prototype.ionTypes = function() {
    return this.containingModel.get("searches").get(this.searchId).ionTypes;
}

CLMS.model.SpectrumMatch.prototype.ionTypesString = function() {
    var ions = this.ionTypes();
    var returnString = "";
    for (var i = 0; i < ions.length; i++) {
        var ion = ions[i].type;
        if (ion.indexOf("Ion") > 0) {
            ion = ion.substring(0, ion.indexOf("Ion"));
        }
        returnString = returnString + ion.toLowerCase() + ";";
    }
    return returnString;
}

CLMS.model.SpectrumMatch.prototype.crossLinkerModMass = function() {
    if (this.crosslinker_id == -1) {
        return 0;
    }

    var crosslinkers = this.containingModel.get("searches").get(this.searchId).crosslinkers;
    var clCount = crosslinkers.length;
    for (var c = 0; c < clCount; c++) {
        var crosslinker = crosslinkers[c];
        if (crosslinker.id == this.crosslinker_id) {
            return crosslinker.mass;
        }
    }
}

CLMS.model.SpectrumMatch.prototype.fragmentTolerance = function() {
    var search = this.containingModel.get("searches").get(this.searchId);
    return {
        "tolerance": search.ms2tolerance,
        'unit': search.ms2toleranceunits
    };
}

CLMS.model.SpectrumMatch.prototype.fragmentToleranceString = function() {
    var search = this.containingModel.get("searches").get(this.searchId);
    return search.ms2tolerance + " " + search.ms2toleranceunits;
}

CLMS.model.SpectrumMatch.prototype.score = function() {
    return this._score;
}
