//		xiNET cross-link viewer
//		Copyright 2013 Rappsilber Laboratory, University of Edinburgh
//
//		author: Colin Combe
//
//		CLMS.model.CrossLink.js
// 		the class representing a residue-residue link

"use strict";

//CLMS.model.CrossLink.prototype = new xiNET.Link();

CLMS.model.CrossLink = function (id, proteinLink, fromResidue, toResidue) {
	this.id = id;
	//    this.matches = new Array(0); //we don't initialise this here
	// (save some memory in use case where there is no match info, only link info)
	this.proteinLink = proteinLink;
	this.fromResidue = fromResidue;
	this.toResidue = toResidue;

	this.ambig = false;
}

CLMS.model.CrossLink.prototype.isSelfLink = function() {
	return (this.proteinLink.fromProtein === this.proteinLink.toProtein);
}

CLMS.model.CrossLink.prototype.isAmbiguous = function() {
	return this.ambig;
}

CLMS.model.CrossLink.prototype.hasConfirmedHomomultimer = function() {
	return this.confirmedHomomultimer;
}

CLMS.model.CrossLink.prototype.getFromProtein = function() {
	return this.proteinLink.fromProtein;
};

CLMS.model.CrossLink.prototype.getToProtein = function() {
	return this.proteinLink.toProtein;
};

CLMS.model.CrossLink.prototype.getFilteredMatches = function() {
	this.ambig = true;
	this.confirmedHomomultimer = false;
	this.intraMolecular = false; //i.e. type 1, loop link, intra peptide, internally linked peptide, etc
	var filteredMatches = [];
	var count = this.matches? this.matches.length : 0;
	for (var i = 0; i < count; i++) {
		var match = this.matches[i][0];
		if (match.meetsFilterCriteria()) {
			filteredMatches.push(this.matches[i]);
			if (match.isAmbig() === false) {
				this.ambig = false;
			}
			if (match.hd === true) {
				this.confirmedHomomultimer = true;
			}
			if (match.type === 1){
				this.intraMolecular = true;
			}
		}
	}
	return filteredMatches;
};

//used when filter changed
CLMS.model.CrossLink.prototype.check = function(filter) {
	if (this.controller.selfLinkShown === false && this.selfLink()) {
		this.hide();
		return false;
	}
	if (this.proteinLink.hidden) {
		this.hide();
		return false;
	}
	if (typeof this.matches === 'undefined' || this.matches == null) {
		this.ambig = false;
		this.show();
		return true;
	}
	var filteredMatches = this.getFilteredCLMS.model.Matches();
	var countFilteredMatches = filteredCLMS.model.Matches.length;
	if (countFilteredMatches > 0) {
		/*this.tooltip = this.proteinLink.fromProtein.labelText + '_' + this.fromResidue
					+ "-"  + ((this.proteinLink.toProtein != null)? this.proteinLink.toProtein.labelText:'null')
					+ '_' + this.toResidue + ' (' + countFilteredCLMS.model.Matches;
		if (countFilteredCLMS.model.Matches == 1) {
			this.tooltip += ' match)';
		} else {
			this.tooltip += ' matches)';

		this.show();
		this.dashedLine(this.ambig);
		if (this.controller.groups.values().length > 1 && this.controller.groups.values().length < 5) {
			var groupCheck = new Set();
			for (var i=0; i < countFilteredCLMS.model.Matches; i++) {
				var match = filteredCLMS.model.Matches[i][0];//fix this weirdness with array?
				groupCheck.add(match.group);
			}
			if (groupCheck.values().length == 1){
				var c = this.controller.linkColours(groupCheck.values()[0]);
				this.line.setAttribute("stroke", c);
		  		this.line.setAttribute("transform", "scale (1 1)");
				this.highlightLine.setAttribute("transform", "scale (1 1)");
			}
			else  {
				this.line.setAttribute("stroke", "#000000");
				if (this.selfLink()){
					this.line.setAttribute("transform", "scale (1 -1)");
					this.highlightLine.setAttribute("transform", "scale (1 -1)");
				}
			}
			//else this.line.setAttribute("stroke", "purple");//shouldn't happen
		}
		else if (this.selfLink() === true && this.colour == null){
			if (this.confirmedHomomultimer === true) {
				this.line.setAttribute("stroke", xiNET.homodimerLinkColour.toRGB());
				this.line.setAttribute("transform", "scale(1, -1)");
				this.line.setAttribute("stroke-width", xiNET.homodimerLinkWidth);
				this.highlightLine.setAttribute("transform", "scale(1, -1)");
			}
			else {
				this.line.setAttribute("stroke", xiNET.defaultSelfLinkColour.toRGB());
				this.line.setAttribute("transform", "scale(1, 1)");
				this.line.setAttribute("stroke-width", xiNET.linkWidth);
				this.highlightLine.setAttribute("transform", "scale(1, 1)");
			}

		}*/


		return true;
	}
	else {
		//~ this.hide();
		return false;
	}
};

