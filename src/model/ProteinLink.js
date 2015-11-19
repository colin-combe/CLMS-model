//		xiNET Cross-link Viewer
//		Copyright 2013 Rappsilber Laboratory
//
//		author: Colin Combe
//
//		ProteinLink.js
// 		the class representing a protein-protein link

"use strict";

//static variable used to calculate width of the background line
ProteinLink.maxNoCrossLinks = 0;

//~ ProteinLink.prototype = new xiNET.Link();

function ProteinLink(id, fromP, toP) {
    this.id = id;
    this.crossLinks = d3.map();
    this.fromProtein = fromP; //its the object. not the ID number
    this.toProtein = toP; //its the object. not the ID number
    this.ambig = false;
    
    this.isSelected = false;
}

ProteinLink.prototype.isSelfLink = function() {
	return (this.fromProtein === this.toProtein);
}

ProteinLink.prototype.getFromProtein = function() {
    return this.fromProtein;
};

ProteinLink.prototype.getToProtein = function() {
    return this.toProtein;
};


/*
ProteinLink.prototype.setSelected = function(select) {
    if (select === true && this.isSelected === false) {
        this.controller.selectedLinks.set(this.id, this);//ok, 
        this.isSelected = true;
        this.highlightLine.setAttribute("stroke", xiNET.selectedColour.toRGB());
		this.highlightLine.setAttribute("stroke-opacity", "1");
		this.controller.linkSelectionChanged();
    }
    else if (select === false && this.isSelected === true) {
        this.controller.selectedLinks.remove(this.id);
        this.isSelected = false;
        this.highlightLine.setAttribute("stroke-opacity", "0");
        this.highlightLine.setAttribute("stroke", xiNET.highlightColour.toRGB());
		this.controller.linkSelectionChanged();
	}
};
*/


//its an array of match id's its going to return
ProteinLink.prototype.getFilteredMatches = function() {
    var resLinks = this.crossLinks.values();
    var resLinkCount = resLinks.length;
    var filteredMatches = d3.map();
    for (var i = 0; i < resLinkCount; i++) {
        var resLink = resLinks[i];
        var mCount = resLink.matches.length;
        for (var m = 0; m < mCount; m++) {
            var match = resLink.matches[m];
            if (match.meetsFilterCriteria()) {
                filteredMatches.set(match.id);
            }
        }
    }
    return filteredMatches.keys();
};

ProteinLink.prototype.check = function() {
	//currently no representation of monolinks at proteinLink level (hence checks for this.toProtein !== null)
	if (this.fromProtein.isParked || (this.toProtein !== null && this.toProtein.isParked)) {
        this.hide();
        return false;
    }
    if (this.selfLink() && this.controller.selfLinksShown === false) {
        if (this.fromProtein.form === 0) {
            this.hide();
        } else {
            var resLinks = this.crossLinks.values();
            var resLinkCount = resLinks.length;
            for (var i = 0; i < resLinkCount; i++) {
                resLinks[i].hide();
            }
        }
        return false;
    }
    if (this.hidden) {
        if (this.fromProtein.form === 0 && (this.toProtein !== null && this.toProtein.form === 0)) {
            this.hide();
        } else {
            var resLinks = this.crossLinks.values();
            var resLinkCount = resLinks.length;
            for (var i = 0; i < resLinkCount; i++) {
                resLinks[i].hide();
            }
        }
        return false;
    }
	var resLinks = this.crossLinks.values();
	var resLinkCount = resLinks.length;
	this.confirmedInterSelflink = false;
	if (this.fromProtein.form === 0 && (this.toProtein !== null && this.toProtein.form === 0)) {

		this.ambig = true;
		var filteredResLinks = [];
		var filteredMatches = d3.map();
		var altProteinLinks = d3.map();
		for (var i = 0; i < resLinkCount; i++) {
			var resLink = resLinks[i];
			var resLinkMeetsCriteria = false;
			if (resLink.matches){
				var mCount = resLink.matches.length;
				for (var m = 0; m < mCount; m++) {
					var match = resLink.matches[m][0];
					if (match.meetsFilterCriteria()) {
						if (match.hd === true) {
							this.confirmedInterSelflink = true;
						}
						if (resLinkMeetsCriteria === false) {
							resLinkMeetsCriteria = true;
							filteredResLinks.push(resLink);
						}
						filteredMatches.set(match.id, match);
						if (match.isAmbig()) {
							for (var mrl = 0; mrl < match.crossLinks.length; mrl++) {
								altProteinLinks.set(match.crossLinks[mrl].proteinLink.id);
							}
						}
						else {
							this.ambig = false;
						}
					}
				}
			}
			else {
				filteredResLinks.push(resLink);
			}
		}
		var filteredResLinkCount = filteredResLinks.length;
		if (filteredResLinkCount > 0) {
			this.tooltip = this.id + ', ' + filteredResLinkCount + ' unique cross-link';
			if (filteredResLinkCount > 1)
				this.tooltip += 's';
			this.tooltip += ' (' + filteredMatches.keys().length;
			if (filteredMatches.keys().length === 1) {
				this.tooltip += ' match)';
			} else {
				this.tooltip += ' matches)';
			}
			this.w = filteredResLinkCount * (45 / ProteinLink.maxNoCrossLinks);
			//acknowledge following line is a bit strange
			this.ambig = (this.ambig && (altProteinLinks.keys().length > 1));
			this.dashedLine(this.ambig);
			/*if (this.selfLink()) {

				if (this.confirmedInterSelflink) {
					this.line.setAttribute("stroke", xiNET.homodimerLinkColour.toRGB());			
					this.line.setAttribute("stroke-width", xiNET.homodimerLinkWidth);			
				}
				else {
					this.line.setAttribute("stroke", "black");	
					this.line.setAttribute("stroke-width", 1);			
				}
			}
			this.show();*/
			return true;
		}
		else {
			this.hide();
			return false;
		}
	}
	else {
		if (!(this.toProtein === null && this.fromProtein.form === 0)){
			var showedResResLink = false;
			//at least one end was in stick form
			for (var rl = 0; rl < resLinkCount; rl++) {
				if (resLinks[rl].check() === true) {
					showedResResLink = true;
				}
			}
			return showedResResLink; //is this most sensible thing to return? Or false becuase ProteinLink was not shown? 
		}
	}
};

ProteinLink.prototype.getOtherEnd = function(protein) {
    if (this.fromProtein === protein) {
        return this.toProtein;
    }
    else {
        return this.fromProtein;
    }
};
