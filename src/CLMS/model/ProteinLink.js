//		xiNET Cross-link Viewer
//		Copyright 2013 Rappsilber Laboratory
//
//		author: Colin Combe
//
//		CLMS.model.ProteinLink.js
// 		the class representing a protein-protein link

//~ CLMS.model.ProteinLink.prototype = new xiNET.Link();

CLMS.model.ProteinLink = function (id, fromP, toP) {
	this.id = id;
	this.crossLinks = new Map();
	this.fromProtein = fromP; //its the object. not the ID number
	this.toProtein = toP; //its the object. not the ID number
	this.ambig = false;

	this.isSelected = false;
}

//static variable used to calculate width of the background line
CLMS.model.ProteinLink.maxNoCrossLinks = 0;

CLMS.model.ProteinLink.prototype.isSelfLink = function() {
	return (this.fromProtein === this.toProtein);
}

CLMS.model.ProteinLink.prototype.isAmbiguous = function() {
	return this.ambig;
}

CLMS.model.ProteinLink.prototype.hasConfirmedHomomultimer = function() {
	return this.confirmedHomomultimer;
}
CLMS.model.ProteinLink.prototype.getFromProtein = function() {
	return this.fromProtein;
};

CLMS.model.ProteinLink.prototype.getToProtein = function() {
	return this.toProtein;
};


/*
CLMS.model.ProteinLink.prototype.setSelected = function(select) {
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
CLMS.model.ProteinLink.prototype.getFilteredMatches = function() {
	var resLinks = this.crossLinks.values();
	var resLinkCount = resLinks.length;
	var filteredMatches = new Map();
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

CLMS.model.ProteinLink.prototype.check = function() {
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
	this.confirmedHomomultimer = false;
	if (this.fromProtein.form === 0 && (this.toProtein !== null && this.toProtein.form === 0)) {

		this.ambig = true;
		var filteredResLinks = [];
		var filteredMatches = new Map();
		var altProteinLinks = new Map();
		for (var i = 0; i < resLinkCount; i++) {
			var resLink = resLinks[i];
			var resLinkMeetsCriteria = false;
			if (resLink.matches){
				var mCount = resLink.matches.length;
				for (var m = 0; m < mCount; m++) {
					var match = resLink.matches[m][0];
					if (match.meetsFilterCriteria()) {
						if (match.hd === true) {
							this.confirmedHomomultimer = true;
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
			this.tooltip += ' (' + filteredCLMS.model.SpectrumMatches.keys().length;
			if (filteredCLMS.model.SpectrumMatches.keys().length === 1) {
				this.tooltip += ' match)';
			} else {
				this.tooltip += ' matches)';
			}
			this.w = filteredResLinkCount * (45 / CLMS.model.ProteinLink.maxNoCrossLinks);
			//acknowledge following line is a bit strange
			this.ambig = (this.ambig && (altCLMS.model.ProteinLinks.keys().length > 1));
			this.dashedLine(this.ambig);
			/*if (this.selfLink()) {

				if (this.confirmedHomomultimer) {
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
			return showedResResLink; //is this most sensible thing to return? Or false becuase CLMS.model.ProteinLink was not shown?
		}
	}
};

CLMS.model.ProteinLink.prototype.getOtherEnd = function(protein) {
	if (this.fromProtein === protein) {
		return this.toProtein;
	}
	else {
		return this.fromProtein;
	}
};
