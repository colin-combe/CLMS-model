//      xiNET cross-link viewer
//      Copyright 2013 Rappsilber Laboratory
//
//      author: Colin Combe
//
//      CLMS.model.SpectrumMatch.js

CLMS.model.SpectrumMatch = function (containingModel, rawMatches){

    // single 'rawMatch'looks like {"id":25918012,"ty":1,"pi":8485630,"lp":0,
    // "sc":3.25918,"si":624, dc:"f", "av":"f", (optional v:"A", rj: "f" ),
    // "r":"run","sn":6395,"pc":2},
    //
    // it's a join of spectrum_match and matched_peptide tables in DB,
    //
    // id = spectrumMatch id, ty = "match_type" (match_type != protduct_type)
    // pi = peptide_id, lp = link position, sc = score, si = search_id,
    // dc = is_decoy, av = autovalidated, v = validated, rj = rejected,
    // r = run_name, sn = scan_number, pc = precursor charge

    this.containingModel = containingModel; //containing BB model

    //following are duplicated in each raw_match (are from spectrum _match table)
    // take values from rawMatches[0]
    this.id = rawMatches[0].id;
    this.spectrumId = rawMatches[0].spec;
    this.searchId = rawMatches[0].si.toString();
    this.is_decoy = (rawMatches[0].dc == 't')? true : false;
    this.runName = rawMatches[0].r;
    this.scanNumber = rawMatches[0].sn;
    this.precursorCharge = rawMatches[0].pc;
    this.score = rawMatches[0].sc;
    //autovalidated - another attribute
    if (rawMatches[0].av){
        if (rawMatches[0].av == "t"){
            this.autovalidated = true;
        } else {
            this.autovalidated = false;
        }
        CLMS.model.autoValidatedFound = true;
    }
    // used in Rappsilber Lab to record manual validation status
    if (rawMatches[0].v){
        this.validated = rawMatches[0].v;
        CLMS.model.manualValidatedFound = true;
    }

    var peptides = this.containingModel.get("peptides");
    this.matchedPeptides = [];
    this.matchedPeptides[0] = peptides.get(rawMatches[0].pi);
    // following will be inadequate for trimeric and higher order cross-links
    if (rawMatches[1]) {
        this.matchedPeptides[1] = peptides.get(rawMatches[1].pi);
    }

    //if the match is ambiguous it will relate to many crossLinks
    this.crossLinks = [];

    //TODO: could tidy following up
    this.pepSeq1raw = this.matchedPeptides[0].seq_mods;
    this.pepSeq1 = this.matchedPeptides[0].sequence;
    this.linkPos1 = rawMatches[0].lp;
    this.protein1 = this.matchedPeptides[0].prt;
    this.pepPos1 = this.matchedPeptides[0].pos;
    // following will be inadequate for trimeric and higher order cross-links
    if (rawMatches[1]) {
        this.pepSeq2raw = this.matchedPeptides[1].seq_mods;
        this.pepSeq2 = this.matchedPeptides[1].sequence;
        this.linkPos2 = rawMatches[1].lp;
        this.protein2 = this.matchedPeptides[1].prt;
        this.pepPos2 = this.matchedPeptides[1].pos;
    } else {
        this.pepSeq2raw = "";
        this.pepSeq2 = "";
        this.linkPos2 = null;
        this.protein2 = [];
        this.pepPos2 = [];
    }

    if (this.linkPos1 == 0) { //would have been -1 in DB but 1 was added to it during query
        //its a linear
        for (var i = 0; i < this.pepPos1.length; i++) {
            
			p1ID = this.protein1[i];
		
			res1 = this.pepPos1[i] - 1 + this.linkPos1;
		
			this.associateWithLink(p1ID, p2ID, res1, res2, this.pepPos1[i] - 0, this.pepSeq1.length, this.pepPos2[j], this.pepSeq2.length);
        }
        return;
    }

    var self = this;

    // the protein IDs and residue numers we eventually want to get:-
    var p1ID, p2ID, res1, res2;
    //used along the way:-
    var iProt, jProt;

    //loop to produce all alternative linkage site combinations
    //(position1 count * position2 count alternative)
    for (var i = 0; i < this.pepPos1.length; i++) {
        for (var j = 0; j < this.pepPos2.length; j++) {

            p1ID = this.protein1[i];
            p2ID = this.protein2[j];

            // * residue numbering starts at 1 *
            res1 = this.pepPos1[i] - 1 + this.linkPos1;
            res2 = this.pepPos2[j] - 1 + this.linkPos2;

            this.associateWithLink(p1ID, p2ID, res1, res2, this.pepPos1[i] - 0, this.pepSeq1.length, this.pepPos2[j], this.pepSeq2.length);
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
            if (this.pepSeq1 && this.pepSeq2) {

                var pep1length = this.pepSeq1.length;
                var pep2length = this.pepSeq2.length;
                var pep1_start = this.pepPos1[0];
                var pep2_start = this.pepPos2[0];
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

//static variables - todo: these should be someehwre else... in model instance
CLMS.model.SpectrumMatch.autoValidatedFound = false;
CLMS.model.SpectrumMatch.manualValidatedFound = false;
CLMS.model.SpectrumMatch.unambigLinkFound = false;

CLMS.model.SpectrumMatch.prototype.associateWithLink = function (p1ID, p2ID, res1, res2, //following params may be null :-
            pep1_start, pep1_length, pep2_start, pep2_length){
    // we don't want two different ID's, e.g. one thats "33-66" and one thats "66-33"
    //following puts lower protein_ID first in link_ID
    var fromProt, toProt;

    var proteins = this.containingModel.get("interactors");
    var crossLinks = this.containingModel.get("crossLinks");

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
