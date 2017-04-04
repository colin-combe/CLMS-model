//      xiNET cross-link viewer
//      Copyright 2013 Rappsilber Laboratory
//
//      author: Colin Combe
//
//      CLMS.model.SpectrumMatch.js

CLMS.model.SpectrumMatch = function (containingModel, participants, crossLinks, peptides, rawMatches){

    // single 'rawMatch'looks like {"id":25918012,"ty":1,"pi":8485630,"lp":0,
    // "sc":3.25918,"si":624, dc:"f", "av":"f", (optional v:"A", rj: "f" ),
    // "r":"run","sn":6395,"pc":2},
    //
    // it's a join of spectrum_match and matched_peptide tables in DB,
    //
    // may seem convoluted but its to reduce amount of data need to transfer
    //
    // id = spectrumMatch id, ty = "match_type" (match_type != protduct_type)
    // pi = peptide_id, lp = link position, sc = score, si = search_id,
    // dc = is_decoy, av = autovalidated, v = validated, rj = rejected,
    // r = run_name, sn = scan_number, pc_c = precursor charge

    this.containingModel = containingModel; //containing BB model

    //following are duplicated in each raw_match (are from spectrum _match table)
    // take values from rawMatches[0]
    this.id = rawMatches[0].id;
    this.spectrumId = rawMatches[0].spec;
    this.searchId = rawMatches[0].si.toString();
    this.is_decoy = (rawMatches[0].dc == 't')? true : false;
    if (this.is_decoy === true) {
		this.containingModel.set("decoysPresent", true)
	}
    this.src = +rawMatches[0].src;
    this.scanNumber = +rawMatches[0].sn;

    this.precursorCharge = +rawMatches[0].pc_c;
    if (this.precursorCharge == -1) {
		this.precursorCharge = undefined;
	}

	//not currently used - questions about what its based on, typically -1
    //~ this.precursorIntensity = +rawMatches[0].pc_i;
    //~ if (this.precursorIntensity == -1) {
		//~ this.precursorIntensity = undefined;
	//~ }

	this.precursorMZ = +rawMatches[0].pc_mz;
    this.calc_mass = +rawMatches[0].cm;
    this.score = +rawMatches[0].sc;
    //autovalidated - another attribute
    if (rawMatches[0].av){
        if (rawMatches[0].av == "t"){
            this.autovalidated = true;
        } else {
            this.autovalidated = false;
        }
        this.containingModel.set("autoValidatedPresent", true);
    }
    // used in Rappsilber Lab to record manual validation status
    if (rawMatches[0].v){
        this.validated = rawMatches[0].v;
         this.containingModel.set("manualValidatedPresent", true);
    }

    this.matchedPeptides = [];
    this.matchedPeptides[0] = peptides.get(rawMatches[0].pi);
    // following will be inadequate for trimeric and higher order cross-links
    if (rawMatches[1]) {
        this.matchedPeptides[1] = peptides.get(rawMatches[1].pi);
    }

    //if the match is ambiguous it will relate to many crossLinks
    this.crossLinks = [];
    this.linkPos1 = rawMatches[0].lp;
    if (rawMatches[1]) {
        this.linkPos2 = rawMatches[1].lp;
	}

    if (this.linkPos1 == 0) { //would have been -1 in DB but 1 was added to it during query
        //its a linear
        for (var i = 0; i < this.matchedPeptides[0].pos.length; i++) {
            
			p1ID = this.matchedPeptides[0].prt[i];
		
			res1 = this.matchedPeptides[0].pos[i] - 1 + this.linkPos1;
		
			this.associateWithLink(participants, crossLinks, p1ID, p2ID, 
			res1, res2, this.matchedPeptides[0].pos[i] - 0, this.matchedPeptides[0].sequence.length);}
        return;
    }

    var self = this;

    // the protein IDs and residue numers we eventually want to get:-
    var p1ID, p2ID, res1, res2;
    //used along the way:-
    var iProt, jProt;

    //loop to produce all alternative linkage site combinations
    //(position1 count * position2 count alternative)
    for (var i = 0; i < this.matchedPeptides[0].pos.length; i++) {
        for (var j = 0; j < this.matchedPeptides[1].pos.length; j++) {

            p1ID = this.matchedPeptides[0].prt[i];
            p2ID = this.matchedPeptides[1].prt[j];

            // * residue numbering starts at 1 *
            res1 = this.matchedPeptides[0].pos[i] - 1 + this.linkPos1;
            res2 = this.matchedPeptides[1].pos[j] - 1 + this.linkPos2;

            this.associateWithLink(participants, crossLinks, p1ID, p2ID, res1, res2, this.matchedPeptides[0].pos[i] - 0, this.matchedPeptides[0].sequence.length, this.matchedPeptides[1].pos[j], this.matchedPeptides[1].sequence.length);
        }
    }

    //identify homodimers: if peptides overlap its a homodimer, this bit of code is not quite finished
    this.confirmedHomomultimer = false;//not that simple - single match may possibly be both homodimer link and inter protein link (if ambiguous)
    this.overlap = [];//again, not that simple - see note below
    //if self link
    if (p1ID === p2ID) {
        //if /*unambiguous?*/ cross-link
       // if (pep1_positions && pep2_positions ){
            //TODO: there is some problems here to do with ambiguity - overlap may occur in different places
            //&& pep1_positions.length === 1 && pep2_positions.length === 1) {
            //if both peptide sequnces defined
            if (this.matchedPeptides[0].sequence && this.matchedPeptides[1].sequence) {

                var pep1length = this.matchedPeptides[0].sequence.length;
                var pep2length = this.matchedPeptides[1].sequence.length;
                var pep1_start = this.matchedPeptides[0].pos[0];
                var pep2_start = this.matchedPeptides[1].pos[0];
                var pep1_end = pep1_start  + (pep1length - 1);
                var pep2_end = pep2_start + (pep2length - 1);
                if (pep1_start >= pep2_start && pep1_start <= pep2_end){
                    this.confirmedHomomultimer = true;
                    this.overlap[0] = pep1_start - 1;
                    if (pep1_end < pep2_end) {
                        this.overlap[1] = pep1_end;
                    } else {
                        this.overlap[1] = pep2_end;
                    }
                }
                else if (pep2_start >= pep1_start && pep2_start <= pep1_end){
                    this.confirmedHomomultimer = true;
                    this.overlap[0] = pep2_start - 1;
                    if (pep2_end < pep1_end) {
                        this.overlap[1] = pep2_end;
                    } else {
                        this.overlap[1] = pep1_end;
                    }
                }
            }
            else if (res1 === res2) {
                this.confirmedHomomultimer = true;
                this.overlap[0] = res1 -1;
                this.overlap[1] = res2;
            }
    }
}

CLMS.model.SpectrumMatch.prototype.associateWithLink = function (proteins, crossLinks, p1ID, p2ID, res1, res2, //following params may be null :-
            pep1_start, pep1_length, pep2_start, pep2_length){
				
    // we don't want two different ID's, e.g. one thats "33-66" and one thats "66-33"
    //following puts lower protein_ID first in link_ID
    var fromProt, toProt;

    //~ var proteins = this.containingModel.get("participants");
    //~ var crossLinks = this.containingModel.get("crossLinks");

    if (!p2ID) { //its  a linear peptide (no crosslinker of any product type))
        fromProt = proteins.get(p1ID);
    }
    else if (p1ID <= p2ID) {
        fromProt = proteins.get(p1ID);
        toProt = proteins.get(p2ID);
    }
    else {
        fromProt = proteins.get(p2ID);
        toProt = proteins.get(p1ID);
    }

    // again, order id string by prot id or by residue if self-link
    var endsReversedInResLinkId = false;
    var crossLinkID;
	if (!p2ID) {
		    crossLinkID = p1ID + "_linears";
	}
    else if (p1ID === p2ID || p2ID === null) {
        if ((res1 - 0) < (res2 - 0) || res2 === null) {
            crossLinkID = p1ID + "_" + res1 + "-" + p2ID + "_" + res2;
        }
        else {
            crossLinkID = p2ID + "_" + res2 + "-" +  p1ID + "_" + res1;
            endsReversedInResLinkId = true;
        }
    }
    else if (p1ID < p2ID) {
        crossLinkID = p1ID + "_" + res1 + "-" + p2ID + "_" + res2;
    }
    else {
        crossLinkID =  p2ID + "_" + res2 + "-" +  p1ID + "_" + res1;
        endsReversedInResLinkId = true;
    }

    //get or create residue link
    var resLink = crossLinks.get(crossLinkID);
    if (typeof resLink == 'undefined') {
        //WATCH OUT - residues need to be in correct order
        if (!p2ID) {
			resLink = new CLMS.model.CrossLink(crossLinkID, fromProt,
				null, null, null, this.containingModel);
		}
        else if (p1ID === p2ID) {
            if ((res1 - 0) < (res2 - 0)) {
                resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res1, toProt, res2, this.containingModel);
            } else {
                resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res2, toProt, res1, this.containingModel);
            }
        }
        //
        else if (p1ID == fromProt.id) {
            resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res1, toProt, res2, this.containingModel);
        }
        else {
            //WATCH OUT - residues need to be in correct oprder
            resLink = new CLMS.model.CrossLink(crossLinkID, fromProt, res2, toProt, res1, this.containingModel);
        }
        crossLinks.set(crossLinkID, resLink);

        fromProt.crossLinks.push(resLink);
        if (toProt != null && (toProt != fromProt)){
            toProt.crossLinks.push(resLink);
        }
    }

	var peptidePositions = []; //TODO - needs rethought about
    if (endsReversedInResLinkId === false) {
		peptidePositions.push({start: pep1_start, length: pep1_length});
		peptidePositions.push({start: pep2_start, length: pep2_length});
	} else {
    	peptidePositions.push({start: pep2_start, length: pep2_length});
		peptidePositions.push({start: pep1_start, length: pep1_length});
	}
    resLink.matches_pp.push({match: this, pepPos: peptidePositions});
    this.crossLinks.push(resLink);
}

CLMS.model.SpectrumMatch.prototype.isAmbig = function() {
    if (this.crossLinks.length > 1) {
        return true;
    }
    return false;
}

CLMS.model.SpectrumMatch.prototype.runName = function() {
	var runName = this.containingModel.get("spectrumSources").get(this.src);
    return runName;
}

CLMS.model.SpectrumMatch.prototype.expMZ = function() {
	return this.precursorMZ;
}

CLMS.model.SpectrumMatch.prototype.expMass = function() {
	return this.precursorMZ * this.precursorCharge;
}


CLMS.model.SpectrumMatch.prototype.matchMZ = function() {
	return this.calc_mass / this.precursorCharge;
}

CLMS.model.SpectrumMatch.prototype.matchMass = function() {
	return this.calc_mass;
}

CLMS.model.SpectrumMatch.prototype.massError = function() {
	return this.expMass() - this.matchMass();
}
