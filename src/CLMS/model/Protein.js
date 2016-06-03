//		xiNET cross-link viewer
//		Copyright 2013 Rappsilber Laboratory, University of Edinburgh
//
//		authors: Lutz Fischer, Colin Combe
//
//		CLMS.model.Protein.js

CLMS.model.Protein = function (id, acc, name, desc) {
	this.id = id; // id may not be accession
	this.accession = acc;
	this.name = name;
	if (!this.name && acc) {
		this.name = acc;
	} else if (!this.name) {
		this.name = id;
	}
	this.description = desc;
	//links
	this.crossLinks = [];
	//annotation scheme
	//this.annotatedRegions = null;//TODO: maybe dont need this, but xiNET is using it
}

CLMS.model.Protein.subgraphs = []; // temop hack

//sequence = amino acids in UPPERCASE, digits or lowercase can be used for modification info
CLMS.model.Protein.prototype.setSequence = function(sequence){
	//check for labeling modifications in sequence now, we're about to lose this info
	if (/\d/.test(sequence)) {//is there a digit in the sequence?
		this.isotopicLabeling = '';// as in silac labelling
		if (sequence.indexOf('K4') !== -1)
			this.labeling += 'K4';
		if (sequence.indexOf('K6') !== -1)
			this.labeling += 'K6';
		if (sequence.indexOf('K8') !== -1)
			this.labeling += 'K8';
		if (sequence.indexOf('K10') !== -1)
			this.labeling += 'R4';
		if (sequence.indexOf('R6') !== -1)
			this.labeling += 'R6';
		if (sequence.indexOf('R8') !== -1)
			this.labeling += 'R8';
		if (sequence.indexOf('R10') !== -1)
			this.labeling += 'R10';
	}
	//remove modification site info from sequence
	this.sequence = sequence.replace(/[^A-Z]/g, '');
	this.size = this.sequence.length;
}

CLMS.model.Protein.prototype.isDecoy = function() {
	if (!this.name){
		return false;
	}
	else if (this.name.indexOf("DECOY_") === 0 || this.name.indexOf("REV") === 0) {
		return true;
	} else {
		return false;
	}
};

CLMS.model.Protein.prototype.readableId = function(protein){
	if (this.accession && this.name) {
		return "sp|" + this.accession + "|" + this.name;
	}
	else if (this.name) {
		return protein.name;
	}
	else if (this.accession) {
		return this.accession;
	}
	else {
		return this.id;
	}
}

/*CLMS.model.Protein.prototype.addLink = function(link) {
	if (!this.proteinLinks.has(link.id)) {
		this.proteinLinks.set(link.id, link);
	}
	if (link.isSelfLink() === true) {
		this.selfLink = link;
		//~ if (this.size) this.selfLink.initSelfLinkSVG();
	}
	if (link.toProtein === null) {
		this.linkerModifications = link;
	}
};*/

/*
 * following aren't in uml diagram but leave in for now -
 */

CLMS.model.Protein.prototype.countExternalLinks = function() {
	//~ if (this.isParked) {
		//~ return 0;
	//~ }
	/*var countExternal = 0;
	var c = this.proteinLinks.keys().length;
	for (var l = 0; l < c; l++) {
		var link = this.proteinLinks.values()[l];
		if (!link.selfLink())
		{
			if (link.check() === true) {
				countExternal++;
			}
		}
	}
	return countExternal;*/
	if (this.subgraph == null) {
		this.getSubgraph();
	}
	return  this.subgraph.links.size();
};

CLMS.model.Protein.prototype.getSubgraph = function(subgraphs) {
   if (this.subgraph == null) { // don't check for undefined here
		var subgraph = {
			nodes: new Map(),
			links: new Map()
		};
		subgraph.nodes.set(this.id, this);
		//~ if (this.isParked === false) {
			this.subgraph = this.addConnectedNodes(subgraph);
		//~ }
		CLMS.model.Protein.subgraphs.push(subgraph);
	}
	return this.subgraph;
};

CLMS.model.Protein.prototype.addConnectedNodes = function(subgraph) {
	//~ var links = this.crossLinks.values();
	for (crossLink of this.crossLinks) {
		//visible, non-self links only
		if (crossLink.fromProtein !== crossLink.toProtein && crossLink.check() === true) {
			var linkId = crossLink.fromProtein.id + "-" + crossLink.toProtein.id;
			var link = {"source":crossLink.fromProtein.id, "target":crossLink.toProtein.id};
			if (!subgraph.links.has(linkId)) {
				subgraph.links.set(linkId, link);
				var otherEnd;
				if (crossLink.fromProtein === this) {
					otherEnd = crossLink.toProtein;
				}
				else {
					otherEnd = crossLink.fromProtein;
				}
				if (otherEnd !== null) {
					if (!subgraph.nodes.has(otherEnd.id)) {
						subgraph.nodes.set(otherEnd.id, otherEnd);
						otherEnd.subgraph = subgraph;
						otherEnd.addConnectedNodes(subgraph);
					}
				}
			}
		}
	}
	return subgraph;
};
