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
};

CLMS.model.CrossLink.prototype.isDecoyLink = function () {
               return (this.fromProtein.is_decoy == true
                    || (this.toProtein && this.toProtein.is_decoy == true));
};

CLMS.model.CrossLink.prototype.isSelfLink = function () {
    //~ console.log(">> " + this.id, this.fromProtein, this.toProtein, this.fromProtein.realProteinID, this.toProtein.realProteinID);
    return this.fromProtein && this.toProtein && this.fromProtein.realProteinID === this.toProtein.realProteinID;   // mjg
    //~ console.log(">> " + this.id, this.fromProtein, this.toProtein, this.fromProtein.realProteinID, this.toProtein.realProteinID);
    //~ console.log(this.fromProtein == this.toProtein);
    //~ console.log(this.fromProtein && this.toProtein && this.fromProtein.realProteinID === this.toProtein.realProteinID);
    return this.fromProtein == this.toProtein;
};

CLMS.model.CrossLink.prototype.isLinearLink = function() {
    return this.matches_pp[0].match.linkPos1 === -1;
};
