//      xiNET cross-link viewer
//      Copyright 2013 Rappsilber Laboratory, University of Edinburgh
//
//      author: Colin Combe
//
//      CLMS.model.CrossLink.js
//      the class representing a residue-residue link

CLMS.model.CrossLink = function (id, fromProtein, fromResidue, toProtein, toResidue) {
    this.id = id;
    this.matches_pp = [];
    this.filteredMatches_pp = [];

    this.fromProtein = fromProtein;
    this.fromResidue = fromResidue;
    this.toProtein = toProtein;
    this.toResidue = toResidue;
}

CLMS.model.CrossLink.prototype.isSelfLink = function() {
    return (this.fromProtein === this.toProtein);
}
/*
CLMS.model.CrossLink.prototype.hasConfirmedHomomultimer = function() {
    return this.confirmedHomomultimer;
}
*/
//used when filter changed
CLMS.model.CrossLink.prototype.check = function(filter) {
    if (this.filteredMatches_pp.length > 0) {return true;}
    else { return false;}
};

