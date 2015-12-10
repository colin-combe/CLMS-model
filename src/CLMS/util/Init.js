//	  xiNET Cross-link Viewer
//	  Copyright 2013 Rappsilber Laboratory, University of Edinburgh
//
//    This product includes software developed at
//    the Rappsilber Laboratory (http://www.rappsilberlab.org/).
//
//	  author: Colin Combe
//
//    Init.js

"use strict";

var xiNET = {}; //crosslinkviewer's javascript namespace

xiNET.Controller = function() {

	//these attributes are used by checkboxes to hide self links or ambiguous links
	//~ this.selfLinksShown = true;
	//~ this.ambigShown = true;


	this.xiNET_storage = new xiNET_Storage(this);
	this.clear();
};

xiNET.Controller.prototype.clear = function() {
	//~ this.sequenceInitComplete = false;

	this.proteins = new Map();
	this.proteinLinks = new Map();
	this.crossLinks = new Map();
	this.matches = [];
	//~ this.groups = new Set();
	this.subgraphs = [];

	this.proteinCount = 0;
	//~ this.unambigLinkFound = false;
	//~ Protein.MAXSIZE = 100;

	//~ this.scores = null;
	//~ this.selectedLinks = new Map();
};

xiNET.Controller.prototype.linkSelectionChanged = function() {
	var callbacks = this.linkSelectionCallbacks;
	var count = callbacks.length;
	for (var i = 0; i < count; i++) {
		callbacks[i](this.selectedLinks);
	}
}

xiNET.Controller.prototype.linkHighlightsChanged = function(highlighted) {
	var callbacks = this.linkHighlightsCallbacks;
	var count = callbacks.length;
	for (var i = 0; i < count; i++) {
		callbacks[i](highlighted);
	}
}

xiNET.Controller.prototype.legendChanged = function() {
	var callbacks = this.legendCallbacks;
	var count = callbacks.length;
	for (var i = 0; i < count; i++) {
		callbacks[i](this.linkColours, this.domainColours);
	}
}

xiNET.Controller.prototype.clearSelection = function() {
	var things = this.selectedLinks.values();
	var count = things.length;
	for (var t = 0; t < count; t++) {
		var thing = things[t];
		thing.setSelected(false);
	}
};

xiNET.Controller.prototype.setAnnotations = function(annotationChoice) {
	this.annotationChoice = annotationChoice;
	//clear all annot's
	var mols = this.proteins.values();
	var molCount = mols.length;
	for (var m = 0; m < molCount; m++) {
		mols[m].clearPositionalFeatures();
	}
	this.domainColours = null;
	this.legendChanged();
	if (this.sequenceInitComplete) { //dont want to be changing annotations while still waiting on sequence
		var self = this;
		if (annotationChoice.toUpperCase() === "CUSTOM"){
			for (m = 0; m < molCount; m++) {
				var mol = mols[m];
				mol.setPositionalFeatures(mol.customAnnotations);
			}
			chooseColours();
		}
		else if (annotationChoice.toUpperCase() === "LYSINES") {
			for (m = 0; m < molCount; m++) {
				var mol = mols[m];
				var seq = mol.sequence;
				var annots = [];
				for (var i =0; i < mol.size; i++){
					var aa = seq[i];
					if (aa === 'K'){
						annots.push(new Annotation ("Lysine", i+1, i+1));
					}

				}
				mol.setPositionalFeatures(annots);
			}
			chooseColours();
		}
		else if (annotationChoice.toUpperCase() === "SUPERFAM" || annotationChoice.toUpperCase() === "SUPERFAMILY"){
			var molsAnnotated = 0;
			for (m = 0; m < molCount; m++) {
				var mol = mols[m];
				this.xiNET_storage.getSuperFamFeatures(mol.id, function (id, fts){
					var m = self.proteins.get(id);
					m.setPositionalFeatures(fts);
					molsAnnotated++;
					if (molsAnnotated === molCount) {
						chooseColours();
					}
				});
			}
		}
		else if (annotationChoice.toUpperCase() === "UNIPROT" || annotationChoice.toUpperCase() === "UNIPROTKB") {
			var molsAnnotated = 0;
			for (m = 0; m < molCount; m++) {
				var mol = mols[m];
				this.xiNET_storage.getUniProtFeatures(mol.id, function (id, fts){
					var m = self.proteins.get(id);
					if (m.accession.indexOf("-") === -1 || m.accession === "P02768-A") {
						if (m.accession === "P02768-A") {
							var offset = -24;
							for (var f = 0; f < fts.length; f++) {
								var feature = fts[f];
								feature.start = feature.start + offset;
								feature.end = feature.end + offset;
							}
						}
						m.setPositionalFeatures(fts);
					}
					molsAnnotated++;
					if (molsAnnotated === molCount) {
						chooseColours();
					}
				});
			}
		}
	}

	function chooseColours(){
		var categories = new Set();
		for (m = 0; m < molCount; m++) {
			var mol = mols[m];
			for (var a = 0; a < mol.annotations.length; a++){
				categories.add(mol.annotations[a].name);
			}
		}
		var catCount = categories.values().length;
		if (catCount < 3){catCount = 3;}
		//~ if (catCount < 21) {
			if (catCount < 9) {
				var reversed = colorbrewer.Accent[catCount].slice().reverse();
				self.domainColours = d3.scale.ordinal().range(reversed);
			}
			else if (catCount < 13) {
				var reversed = colorbrewer.Set3[catCount].slice().reverse();
				self.domainColours = d3.scale.ordinal().range(reversed);
			}
			else {
				self.domainColours = d3.scale.category20();
			}
			for (m = 0; m < molCount; m++) {
				var mol = mols[m];
				for (a = 0; a < mol.annotations.length; a++) {
					var anno = mol.annotations[a];
					var c = self.domainColours(anno.name);
					anno.pieSlice.setAttribute("fill", c);
					anno.pieSlice.setAttribute("stroke", c);
					anno.colouredRect.setAttribute("fill", c);
					anno.colouredRect.setAttribute("stroke", c);
				}
			}
		//~ }
		self.legendChanged();
	}
};

//requires all proteins have had sequence set
xiNET.Controller.prototype.initProteins = function() {
	var prots = this.proteins.values();
	var protCount = prots.length;
	Protein.MAXSIZE = 0;
	for (var i = 0; i < protCount; i++){
		var protSize = prots[i].size;
		if (protSize > Protein.MAXSIZE){
			Protein.MAXSIZE = protSize;
		}
	}
	//this.maxBlobRadius = Math.sqrt(Protein.MAXSIZE / Math.PI);
	var width = this.svgElement.parentNode.clientWidth;
	Protein.UNITS_PER_RESIDUE = (((width / 2)) - Protein.LABELMAXLENGTH) / Protein.MAXSIZE;
	for (var i = 0; i < protCount; i++){
		prots[i].init();
	}
	this.sequenceInitComplete = true;
	//~ if (protCount < 3) {
		//~ for (var j =0; j < protCount; j++){
			//~ prots[j].busy = false;
			//~ prots[j].setForm(1);
		//~ }
	//~ }
	if (this.annotationSet){
		xlv.setAnnotations(this.annotationSet);
	}
	else {
		this.setAnnotations('CUSTOM');
	}
}

xiNET.Controller.prototype.reset = function() {
	this.resetZoom();
	var proteins = this.proteins.values();
	var proteinCount = proteins.length;
	for (var p = 0; p < proteinCount; p++) {
		var prot = proteins[p];
		if (prot.isParked === false) {
			prot.setForm(0);
		}
	}
	this.autoLayout();
};


/*
xiNET.Controller.prototype.getMatchesCSV = function() {
	var csv = '"Id","Protein1","PepPos1","PepSeq1","LinkPos1","Protein2","PepPos2","PepSeq2","LinkPos2","Score","Group"\r\n';
	var matches = this.matches;
	var matchCount = matches.length;
	for (var i = 0; i < matchCount; i++){
		var match = matches[i];
		if (match.meetsFilterCriteria()){
			csv += '"' + match.id + '","' + match.protein1 + '","' +match.pepPos1 + '","'
				+ match.pepSeq1 + '","' + match.linkPos1 + '","'
				+ match.protein2 + '","' + match.pepPos2 + '","'
				+ match.pepSeq2 + '","' + match.linkPos2 + '","'
				+ match.score + '","' + match.group + '"\r\n';
		}
	}
	return csv;
}

xiNET.Controller.prototype.getLinksCSV = function() {
	var csv = '"Protein1","LinkPos1","LinkedRes1","Protein2","LinkPos2","LinkedRes2"\r\n';

	var pLinks = this.proteinLinks.values();
	var pLinkCount = pLinks.length;
	for (var pl = 0; pl < pLinkCount; pl++){
		var resLinks = pLinks[pl].residueLinks.values();
		var resLinkCount = resLinks.length;
		for (var rl =0; rl < resLinkCount; rl ++) {
			var residueLink = resLinks[rl];
			var filteredMatches = residueLink.getFilteredMatches();
			if (filteredMatches.length > 0){
				csv += '"' + xiNET.Controller.bestId(residueLink.proteinLink.fromProtein) + '","'
					+ residueLink.fromResidue + '","' + residueLink.proteinLink.fromProtein.sequence[residueLink.fromResidue - 1] + '","'
					+ xiNET.Controller.bestId(residueLink.proteinLink.toProtein) + '","'
					+ residueLink.toResidue + '","';
				if (residueLink.proteinLink.toProtein && residueLink.toResidue) {
					csv += residueLink.proteinLink.toProtein.sequence[residueLink.toResidue - 1];
				}
				csv += '"\r\n';
			}
		}
	}
	return csv;
}*/

xiNET.Controller.bestId = function(protein){
	if (protein.accession) {
		return protein.accession;
	}
	if (protein.name) {
		return protein.name;
	}
	return protein.id;
}

xiNET.Controller.prototype.addProtein = function(id, label, sequence, accession) {
	var newProt = new Protein(id, /*this,?*/ accession, label);
	newProt.setSequence(sequence);
	//~ newProt.init();
	this.proteins.set(id, newProt);
};

//Positions are one based
xiNET.Controller.prototype.addMatch = function(id,
				pep1_protIDs, pep1_positions, pep1_seq, linkPos1,
				pep2_protIDs, pep2_positions, pep2_seq, linkPos2,
				score, dataSetId, autovalidated, validated, run_name, scan_number) {
	var match = new Match(this, id,
				pep1_protIDs, pep1_positions, pep1_seq, linkPos1,
				pep2_protIDs, pep2_positions, pep2_seq, linkPos2,
				score, dataSetId, autovalidated, validated, run_name, scan_number);
	return match;
};

// add all matches with single call, arg is an array of arrays
xiNET.Controller.prototype.addMatches = function(matches) {
	var l = matches.length;
	for (var i = 0; i < l; i++) {
		this.addMatch(matches[i][0], matches[i][1], matches[i][2], matches[i][3],
				matches[i][4], matches[i][5], matches[i][6], matches[i][7],
				matches[i][8], matches[i][9], matches[i][10], matches[i][11],
				matches[i][12], matches[i][13], matches[i][14], matches[i][15]);
	}
}

// add annotation, 'HUMAN' RESIDUE NUMBERING - STARTS AT ONE
//TODO: make start and end res last args
xiNET.Controller.prototype.addAnnotation = function(protId, annotName, startRes, endRes, colour) {
	var protein = this.proteins.get(protId);
	if (protein) {
		//lets just check a few things here...
		// we're using human (starts at 1) numbering
		startRes = parseInt(startRes);
		endRes = parseInt(endRes);
		if (isNaN(startRes) && isNaN(endRes)) {
			startRes = 1;
			endRes = protein.size;
		}
		else if (isNaN(startRes))
			startRes = endRes;
		else if (isNaN(endRes))
			endRes = startRes;

		if (startRes > endRes) {
			var temp = startRes;
			startRes = endRes;
			endRes = temp;
		}

		var annotation = new Annotation(annotName, startRes, endRes, colour);
		if (protein.customAnnotations == null) {
			protein.customAnnotations = [];
		}
		protein.customAnnotations.push(annotation);
	}
}

xiNET.Controller.prototype.addAnnotationByName = function(protName, annotName, startRes, endRes, colour) {
	var prots = this.proteins.values();
	var protCount = prots.length;
	for (var p = 0; p < protCount; p++) {
		var protein = prots[p];
		if (protein.name == protName) {
			this.addAnnotation(protein.id, annotName, startRes, endRes, colour);
		}
	}
}

// add all matches with single call, arg is an array of arrays
xiNET.Controller.prototype.addAnnotations = function(annotations) {
	var rows = d3.csv.parseRows(annotations);
	var headers = rows[0];
	for (var h = 0; h < headers.length; h++) {
		headers[h] = headers[h].trim();
	}
	var iProtId = headers.indexOf('ProteinId');
	var iAnnotName = headers.indexOf('AnnotName');
	if (iAnnotName === -1) {
		iAnnotName = headers.indexOf('Name')
	}
	var iStartRes = headers.indexOf('StartRes');
	if (iStartRes === -1) {
		iStartRes = headers.indexOf('StartResidue')
	}
	var iEndRes = headers.indexOf('EndRes');
	if (iEndRes === -1) {
		iEndRes = headers.indexOf('EndResidue')
	}
	var iColour = headers.indexOf('Color');
	if (iColour === -1) {
		iColour = headers.indexOf('Colour')
	}

	var l = rows.length;
	for (var i = 1; i < l; i++) {
		this.addAnnotation(rows[i][iProtId], rows[i][iAnnotName],
							rows[i][iStartRes], rows[i][iEndRes], rows[i][iColour]);
	}
}


xiNET.Controller.prototype.setLinkColour = function(linkID, colour) {
	var proteinLink = this.proteinLinks.get(linkID);
	if (typeof proteinLink !== 'undefined') {
		proteinLink.colour = new RGBColor(colour);
		proteinLink.colourSpecified = true;
	}
	else {
		var protein = this.proteins.get(linkID);
		if (typeof protein !== 'undefined') {
			protein.internalLinkColour = new RGBColor(colour);
		}
	}
};
/*
xiNET.Controller.prototype.parkAll = function() {
	var prots = this.proteins.values();
	var protCount = prots.length;
	for (var p = 0; p < protCount; p++) {
		var protein = prots[p];
		if (protein.isParked === false)
			protein.toggleParked();
	}
};

xiNET.Controller.prototype.setCutOff = function(cutOff) {
	this.cutOff = cutOff;
	this.checkLinks();
};

xiNET.Controller.prototype.showSelfLinks = function(bool) {
	this.selfLinksShown = bool;
	this.checkLinks();
};

xiNET.Controller.prototype.showAmbig = function(bool) {
	this.ambigShown = bool;
	this.checkLinks();
};
*/
