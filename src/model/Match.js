//		xiNET cross-link viewer
//		Copyright 2013 Rappsilber Laboratory
//
//		author: Colin Combe
//		
//		Match.js

"use strict";

function Match(id, 
				pep1_protIDs, pep1_positions, pepSeq1, linkPos1,
				pep2_protIDs, pep2_positions, pepSeq2, linkPos2,
				score, dataSetId, autovalidated, validated, run_name, scan_number){
	
    this.id = id.toString().trim();

  	//if the match is ambiguous it will relate to many crossLinks
  	this.crossLinks = [];
    
    //for comparison of different data sets
  	this.group = dataSetId.toString().trim();
  	Match.groups.add(this.group);
  	
  	this.runName = run_name.toString().trim();
  	this.scanNumber = scan_number.toString().trim();
  	
  	//sanitise the inputs  
    //http://stackoverflow.com/questions/5515310/is-there-a-standard-function-to-check-for-null-undefined-or-blank-variables-in

    //score - leaves this.score null if !isNaN(parseFloat(score)) 
    if (score){
		score = parseFloat(score);
		if (!isNaN(score)){
			this.score = score;
			
			if (!Match.maxScore || this.score > Match.maxScore) {
				this.controller.scores.max = this.score;
			}
			else if (this.score < this.controller.scores.min) {
				this.controller.scores.min = this.score;
			}
		}
	}
	
	//autovalidated - another attribute   
	if (autovalidated){
		autovalidated = autovalidated.toString().trim();
		if (autovalidated !== ''){
			if (autovalidated == "t" || autovalidated == "true" || autovalidated === true){
				this.autovalidated = true;
			} else {
				this.autovalidated = false;
			}		
			Match.autoValidatedFound = true;
		}
    }
    
    // used in Rappsilber Lab to record manual validation status
    if (validated){
		validated = validated.toString().trim();
		this.validated = validated;	
		Match.manualValidatedFound = true;
	}
		
	//tidy up IDs, leaves protIDs null if empty, 'n/a' or '-'
	// forbidden characters are ,;'"
	function sanitiseProteinIDs(protIDs){
		protIDs = protIDs.toString().trim();
		if (/*protIDs !== '' &&*/ protIDs !== '-' && protIDs !== 'n/a'){
			// eliminate all forms of quotation mark
			// - sooner or later they're going to screw up javascript, prob whilst trying to generate>parse JSON
			Match.eliminateQuotes.lastIndex = 0;
			protIDs = protIDs.replace(Match.eliminateQuotes, '');
			Match.split.lastIndex = 0;
			protIDs = protIDs.split(Match.split);			
			var protIDCount = protIDs.length
			for (var p = 0; p < protIDCount; p++ ){
				protIDs[p] = protIDs[p].trim();
			}		
		}
		else {
			protIDs = null;
		}
		return protIDs;
	}

	//protein IDs
	pep1_protIDs = sanitiseProteinIDs(pep1_protIDs);
	pep2_protIDs = sanitiseProteinIDs(pep2_protIDs);

	//these are the peptide sequences before the modification info is removed
	//(these att's not shown in uml diagram...)
	this.pepSeq1raw = pepSeq1;
	this.pepSeq2raw = pepSeq2;
	
	this.pepSeq1 = null;
	if (pepSeq1){
		Match.capitalsOnly.lastindex = 0;
		this.pepSeq1 = pepSeq1.replace(Match.capitalsOnly, '');
	}
	this.pepSeq2 = null;
	if (pepSeq2){
		Match.capitalsOnly.lastindex = 0;
		this.pepSeq2 = pepSeq2.replace(Match.capitalsOnly, '');
	}
	
	pep1_positions = sanitisePositions(pep1_positions);
	pep2_positions = sanitisePositions(pep2_positions);
	linkPos1 = sanitisePositions(linkPos1);
	linkPos2 = sanitisePositions(linkPos2);
	
	if (pep1_positions.length == 1 && pep2_positions.length == 1) {
		Match.unambigLinkFound = true; 
	}
		
	// tidy up postions (peptide and link positions), 
	// leaves positions null if empty, 'n/a' or '-'
	// forbidden characters are ,;'"
	function sanitisePositions(positions){
		if (positions){
			positions = positions.toString().trim();
			if (positions !== '' && positions !== '-' && positions !== 'n/a'){
				// eliminate all forms of quotation mark 
				Match.eliminateQuotes.lastIndex = 0;
				positions = positions.toString().replace(Match.eliminateQuotes, '');
				//; or , as seperator (need comma incase input field was an array, which has just had toString called on it)
				split.lastIndex = 0;
				positions = positions.split(split);	
				var posCount = positions.length;
				for (var i2 = 0; i2 < posCount; i2++ ){
					var pos = parseInt(positions[i2]);
					if (isNaN(pos)) {
						console.debug('Absurd non-numerical position. Match id:'
							 + this.id + ". So-called 'position':" + positions[i2]);
					}
					else {
						positions[i2] = pos;
					}
				}			
			}
			else {
				positions = null;
			}
		}
		else {
			positions = null;
		}	
		return positions;
	}
	
	//product type
  	//0 = linker modified peptide (mono-link), 
  	// 1 = internally linked peptide (loop-link), 2 = cross-link 			
	if (pep2_protIDs === null && (pep2_positions === null && linkPos2 === null)){
		this.productType = 0;
	}
	else if (pep2_protIDs === null){
		this.productType = 1;
	}
	else {
		this.productType = 2;
	}

	// the protein IDs and residue numers we eventually want to get:-
	var p1ID, p2ID, res1, res2;
	//used along the way:-
	var iProt, jProt;
	
	if (pep1_protIDs) {
		if (this.productType === 0) { //its a linker modified peptide (mono-link) 
			if (pep1_positions !== null) { 
				for (var i = 0; i < pep1_positions.length; i++) {
					iProt = i;
					if (iProt >= pep1_protIDs.length) {
						iProt = pep1_protIDs.length - 1;
					}
					p1ID = pep1_protIDs[iProt];
					res1 = pep1_positions[i];
					res1 += linkPos1[0] - 1;
					this.associateWithLink(p1ID, null, res1, null, pep1_positions[i], this.pepSeq1.length, null, null);		
				}		
			}
			else {
				for (var i = 0; i < linkPos1.length; i++) {
					iProt = i;
					if (iProt >= pep1_protIDs.length) {
						iProt = pep1_protIDs.length - 1;
					}
					p1ID = pep1_protIDs[iProt];
					res1 = linkPos1[i];
					this.associateWithLink(p1ID, null, res1, null, null, null, null, null);		
				}		
			}
		} 
		else if (this.productType === 1){// its an internally linked peptide (loop-link)
			if (pep1_positions !== null) { 
				//loop to produce all alternative linkage site combinations for loop links
				for (var i = 0; i < pep1_positions.length; i++) {
					//must be same number of alternatives for res 2 as for res1 in loop link
					
					// we allow following, though its not documented
					// may be more residue positions than prot ids in the arrays
					// ( = multiple positions in one protein)
					var iProt = i;
					if (iProt >= pep1_protIDs.length) {
						iProt = pep1_protIDs.length - 1;
					}
					p1ID = pep1_protIDs[iProt];

					// * residue numbering starts at 1 *
					res1 = pep1_positions[i];
					res2 = (pep2_positions)? pep2_positions[i] : pep1_positions[i];
					if (linkPos1 !== null) {
						res1 += linkPos1[0] - 1;
					}
					if (linkPos2 !== null) {
						res2 += linkPos2[0] - 1;
					}
					this.associateWithLink(p1ID, null, res1, res2, pep1_positions[i], this.pepSeq1.length, null, null);				
				}		
			}
			else {
				for (var i = 0; i < linkPos1.length; i++) {
					//must be same number of alternatives for res 2 as for res1 in loop link
					
					// we allow following, though its not documented
					// may be more residue positions than prot ids in the arrays
					// ( = multiple positions in one protein)
					var iProt = i;
					if (iProt >= pep1_protIDs.length) {
						iProt = pep1_protIDs.length - 1;
					}
					p1ID = pep1_protIDs[iProt];

					// * residue numbering starts at 1 *
					res1 = linkPos1[0];
					res2 = linkPos2[0];
					this.associateWithLink(p1ID, null, res1, res2, null, null, null, null);				
				}		
			}
		}
		else { //its cross-linked peptides
			if (pep1_positions !== null) { 
				//loop to produce all alternative linkage site combinations 
				//(position1 count * position2 count alternative)
				if (pep1_positions !== null) {
					for (var i = 0; i < pep1_positions.length; i++) {
						for (var j = 0; j < pep2_positions.length; j++) {
							// allowed, but undocumneted:
							// may be more residue positions than prot ids in the arrays
							// ( = multiple positions in one protein, we use the last protein id encountered)
							var iProt = i, jProt = j;
							if (iProt >= pep1_protIDs.length) {
								iProt = pep1_protIDs.length - 1;
							}
							if (jProt >= pep2_protIDs.length) {
								jProt = pep2_protIDs.length - 1;
							}
							p1ID = pep1_protIDs[iProt];
							p2ID = pep2_protIDs[jProt];

							// * residue numbering starts at 1 *
							res1 = pep1_positions[i] - 0;
							res2 = pep2_positions[j] - 0;
							if (linkPos1 !== null) {
								res1 += (linkPos1 - 1);
							}
							if (linkPos2 !== null) {
								res2 += (linkPos2 - 1);
							}
							
							this.associateWithLink(p1ID, p2ID, res1, res2, pep1_positions[i] - 0, this.pepSeq1.length, pep2_positions[j], this.pepSeq2.length);			
						}
					}
				}
			}
			else {
				//loop to produce all alternative linkage site combinations 
				//(position1 count * position2 count alternatives)
				for (var i = 0; i < linkPos1.length; i++) {
					for (var j = 0; j < linkPos2.length; j++) {
						// allowed, but undocumneted:
						// may be more residue positions than prot ids in the arrays
						// ( = multiple positions in one protein, we use the last protein id encountered)
						var iProt = i, jProt = j;
						if (iProt >= pep1_protIDs.length) {
							iProt = pep1_protIDs.length - 1;
						}
						if (jProt >= pep2_protIDs.length) {
							jProt = pep2_protIDs.length - 1;
						}
						p1ID = pep1_protIDs[iProt];
						p2ID = pep2_protIDs[jProt];

						// * residue numbering starts at 1 *
						res1 = linkPos1[i] - 0;
						res2 = linkPos2[j] - 0;				
						this.associateWithLink(p1ID, p2ID, res1, res2, null, null, null, null);			
					}
				}
			}
		}
		
		//identify homodimers: if peptides overlap its a homodimer, this bit of code is not quite finished
		this.confirmedInterSelflink = false;//not that simple - single match may possibly be both homodimer link and inter protein link (if ambiguous)
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
					var pep1_start = pep1_positions[0];
					var pep2_start = pep2_positions[0];
					var pep1_end = pep1_start  + (pep1length - 1);
					var pep2_end = pep2_start + (pep2length - 1);
					if (pep1_start >= pep2_start && pep1_start <= pep2_end){
					   //console.log("here");
						this.confirmedInterSelflink = true;
						this.overlap[0] = pep1_start - 1;
						if (pep1_end < pep2_end) {
							this.overlap[1] = pep1_end;											
						} else {
							this.overlap[1] = pep2_end;					
						}
					}
					else if (pep2_start >= pep1_start && pep2_start <= pep1_end){
						this.confirmedInterSelflink = true;
						this.overlap[0] = pep2_start - 1;
						if (pep2_end < pep1_end) {
							this.overlap[1] = pep2_end;											
						} else {
							this.overlap[1] = pep1_end;			
						}		
					}
				}
				else if (res1 === res2) {
					this.confirmedInterSelflink = true;
					this.overlap[0] = res1 -1;
					this.overlap[1] = res2;
				}
			//}
		}
		
		//non of following are strictly necesssary, because info is stored in assicated CrossLinks
		//burns some memory for convenience when making table of matches or outputing CSV, etc
		this.protein1 = pep1_protIDs;
		this.pepPos1 = pep1_positions;
		this.linkPos1 = linkPos1;
		this.protein2 = pep2_protIDs;
		this.pepPos2 = pep2_positions;
		this.linkPos2  = linkPos2; 
	}
}

//static variables
Match.groups = new Set();
Match.autoValidatedFound = false;
Match.manualValidatedFound = false;
Match.unambigLinkFound = false; 
Match.eliminateQuotes = /(['"])/g;
Match.split = /[;,]/g;
Match.capitalsOnly = /[^A-Z]/g;	
	
Match.prototype.associateWithLink = function (p1ID, p2ID, res1, res2, //following params may be null :-
			pep1_start, pep1_length, pep2_start, pep2_length){	
	// we don't want two different ID's, e.g. one thats "33-66" and one thats "66-33"
	//following puts lower protein_ID first in link_ID
	var proteinLinkID, fromProt, toProt;
	
	//TODO: tidy up following
	if (p2ID === null) { //its  a loop link or mono link
		fromProt = this.controller.proteins.get(p1ID);
		if (res2 === null){// its a monolink
			proteinLinkID = "" + p1ID + "-null";
			toProt = null;
		}
		else { //its a loop link
			proteinLinkID = "" + p1ID + "-" + p1ID;
			toProt = fromProt;
		}
	}
	else if (p1ID <= p2ID) {
		proteinLinkID = "" + p1ID + "-" + p2ID;
		fromProt = this.controller.proteins.get(p1ID);
		toProt = (p2ID !== null)? this.controller.proteins.get(p2ID) : null;
	}
	else {
		proteinLinkID = "" + p2ID + "-" + p1ID;
		fromProt = this.controller.proteins.get(p2ID);
		toProt = this.controller.proteins.get(p1ID);

	}
	
	//get or create protein-protein link
	var link = this.controller.proteinLinks.get(proteinLinkID);
	if (link === undefined) {
		if (fromProt === undefined || toProt === undefined) {
			alert("Something has gone wrong; a link has been added before a protein it links to. " +
					p1ID + "-" + p2ID);
		}
		link = new ProteinLink(proteinLinkID, fromProt, toProt, this.controller);
		this.controller.proteinLinks.set(proteinLinkID, link);
		fromProt.addLink(link);
		if (toProt !== null){
			toProt.addLink(link);
		}
	}
	// again, order id string by prot id or by residue if self-link
	var endsReversedInResLinkId = false;
	var crossLinkID;
	if (p1ID === p2ID || p2ID === null) {
		if ((res1 - 0) < (res2 - 0) || res2 === null) {
			crossLinkID = res1 + "-" + res2;
		}
		else {
			crossLinkID = res2 + "-" + res1;
			endsReversedInResLinkId = true;
		}
	}
	else if (p1ID < p2ID) {
		crossLinkID = res1 + "-" +  res2;
	}
	else {
		crossLinkID =  res2 + "-" + res1;
		endsReversedInResLinkId = true;
	}

	//get or create residue link
	var resLink = link.crossLinks.get(crossLinkID);
	if (resLink === undefined) {
		//WATCH OUT - residues need to be in correct order
		if (p1ID === p2ID) {
			if ((res1 - 0) < (res2 - 0) || res2 === 'n/a') {//TODO: the 'n/a' is a mistake? Already dealt with?
				resLink = new CrossLink(crossLinkID, link, res1, res2, this.controller);
			} else {
				resLink = new CrossLink(crossLinkID, link, res2, res1, this.controller);
			}
		}
		//
		else if (p1ID == link.fromProtein.id) {
			resLink = new CrossLink(crossLinkID, link, res1, res2, this.controller);
		}
		else {
			//WATCH OUT - residues need to be in correct oprder
			resLink = new CrossLink(crossLinkID, link, res2, res1, this.controller);
		}
		link.crossLinks.set(crossLinkID, resLink);
		if (this.controller.proteins.size() > 1) {
			var linkCount = link.crossLinks.size();
			if (linkCount > ProteinLink.maxNoCrossLinks) {
				ProteinLink.maxNoCrossLinks = linkCount;
			}
		}
	}
	//we have residue link we want - associate this match with it
	if (typeof resLink.matches === 'undefined' || resLink.matches == null){
		resLink.matches = [];
	}
	//fix this hack with the array?
	if (endsReversedInResLinkId === false) {
		resLink.matches.push([this, pep1_start, pep1_length, pep2_start, pep2_length]);
	} else {
		resLink.matches.push([this, pep2_start, pep2_length, pep1_start, pep1_length]);
	}	
	this.crossLinks.push(resLink);	
}

Match.prototype.meetsFilterCriteria = function() {
    if (this.isAmbig() && this.controller.ambigShown === false) {
        return false;
    }
    if (typeof this.controller.filter == 'function') {
        return this.controller.filter(this);
    }
    else if (typeof this.controller.cutOff !== 'undefined' && typeof this.score !== 'undefined') {
        if (this.score >= this.controller.cutOff)
            return true;
        else
            return false;
    }
    else {
        return true;
    }
}

Match.prototype.isAmbig = function() {
    if (this.crossLinks.length > 1) {
        return true;
    }
    return false;
}
