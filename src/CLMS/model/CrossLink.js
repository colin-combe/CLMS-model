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
    return (this.fromProtein.is_decoy == true ||
        (this.toProtein && this.toProtein.is_decoy == true));
};

CLMS.model.CrossLink.prototype.isSelfLink = function() {
    return this.fromProtein && this.toProtein && this.fromProtein.targetProteinID === this.toProtein.targetProteinID; // mjg
};

CLMS.model.CrossLink.prototype.isLinearLink = function() {
    return this.matches_pp[0].match.isLinear();
};

CLMS.model.CrossLink.prototype.isMonoLink = function() {
    return this.matches_pp[0].match.isMonoLink();
};
