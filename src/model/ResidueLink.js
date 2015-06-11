//		xiNET cross-link viewer
//		Copyright 2013 Rappsilber Laboratory, University of Edinburgh
//
//		author: Colin Combe
//		
//		ResidueLink.js
// 		the class representing a residue-residue link

"use strict";

ResidueLink.prototype = new xiNET.Link();

function ResidueLink(id, proteinLink, fromResidue, toResidue, xlvController, flip) {
    this.id = id;
    //    this.matches = new Array(0); //we don't initialise this here 
    // (save some memory in use case where there is no match info, only link info)
    this.controller = xlvController;
    this.proteinLink = proteinLink;
    this.fromResidue = fromResidue;
    this.toResidue = toResidue;
    this.intra = false;
    if (typeof this.proteinLink !== 'undefined') {
        if (this.proteinLink.fromProtein === this.proteinLink.toProtein) {
            this.intra = true;
        }
    }

    this.ambig = false;
    this.tooltip = this.id;
    if (flip === true) {
        this.flip = true;
    }
}

ResidueLink.prototype.getFromProtein = function() {
    return this.proteinLink.fromProtein;
};

ResidueLink.prototype.getToProtein = function() {
    return this.proteinLink.toProtein;
};

/*
ResidueLink.prototype.setSelected = function(select) {
    if (select && this.isSelected === false) {
        this.controller.selected.set(this.id, this);//ok, 
        this.isSelected = true;
        this.highlightLine.setAttribute("stroke", xiNET.selectedColour.toRGB());
		this.highlightLine.setAttribute("stroke-opacity", "0.7");
    }
    else if (select === false && this.isSelected === true) {
        this.controller.selected.remove(this.id);
        this.isSelected = false;
        this.highlightLine.setAttribute("stroke-opacity", "0");
        this.highlightLine.setAttribute("stroke", xiNET.highlightColour.toRGB());
 }
};

*/

ResidueLink.prototype.getFilteredMatches = function() {
    this.ambig = true;
    this.hd = false;
    this.intraMolecular = false; //i.e. type 1, loop link, intra peptide, internally linked peptide, etc 
    var filteredMatches = new Array();
    var count = this.matches? this.matches.length : 0;
    for (var i = 0; i < count; i++) {
        var match = this.matches[i][0];
        if (match.meetsFilterCriteria()) {
            filteredMatches.push(this.matches[i]);
            if (match.isAmbig() === false) {
                this.ambig = false;
            }
            if (match.hd === true) {
                this.hd = true;
            }            
            if (match.type === 1){
				this.intraMolecular = true;
			}
        }
    }
    return filteredMatches;
};

//used when filter changed
ResidueLink.prototype.check = function(filter) {
    if (this.controller.intraHidden && this.intra) {
        this.hide();
        return false;
    }
    if (this.proteinLink.hidden) {
        this.hide();
        return false;
    }
    if (typeof this.matches === 'undefined' || this.matches == null) {
        //~ if (this.proteinLink.sc >= this.controller.cutOff) {
            this.ambig = false;
			this.show();
            return true;
        //~ } else {
            //~ this.hide();
            //~ return false;
        //~ }
    }
    var filteredMatches = this.getFilteredMatches();
    
    //mathieu - filteredMatches is an array of Match objects, 
    // you can check aMatch.dataSetId to find out which data set each match belongs to
    
    var countFilteredMatches = filteredMatches.length;
    if (countFilteredMatches > 0) {
        /*this.tooltip = this.proteinLink.fromProtein.labelText + '_' + this.fromResidue
                    + "-"  + ((this.proteinLink.toProtein != null)? this.proteinLink.toProtein.labelText:'null') 
                    + '_' + this.toResidue + ' (' + countFilteredMatches;
        if (countFilteredMatches == 1) {
            this.tooltip += ' match)';
        } else {
            this.tooltip += ' matches)';
        }
        this.show();
        this.dashedLine(this.ambig);
        if (this.intra === true){
			if (this.hd === true) {
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
