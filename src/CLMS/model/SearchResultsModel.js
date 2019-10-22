//      CLMS-model
//      Copyright 2015 Rappsilber Laboratory, Edinburgh University
//
//      authors: Colin Combe, Martin Graham
//
//      SearchResultsModel.js


var CLMS = CLMS || {};

//For IE, which doesn't yet support values(). entries(), or keys() on ECMA6 Map
CLMS.arrayFromMapValues = function(map) {
    if (map.values && Array.from) {
        return Array.from(map.values());
    } else {
        var array = [];
        map.forEach(function(value, key, map) {
            array.push(value);
        });
        return array;
    }
};

CLMS.arrayFromMapEntries = function(map) {
    if (map.entries && Array.from) {
        return Array.from(map.entries());
    } else {
        var array = [];
        map.forEach(function(value, key, map) {
            array.push([key, value])
        });
        return array;
    }
};

CLMS.arrayFromMapKeys = function(map) {
    if (map.keys && Array.from) {
        return Array.from(map.keys());
    } else {
        var array = [];
        map.forEach(function(value, key, map) {
            array.push(key)
        });
        return array;
    }
};

CLMS.removeDomElement = function(child) {
    if (child && child.parentNode) {
        child.parentNode.removeChild(child);
    }
};

CLMS.model = CLMS.model || {};

CLMS.model.SearchResultsModel = Backbone.Model.extend({
    //http://stackoverflow.com/questions/19835163/backbone-model-collection-property-not-empty-on-new-model-creation
    defaults: function() {
        return {
            participants: new Map(), //map
            matches: [],
            crossLinks: new Map(), //map
            scoreExtent: null,
            searches: new Map(),
            decoysPresent: false,
            ambiguousPresent: false,
            crossLinksPresent: false,
            linearsPresent: false, // TODO
            scoreSets: new Set(),
            selectedScoreSet: null
        };
    },

    commonRegexes: {
        uniprotAccession: /^[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/,
        notUpperCase: /[^A-Z]/g,
        decoyNames: /(REV_)|(RAN_)|(DECOY_)|(DECOY:)|(reverse_)/,
    },

    //our SpectrumMatches are constructed from the rawMatches and peptides arrays in this json
    parseJSON: function(json) {
        if (json) {
            var self = this;
            this.set("sid", json.sid);

            //modifications
            var modifications = [];
            var modCount = json.modifications.length;
            for (var m = 0; m < modCount; m++) {
                var mod = json.modifications[m];
                modifications.push({
                    aminoAcids: mod.residues.split(''),
                    id: mod.mod_name,
                    mass: mod.mass
                });
            }
            this.set("modifications", modifications);

            //search meta data
            var searches = new Map();
            for (var propertyName in json.searches) {
                var search = json.searches[propertyName];
                searches.set(propertyName, search);
            }
            this.set("searches", searches);

            /*            var getResiduesFromEnzymeDescription = function(regexMatch, residueSet) {
                            if (regexMatch && regexMatch.length > 1) {
                                var resArray = regexMatch[1].split(',');
                                var resCount = resArray.length;
                                for (var r = 0; r < resCount; r++) {
                                    residueSet.add({
                                        aa: resArray[r],
                                        postConstraint: regexMatch[2] ? regexMatch[2].split(',') : null
                                    });
                                }
                            }
                        };


                        //enzyme specificity
                        var postAaSet = new Set();
                        var aaConstrainedCTermSet = new Set();
                        var aaConstrainedNTermSet = new Set();
                        var searchArray = CLMS.arrayFromMapValues(searches);
                        var searchCount = searchArray.length;
                        for (var s = 0; s < searchCount; s++) {
                            var search = searchArray[s];
                            var enzymes = search.enzymes;
                            var enzymeCount = enzymes.length;
                            for (var e = 0; e < enzymeCount; e++) {
                                var enzymeDescription = enzymes[e].description;

                                var postAARegex = /PostAAConstrainedDigestion:DIGESTED:(.*?);ConstrainingAminoAcids:(.*?);/g;
                                var postAAMatch = postAARegex.exec(enzymeDescription);
                                getResiduesFromEnzymeDescription(postAAMatch, postAaSet);

                                var cTermRegex = /CTERMDIGEST:(.*?);/g;
                                var ctMatch = cTermRegex.exec(enzymeDescription);
                                getResiduesFromEnzymeDescription(ctMatch, aaConstrainedCTermSet);

                                var nTermRegex = /NTERMDIGEST:(.*?);/g;
                                var ntMatch = nTermRegex.exec(enzymeDescription);
                                getResiduesFromEnzymeDescription(ntMatch, aaConstrainedNTermSet);

                            }
                        }

                        var addEnzymeSpecificityResidues = function(residueSet, type) {
                            var resArray = CLMS.arrayFromMapValues(residueSet);
                            var resCount = resArray.length;
                            for (var r = 0; r < resCount; r++) {
                                enzymeSpecificity.push({
                                    aa: resArray[r].aa,
                                    type: type,
                                    postConstraint: resArray[r].postConstraint
                                });
                            }
                        };

                        var enzymeSpecificity = [];
                        addEnzymeSpecificityResidues(postAaSet, "DIGESTIBLE"); //"Post AA constrained");
                        addEnzymeSpecificityResidues(aaConstrainedCTermSet, "DIGESTIBLE"); // "AA constrained c-term");
                        addEnzymeSpecificityResidues(aaConstrainedNTermSet, "DIGESTIBLE"); // "AA constrained n-term");
                        this.set("enzymeSpecificity", enzymeSpecificity);

                        //crosslink specificity
                        var linkableResSet = new Set();
                        for (var s = 0; s < searchCount; s++) {
                            var search = searchArray[s];
                            var crosslinkers = search.crosslinkers || [];
                            var crosslinkerCount = crosslinkers.length;
                            for (var cl = 0; cl < crosslinkerCount; cl++) {
                                var crosslinkerDescription = crosslinkers[cl].description;
                                var linkedAARegex = /LINKEDAMINOACIDS:(.*?);/g;
                                var result = null;
                                while ((result = linkedAARegex.exec(crosslinkerDescription)) !== null) {
                                    var resArray = result[1].split(',');
                                    var resCount = resArray.length;
                                    for (var r = 0; r < resCount; r++) {
                                        var resRegex = /([A-Z])(.*)?/
                                        var resMatch = resRegex.exec(resArray[r]);
                                        if (resMatch) {
                                            linkableResSet.add(resMatch[1]);
                                        }
                                    }
                                }
                            }
                        }

                        this.set("crosslinkerSpecificity", CLMS.arrayFromMapValues(linkableResSet));
            */
            //saved config should end up including filter settings not just xiNET layout
            this.set("xiNETLayout", json.xiNETLayout);

            //spectrum sources
            var spectrumSources = new Map();
            var specSource;
            var specCount = json.spectra.length;
            for (var sp = 0; sp < specCount; sp++) {
                specSource = json.spectra[sp];
                spectrumSources.set(+specSource.id, specSource);
            }
            this.set("spectrumSources", spectrumSources);

            var participants = this.get("participants");
            if (json.proteins) {
                var proteins = json.proteins;
                var proteinCount = proteins.length;
                var participant;
                for (var p = 0; p < proteinCount; p++) {
                    participant = proteins[p];
                    this.initProtein(participant, json);
                    participants.set(participant.id, participant);
                }
            }
            this.initDecoyLookup();

            //peptides
            var peptides = new Map();
            if (json.peptides) {
                var peptideArray = json.peptides;
                var pepCount = peptideArray.length;
                var peptide;
                for (var pep = 0; pep < pepCount; pep++) {
                    this.commonRegexes.notUpperCase.lastIndex = 0;
                    peptide = peptideArray[pep];
                    peptide.sequence = peptide.seq_mods.replace(this.commonRegexes.notUpperCase, '');
                    peptides.set(peptide.u_id + "_" + peptide.id, peptide); // concat upload_id and peptide.id

                    for (var p = 0; p < peptide.prt.length; p++) {
                        if (peptide.is_decoy[p]) {
                              participants.get(peptide.prt[p]).is_decoy = true;
                        }
                    }
                }
            }

            var crossLinks = this.get("crossLinks");

            var minScore = undefined;
            var maxScore = undefined;
            if (json.identifications) {
                var matches = this.get("matches");

                var l = json.identifications.length;
                for (var i = 0; i < l; i++) {
                    var match = new CLMS.model.SpectrumMatch(this, participants, crossLinks, peptides, json.identifications[i]);

                    matches.push(match);

                    if (maxScore === undefined || match.score() > maxScore) {
                        maxScore = match.score();
                    } else if (minScore === undefined || match.score() < minScore) {
                        minScore = match.score();
                    }
                }
            }

            console.log("score sets:", this.get("scoreSets"));

            this.set("minScore", minScore);
            this.set("maxScore", maxScore);

            var participantArray = CLMS.arrayFromMapValues(participants);
            // only count real participants towards participant count (which is used as cut-off further on)
            var targetParticipantArray = participantArray.filter(function(p) {
                return !p.is_decoy;
            });
            var participantCount = targetParticipantArray.length;

            for (var p = 0; p < participantCount; p++) {
                var participant = targetParticipantArray[p];
                var uniprot = json.interactors ? json.interactors[participant.accession] : null;
                participant.uniprot = uniprot;
            }

            CLMSUI.vent.trigger("uniprotDataParsed", self);


            /*
                            function processUniProtTxt(p, json){
                                p.uniprot = json;
                                participantCount--;
                                if (participantCount === 0) {
                                    CLMSUI.vent.trigger("uniprotDataParsed", self);
                                }
                            }

                            function uniProtTxt (p){
                                self.commonRegexes.uniprotAccession.lastIndex = 0;
                                var regexMatch = self.commonRegexes.uniprotAccession.exec(p.accession);
                                if (!p.is_decoy && regexMatch) {
                                    var url = "https://www.ebi.ac.uk/proteins/api/features/" + regexMatch[0] + ".json";
                                    d3.json(url, function (json) {
                                        processUniProtTxt(p, json);
                                    });
                                } else {
                                    //not protein, no accession or isDecoy
                                    participantCount--;
                                    if (participantCount === 0) {
                                        CLMSUI.vent.trigger("uniprotDataParsed", self);
                                    }
                                }
                            }

                            if (true){//participantCount < 101 && participantCount > 0) {
                                //var participantArray = CLMS.arrayFromMapValues(realParticipants);
                                var invariantCount = participantCount;
                                for (var p = 0; p < invariantCount; p++ ){
                                    uniProtTxt(realParticipantArray[p]);
                                }
                            }
                            else {
            					CLMSUI.vent.trigger("uniprotDataParsed", self);
                            }*/

        }

    },

    //adds some attributes we want to protein object
    initProtein: function(protObj, json) {
        if (!protObj.crossLinks) {
            protObj.crossLinks = [];
        }
        var decoyNames = /(REV_)|(RAN_)|(DECOY_)|(DECOY:)|(reverse_)/;
        if (decoyNames.exec(protObj.name) || decoyNames.exec(protObj.id)) {
            this.set("decoysPresent", true);
            protObj.is_decoy = true;
            protObj.sequence = "";
        } else {
            protObj.is_decoy = false;
            var accCheck = protObj.accession.match(this.commonRegexes.uniprotAccession);
            if (protObj.seq_mods) {
                this.commonRegexes.notUpperCase.lastIndex = 0;
                protObj.sequence = protObj.seq_mods.replace(this.commonRegexes.notUpperCase, '');
            } else if (accCheck != null) {
                protObj.sequence = json.interactors[protObj.accession].sequence;
            }
            if (protObj.sequence) protObj.size = protObj.sequence.length;
        }

        protObj.getMeta = function (field) {
            var x;
            if (this.meta) {
                x = this.meta[field];
            }
            return x;
        }.bind(protObj);
    },

    //TODO
    /*        getDigestibleResiduesAsFeatures: function (participant){
                var digestibleResiduesAsFeatures = [];

                var sequence = participant.sequence;
                var seqLength = sequence.length;
                var specificity = this.get("enzymeSpecificity");

                var specifCount = specificity.length;
                for (var i = 0; i < specifCount; i++){
                    var spec = specificity[i];
                    for (var s = 0; s < seqLength; s++) {
                        if (sequence[s] == spec.aa) {
    						if (!spec.postConstraint || !sequence[s+1] || spec.postConstraint.indexOf(sequence[s+1]) == -1) {
    							digestibleResiduesAsFeatures.push(
    								{
    									begin: s + 1,
    									end: s + 1,
    									name: "DIGESTIBLE",
    									protID: participant.id,
    									id: participant.id+" "+spec.type+(s+1),
    									category: "AA",
    									type: "DIGESTIBLE"
    								}
    							);
    						}
                        }
                    }
                }
                //console.log("sp:", specificity, "df:", digestibleResiduesAsFeatures);
                return digestibleResiduesAsFeatures;
            },

            getCrosslinkableResiduesAsFeatures: function(participant){
                var crosslinkableResiduesAsFeatures = [];

                var sequence = participant.sequence;
                var seqLength = sequence.length;
                var specificity = this.get("crosslinkerSpecificity");

                var specifCount = specificity.length;
                for (var i = 0; i < specifCount; i++){
                    var spec = specificity[i];
                    for (var s = 0; s < seqLength; s++) {
                        if (sequence[s] == spec) {
                            crosslinkableResiduesAsFeatures.push(
                                {
                                    begin: s + 1,
                                    end: s + 1,
                                    name: "CROSS-LINKABLE",
                                    protID: participant.id,
                                    id: participant.id+" Cross-linkable residue"+(s+1),
                                    category: "AA",
                                    type: "CROSS-LINKABLE"
                                }
                            );
                        }
                    }
                }
                //console.log("sp:", specificity, "clf:", crosslinkableResiduesAsFeatures);
                return crosslinkableResiduesAsFeatures;
            },
    */
    initDecoyLookup: function(prefixes) {
        // Make map of reverse/random decoy proteins to real proteins
        prefixes = prefixes || ["REV_", "RAN_", "DECOY_", "DECOY:", "reverse_"];
        var prots = CLMS.arrayFromMapValues(this.get("participants"));
        var nameMap = d3.map();
        var accessionMap = d3.map();
        prots.forEach(function(prot) {
            nameMap.set(prot.name, prot.id);
            accessionMap.set(prot.accession, prot.id);
            prot.targetProteinID = prot.id; // this gets overwritten for decoys in next bit, mjg
        });
        var decoyToTargetMap = d3.map();
        var decoys = prots.filter(function(p) {
            return p.is_decoy;
        });
        decoys.forEach(function(decoyProt) {
            prefixes.forEach(function(pre) {
                var targetProtIDByName = nameMap.get(decoyProt.name.substring(pre.length));
                if (decoyProt.accession) {
                    var targetProtIDByAccession = accessionMap.get(decoyProt.accession.substring(pre.length));
                    if (targetProtIDByName && targetProtIDByAccession) {
                        decoyProt.targetProteinID = targetProtIDByName; // mjg
                    }
                } else if (targetProtIDByName) {
                    decoyProt.targetProteinID = targetProtIDByName; // mjg
                }
            });
        });

        this.targetProteinCount = prots.length - decoys.length;
    },

    isMatchingProteinPair: function(prot1, prot2) {
        return prot1 && prot2 && prot1.targetProteinID === prot2.targetProteinID;
    },

    isMatchingProteinPairFromIDs: function(prot1ID, prot2ID) {
        if (prot1ID === prot2ID) {
            return true;
        }
        var participants = this.get("participants");
        var prot1 = participants.get(prot1ID);
        var prot2 = participants.get(prot2ID);
        return this.isMatchingProteinPair(prot1, prot2);
    },

    isSelfLink: function(crossLink) {
        return crossLink.isSelfLink();
    },

    getSearchRandomId: function(match) {
        var searchId = match.searchId;
        var searchMap = this.get("searches");
        var searchData = searchMap.get(searchId);
        var randId = searchData.random_id;
        return randId;
    },

    attributeOptions: [{
            linkFunc: function(link) {
                return [link.filteredMatches_pp.length];
            },
            unfilteredLinkFunc: function(link) {
                return [link.matches_pp.length];
            },
            id: "MatchCount",
            label: "Cross-Link Match Count",
            decimalPlaces: 0
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.score();
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.score();
                });
            },
            id: "Score",
            label: "Match Score",
            decimalPlaces: 2,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.precursorMZ;
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.precursorMZ;
                });
            },
            id: "MZ",
            label: "Match Precursor m/z",
            decimalPlaces: 4,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.precursorCharge;
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.precursorCharge;
                });
            },
            id: "Charge",
            label: "Match Precursor Charge (z)",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.calcMass();
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.calcMass();
                });
            },
            id: "CalcMass",
            label: "Match Calculated Mass (m)",
            decimalPlaces: 4,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.massError();
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.massError();
                });
            },
            id: "MassError",
            label: "Match Mass Error",
            decimalPlaces: 4,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return Math.min(m.pepPos[0].length, m.pepPos[1].length);
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return Math.min(m.pepPos[0].length, m.pepPos[1].length);
                });
            },
            id: "SmallPeptideLen",
            label: "Match Smaller Peptide Length (AA)",
            decimalPlaces: 0,
            matchLevel: true
        },
        // {
        //     linkFunc: function (link) { return link.filteredMatches_pp.map (function (m) { var p = m.match.precursor_intensity; return isNaN(p) ? undefined : p; }); },
        //     unfilteredLinkFunc: function (link) { return link.matches_pp.map (function (m) { var p = m.match.precursor_intensity; return isNaN(p) ? undefined : p; }); },
        //     id: "PrecursorIntensity", label: "Match Precursor Intensity", decimalPlaces: 0, matchLevel: true,
        // 	valueFormat: d3.format(".1e"), logAxis: true, logStart: 1000
        // },
        // {
        //     linkFunc: function (link) { return link.filteredMatches_pp.map (function (m) { return m.match.elution_time_start; }); },
        //     unfilteredLinkFunc: function (link) { return link.matches_pp.map (function (m) { return m.match.elution_time_start; }); },
        //     id: "ElutionTimeStart", label: "Elution Time Start", decimalPlaces: 2, matchLevel: true
        // },
        // {
        //     linkFunc: function (link) { return link.filteredMatches_pp.map (function (m) { return m.match.elution_time_end; }); },
        //     unfilteredLinkFunc: function (link) { return link.matches_pp.map (function (m) { return m.match.elution_time_end; }); },
        //     id: "ElutionTimeEnd", label: "Elution Time End", decimalPlaces: 2, matchLevel: true
        // },
        {
            linkFunc: function(link, option) {
                //return link.isLinearLink() ? [] : [this.model.getSingleCrosslinkDistance(link, null, null, option)];
                return link.isLinearLink() ? [] : [link.getMeta("distance")];
            },
            unfilteredLinkFunc: function(link, option) {
                //return link.isLinearLink() ? [] : [this.model.getSingleCrosslinkDistance(link, null, null, option)];
                return link.isLinearLink() ? [] : [link.getMeta("distance")];
            },
            id: "Distance",
            label: "Cross-Link Cα-Cα Distance (Å)",
            decimalPlaces: 2,
            maxVal: 90,
        },
    ],

});
