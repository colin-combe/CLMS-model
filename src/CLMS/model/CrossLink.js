//      xiNET cross-link viewer
//      Copyright 2013 Rappsilber Laboratory, University of Edinburgh
//
//      author: Colin Combe
//
//      CLMS.model.CrossLink.js
//      the class representing a residue-residue link

CLMS.model.CrossLink = function(id, fromProtein, fromResidue, toProtein, toResidue) {
    this.id = id;
    this.matches_pp = [];
    this.filteredMatches_pp = [];

    this.fromProtein = fromProtein;
    this.fromResidue = fromResidue;
    this.toProtein = toProtein;
    this.toResidue = toResidue;
};

CLMS.model.CrossLink.prototype.isDecoyLink = function() {
    var fd = this.fromProtein.is_decoy == true;
    var td = this.toProtein? this.toProtein.is_decoy == true : false;
    return (fd ||
        td);
};

CLMS.model.CrossLink.prototype.isSelfLink = function() {
    return this.fromProtein && this.toProtein && this.fromProtein.targetProteinID === this.toProtein.targetProteinID; // mjg
};

CLMS.model.CrossLink.prototype.isLinearLink = function() {
    return this.matches_pp[0].match.isLinear();//match.linkPos1 === -1 || (this.matches_pp[0].match.matchedPeptides[1] && this.matches_pp[0].match.matchedPeptides[1].pos[0] === -1); //hack required by links only CSV, look at again
};
