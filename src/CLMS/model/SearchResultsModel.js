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
            manualValidatedPresent: false,
            unvalidatedPresent: false
        };
    },

    commonRegexes: {
        uniprotAccession: /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/,
        notUpperCase: /[^A-Z]/g,
        decoyNames: /(REV_)|(RAN_)|(DECOY_)|(DECOY:)|(reverse_)/,
    },

    //our SpectrumMatches are constructed from the rawMatches and peptides arrays in this json
    parseJSON: function(json) {
        if (json) {
            var self = this;
            this.set("sid", json.sid);

            //search meta data
            var searches = new Map();
            for (var propertyName in json.searches) {
                var search = json.searches[propertyName];
                searches.set(propertyName, search);
            }
            this.set("searches", searches);

            var getResiduesFromEnzymeDescription = function(regexMatch, residueSet) {
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
            // TODO _ seems like theres a duplication problem here if multiple searches are aggregated

            //eliminate duplication first
            var enzymeDescriptions = new Set();
            for (var search of searches.values()) {
                for (var enzyme of search.enzymes) {
                    enzymeDescriptions.add(enzyme.description);
                }
            }

            var postAaSet = new Set();
            var aaConstrainedCTermSet = new Set();
            var aaConstrainedNTermSet = new Set();

            for (var enzymeDescription of enzymeDescriptions) {
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
            /*var linkableResSet = new Set();
            for (var s = 0; s < searchCount; s++) {
                var search = searchArray[s];
                var crosslinkers = search.crosslinkers || [];
                var crosslinkerCount = crosslinkers.length;
                for (var cl = 0; cl < crosslinkerCount; cl++) {
                    var crosslinkerDescription = crosslinkers[cl].description;
                    var linkedAARegex = /LINKEDAMINOACIDS:(.*?)(?:;|$)/g;
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
            this.set("crosslinkerSpecificity", CLMS.arrayFromMapValues(linkableResSet));*/

            var linkableResSets = {};
            for (var search of searches.values()) {
                var crosslinkers = search.crosslinkers || [];

                crosslinkers.forEach(function(crosslinker) {
                    var crosslinkerDescription = crosslinker.description;
                    var crosslinkerName = crosslinker.name;
                    var linkedAARegex = /LINKEDAMINOACIDS:(.*?)(?:;|$)/g; // capture both sets if > 1 set
                    // //console.log("cld", crosslinkerDescription);
                    var resSet = linkableResSets[crosslinkerName];

                    if (!resSet) {
                        resSet = {
                            searches: new Set(),
                            linkables: [],
                            name: crosslinkerName,
                            id: +crosslinker.id
                        };
                        linkableResSets[crosslinkerName] = resSet;
                    }
                    resSet.searches.add(search.id);

                    var result = null;
                    var i = 0;
                    while ((result = linkedAARegex.exec(crosslinkerDescription)) !== null) {
                        if (!resSet.linkables[i]) {
                            resSet.linkables[i] = new Set();
                        }

                        var resArray = result[1].split(',');
                        resArray.forEach(function(res) {
                            var resRegex = /(cterm|nterm|[A-Z])(.*)?/i;
                            var resMatch = resRegex.exec(res);
                            if (resMatch) {
                                resSet.linkables[i].add(resMatch[1].toUpperCase());
                            }
                        });
                        i++;
                    }

                    if (i === 0) {
                        resSet.linkables.push (new Set(["*"]));  // in case non-covalent
                    }

                    resSet.heterobi = resSet.heterobi || (i > 1);
                });
            }

            //console.log("CROSS", linkableResSets);
            this.set("crosslinkerSpecificity", linkableResSets);

            //saved config should end up including filter settings not just xiNET layout
            this.set("xiNETLayout", json.xiNETLayout);

            //spectrum sources
            var spectrumSources = new Map();
            var specSource;
            for (var propertyName in json.spectrumSources) {
                specSource = json.spectrumSources[propertyName];
                spectrumSources.set(+specSource.id, specSource.name);
            }
            this.set("spectrumSources", spectrumSources);

            //peak list files
            var peakListFiles = new Map();
            var plFile;
            for (var propertyName in json.peakListFiles) {
                plFile = json.peakListFiles[propertyName];
                peakListFiles.set(+plFile.id, plFile.name);
            }
            this.set("peakListFiles", peakListFiles);

            var participants = this.get("participants");
            if (json.proteins) {
                var proteins = json.proteins;
                var proteinCount = proteins.length;
                var participant;
                for (var p = 0; p < proteinCount; p++) {
                    participant = proteins[p];
                    this.initProtein(participant);
                    participants.set(participant.id, participant);
                }
            }
            this.initDecoyLookup();

            var participantArr = CLMS.arrayFromMapValues(participants);

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
                    peptides.set(peptide.id, peptide);
                }
            }

            var crossLinks = this.get("crossLinks");

            var rawMatches = json.rawMatches;
            var minScore = undefined;
            var maxScore = undefined;

            // moved from modelUtils 05/08/19
            // Connect searches to proteins, and add the protein set as a property of a search in the clmsModel, MJG 17/05/17
            var searchMap = this.getProteinSearchMap (json.peptides, json.rawMatches || json.identifications);
            this.get("searches").forEach(function(value, key) {
                value.participantIDSet = searchMap[key];
            });


            if (rawMatches) {
                var matches = this.get("matches");

                var l = rawMatches.length,
                    match;
                for (var i = 0; i < l; i++) {
                    //this would need updated for trimeric or higher order crosslinks
                    var rawMatch = rawMatches[i];
                    var rawMatchArray = [rawMatch];

                    if (rawMatch.ty.length === undefined) {
                        if ((i < (l - 1)) && rawMatch.id == rawMatches[i + 1].id) {
                            rawMatchArray.push (rawMatches[i + 1]);
                            i++;
                        }
                    } else {
                        var size = rawMatch.ty.length;
                        if (size > 1) {
                            for (var j = 1; j < size; j++) {
                                rawMatchArray.push ({pi: rawMatch.pi[j], lp: rawMatch.lp[j]});
                            }
                        }
                        rawMatch.ty = rawMatch.ty[0];
                        rawMatch.pi = rawMatch.pi[0];
                        rawMatch.lp = rawMatch.lp[0];
                        //rawMatch.cl = rawMatch.cl[0]; // PHP/SQL now returns crosslinker_id as single value, not array
                    }

                    match = new CLMS.model.SpectrumMatch(this, participants, crossLinks, peptides, rawMatchArray);
                    matches.push(match);

                    if (maxScore === undefined || match.score() > maxScore) {
                        maxScore = match.score();
                    } else if (minScore === undefined || match.score() < minScore) {
                        minScore = match.score();
                    }
                }
            }

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
                var uniprot = json.interactors ? json.interactors[participant.accession.split('-')[0]] : null;
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
                                    uniProtTxt(targetParticipantArray[p]);
                                }
                            }
                            else {
                                CLMSUI.vent.trigger("uniprotDataParsed", self);
                            }*/

        }

    },

    // Connect searches to proteins
    getProteinSearchMap: function(peptideArray, rawMatchArray) {
        var pepMap = d3.map(peptideArray, function(peptide) {
            return peptide.id;
        });
        var searchMap = {};
        rawMatchArray = rawMatchArray || [];
        rawMatchArray.forEach(function(rawMatch) {
            var peptideIDs = rawMatch.pi ? rawMatch.pi : [rawMatch.pi1, rawMatch.pi2];
            peptideIDs.forEach (function (pepID) {
                if (pepID) {
                    var prots = pepMap.get(pepID).prt;
                    var searchToProts = searchMap[rawMatch.si];
                    if (!searchToProts) {
                        var newSet = d3.set();
                        searchMap[rawMatch.si] = newSet;
                        searchToProts = newSet;
                    }
                    prots.forEach(function(prot) {
                        searchToProts.add(prot);
                    });
                }
            });
        });
        return searchMap;
    },

    //adds some attributes we want to protein object
    initProtein: function(protObj) {
        if (protObj.seq_mods) {
            this.commonRegexes.notUpperCase.lastIndex = 0;
            protObj.sequence = protObj.seq_mods.replace(this.commonRegexes.notUpperCase, '');
        }
        if (protObj.sequence) protObj.size = protObj.sequence.length;
        if (!protObj.crossLinks) {
            protObj.crossLinks = [];
        }
        protObj.hidden = false; //?

        protObj.form = 0;

        //take out organism abbreviation after underscore from names
        if (protObj.name.indexOf("_") != -1) {
            protObj.name = protObj.name.substring(0, protObj.name.indexOf("_"))
        }
        protObj.getMeta = function(metaField) {
            if (arguments.length === 0) {
                return this.meta;
            }
            return this.meta ? this.meta[metaField] : undefined;
        }.bind(protObj);

        protObj.setMeta = function(metaField, value) {
            if (arguments.length === 2) {
                this.meta = this.meta || {};
                this.meta[metaField] = value;
            }
        }.bind(protObj);
    },

    getDigestibleResiduesAsFeatures: function(participant) {
        var digestibleResiduesAsFeatures = [];

        var sequence = participant.sequence;
        var seqLength = sequence.length;
        var specificity = this.get("enzymeSpecificity");

        var specifCount = specificity.length;
        for (var i = 0; i < specifCount; i++) {
            var spec = specificity[i];
            for (var s = 0; s < seqLength; s++) {
                if (sequence[s] == spec.aa) {
                    if (!spec.postConstraint || !sequence[s + 1] || spec.postConstraint.indexOf(sequence[s + 1]) == -1) {
                        digestibleResiduesAsFeatures.push({
                            begin: s + 1,
                            end: s + 1,
                            name: "DIGESTIBLE",
                            protID: participant.id,
                            id: participant.id + " " + spec.type + (s + 1),
                            category: "AA",
                            type: "DIGESTIBLE"
                        });
                    }
                }
            }
        }
        //console.log("sp:", specificity, "df:", digestibleResiduesAsFeatures);
        return digestibleResiduesAsFeatures;
    },

    getCrosslinkableResiduesAsFeatures: function(participant, reactiveGroup) {
        var crosslinkableResiduesAsFeatures = [];

        var sequence = participant.sequence;
        var seqLength = sequence.length;
        var linkedResSets = this.get("crosslinkerSpecificity");

        var temp = d3.values(linkedResSets);
        for (var cl = 0; cl < temp.length; cl++) {
            // resSet = {searches: new Set(), linkables: [], name: crosslinkerName};
            var crossLinkerLinkedResSet = temp[cl];
            var linkables = crossLinkerLinkedResSet.linkables;

            //for (var l = 0 ; l < linkables.length; l++) {
            if (linkables[reactiveGroup - 1]) {
                var linkableSet = linkables[reactiveGroup - 1];
                var linkableArr = [];
                linkableSet.forEach(v => linkableArr.push(v));
                var specifCount = linkableArr.length;
                for (var i = 0; i < specifCount; i++) {
                    var spec = linkableArr[i];
                    for (var s = 0; s < seqLength; s++) {
                        if (sequence[s] == spec) {
                            crosslinkableResiduesAsFeatures.push({
                                begin: s + 1,
                                end: s + 1,
                                name: "CROSS-LINKABLE-" + reactiveGroup,
                                protID: participant.id,
                                id: participant.id + " Cross-linkable residue" + (s + 1) + "[group " + reactiveGroup + "]",
                                category: "AA",
                                type: "CROSS-LINKABLE-" + reactiveGroup
                            });
                        }
                    }
                }
            }
        }

        console.log("reactiveGroup:", reactiveGroup, "sp:", linkedResSets, "clf:", crosslinkableResiduesAsFeatures);
        return crosslinkableResiduesAsFeatures;
    },

    parseCSV: function(csv, fileInfo, fasta) {
        var self = this;
        this.get("searches").set(fileInfo.name, fileInfo);
        fileInfo.group = fileInfo.name;
        var fileName = fileInfo.name;

        //used later in addProtein
        var participants = this.get("participants");

        var rows = d3.csv.parseRows(csv);
        var headers = rows[0];
        for (var h = 0; h < headers.length; h++) {
            headers[h] = headers[h].toLowerCase().trim();
        }
        var itsXquest = false,
            itsXiFDR = false,
            itsProxl = false;
        //for historical reasons, theres sometimes a number of column headers names we'll accept
        function getHeaderIndex(columnNames) {
            var iCol = -1,
                ni = 0;
            while (ni < columnNames.length && iCol == -1) {
                iCol = headers.indexOf(columnNames[ni].toLowerCase().trim());
                //console.log(columnNames[ni]);
                ni++;
            }
            if (iCol != -1) {
                console.log(columnNames[ni - 1]);
                if (columnNames[ni - 1] == "AbsPos1") {
                    itsXquest = true;
                } else if (columnNames[ni - 1] == "fromSite") {
                    itsXiFDR = true;
                } else if (columnNames[ni - 1] == "q-value") {
                    itsProxl = true;
                }
            }
            return iCol;
        }

        console.log("CSV column headers:");
        var iProt1 = getHeaderIndex(['Protein 1', 'Protein1', 'Proteins 1']);
        var iProt2 = getHeaderIndex(['Protein 2', 'Protein2', 'Proteins 2']);
        var iSeqPos1 = getHeaderIndex(['SeqPos 1', 'SeqPos1', 'fromSite', 'AbsPos1', 'LinkPos1']);
        var iSeqPos2 = getHeaderIndex(['SeqPos 2', 'SeqPos2', 'ToSite', 'AbsPos2', 'LinkPos2']);
        var iId = getHeaderIndex(['Id', 'LinkID']);
        var iScore = getHeaderIndex(['Score', 'Highest Score', 'ld-Score', 'q-value']);
        var iAutovalidated = getHeaderIndex(['AutoValidated']);
        var iValidated = getHeaderIndex(['Validated']);
        //for csv of matches
        var iLinkPos1 = getHeaderIndex(['LinkPos 1', 'LinkPos1', 'Position 1']);
        var iLinkPos2 = getHeaderIndex(['LinkPos 2', 'LinkPos2', 'Position 2']);
        var iPepPos1 = getHeaderIndex(['PepPos 1', 'PepPos1']);
        var iPepPos2 = getHeaderIndex(['PepPos 2', 'PepPos2']);
        var iPepSeq1 = getHeaderIndex(['PepSeq 1', 'PepSeq1', 'Peptide 1']);
        var iPepSeq2 = getHeaderIndex(['PepSeq 2', 'PepSeq2', 'Peptide 2']);
        var iCharge = getHeaderIndex(['Charge']);
        var iPrecursorMZ = getHeaderIndex(['Exp M/Z']); //, 'OBSERVED M/Z']); //?
        var iCalcMass = getHeaderIndex(['CalcMass']);
        var iRunName = getHeaderIndex(['RunName', 'SCAN FILENAME']);
        var iScanNo = getHeaderIndex(['ScanNumber', 'SCAN NUMBER']);

        var countRows = rows.length;
        if (fasta) { //FASTA file provided
            var line_array = fasta.split("\n");
            var tempIdentifier = null;
            var tempDescription;
            var tempSeq = "";
            var iFirstSpace;
            for (var i = 0; i < line_array.length; i++) {
                var line = "" + line_array[i];
                // semi-colons indicate comments, ignore them
                if (line.indexOf(";") !== 0) {
                    // greater-than indicates description line
                    if (line.indexOf(">") === 0) {
                        if (tempIdentifier !== null) {
                            makeProtein(tempIdentifier, tempSeq, tempDescription);
                            if (itsXquest) {
                                //Also add xQuest reversed & decoys to participants
                                var reversedSeq = tempSeq.trim().split("").reverse().join("");
                                makeProtein("decoy_reverse_" + tempIdentifier, reversedSeq, "DECOY");
                                makeProtein("reverse_" + tempIdentifier, reversedSeq, "DECOY");
                            }
                            if (itsXiFDR) {
                                //Also add xiFDR decoy to participants
                                var reversedSeq = tempSeq.trim().split("").reverse().join("");
                                makeProtein("DECOY:" + idFromIdentifier(tempIdentifier), reversedSeq, "DECOY");
                            }
                            tempSeq = "";
                        }
                        iFirstSpace = line.indexOf(" ");
                        if (iFirstSpace === -1) iFirstSpace = line.length;
                        tempIdentifier = line.substring(1, iFirstSpace).trim().replace(/(['"])/g, '');
                        tempDescription = line.substring(iFirstSpace).trim();
                    } else {
                        tempSeq += line.trim();
                    }
                }
            }
            makeProtein(tempIdentifier, tempSeq, tempDescription);
            if (itsXquest) {
                //Also add xQuest reversed & decoys to participants
                var reversedSeq = tempSeq.trim().split("").reverse().join("");
                makeProtein("decoy_reverse_" + tempIdentifier, reversedSeq, "DECOY");
                makeProtein("reverse_" + tempIdentifier, reversedSeq, "DECOY");
            }
            if (itsXiFDR) {
                //Also add xiFDR decoy to participants
                var reversedSeq = tempSeq.trim().split("").reverse().join("");
                makeProtein("DECOY:" + idFromIdentifier(tempIdentifier), reversedSeq, "DECOY");
            }

            //read links
            addCSVLinks();
        } else if (!itsProxl) { // no FASTA file
            //we may encounter proteins withid
            //different ids/names but the same accession number.
            var needsSequence = []
            addProteins(iProt1);
            addProteins(iProt2);
            var protCount = needsSequence.length;
            var countSequences = 0;
            var protArray = needsSequence; //CLMS.arrayFromMapValues(participants);
            if (protCount > 1) {
                for (var p = 0; p < protCount; p++) {
                    var prot = protArray[p];
                    if (prot.is_decoy == false) {
                        var id = prot.id;
                        uniprotWebServiceFASTA(id, function(ident, seq) {
                            var prot = participants.get(ident);
                            prot.sequence = seq;
                            self.initProtein(prot);
                            countSequences++;
                            if (countSequences === protCount) {
                                addCSVLinks();
                            }
                        });
                    } else {
                        countSequences++;
                        if (countSequences === protCount) {
                            addCSVLinks();
                        }
                    }
                }
            } else {
               addCSVLinks();
            }
        } else {
            addCSVLinks();
        }

        function addProteins(columnIndex) {
            for (var row = 1; row < countRows; row++) {
                var prots = rows[row][columnIndex].replace(/(['"])/g, '');
                var accArray = split(prots);
                for (var i = 0; i < accArray.length; i++) {
                    var id = accArray[i].trim();
                    if (id && id.trim() !== '-' && id.trim() !== 'n/a') {
                        var acc, name;
                        if (id.indexOf('|') === -1) {
                            acc = id;
                            name = id;
                        } else {
                            var splitOnBar = accArray[i].split('|');
                            acc = splitOnBar[1].trim();
                            name = splitOnBar[2].trim();
                        }
                        if (!participants.has(acc)) {
                            var protein = {
                                id: id,
                                name: name,
                                accession: acc
                            };
                            participants.set(id, protein);
                            self.commonRegexes.decoyNames.lastIndex = 0;
                            var regexMatch = self.commonRegexes.decoyNames.exec(protein.name);
                            if (regexMatch) {
                                protein.is_decoy = true;
                            } else {
                                protein.is_decoy = false;
                            }
                            //~ self.initProtein(protein);
                            needsSequence.push(protein);
                        }
                    }
                }
            }
        };


        function split(str) {
            var arr = str.split(/[;,]/);
            for (var i = 0; i < arr.length; i++) {
                arr[i] = arr[i].trim();
            }
            return arr;
        }

        //for reading fasta files
        function makeProtein(id, sequence, desc) {
            var name = nameFromIdentifier(id);
            var acc = accFromIdentifier(id);
            var protein = {
                id: id,
                accession: acc,
                name: name,
                sequence: sequence,
                description: desc
            };
            participants.set(id, protein);
            //participants.set(acc, protein);
            self.commonRegexes.decoyNames.lastIndex = 0;
            var regexMatch = self.commonRegexes.decoyNames.exec(protein.id);
            if (regexMatch) {
                protein.is_decoy = true;
            } else {
                protein.is_decoy = false;
            }
            self.initProtein(protein);
        }

        //for reading fasta files
        function nameFromIdentifier(ident) {
            var name = ident;
            var iBar = ident.indexOf("|");
            if (iBar !== -1) {
                var splitOnBar = ident.split("|");
                if (splitOnBar.length === 3) {
                    name = splitOnBar[2];
                    //~ var iUnderscore = name.indexOf("_");
                    //~ if (iUnderscore !== -1) {
                    //~ name = name.substring(0, iUnderscore);
                    //~ }
                }
            }
            return name;
        };
        //for reading fasta files
        function accFromIdentifier(ident) {
            var id = ident;
            var iBar = ident.indexOf("|");
            if (iBar !== -1) {
                var splitOnBar = ident.split("|");
                if (splitOnBar.length === 3) {
                    id = splitOnBar[1];
                }
            }
            return id;
        };

        function uniprotWebServiceFASTA(id, callback) {
            id = id + "";
            var accession = id;
            if (id.indexOf('|') !== -1) {
                accession = id.split('|')[1];
            }
            var url = "https://www.uniprot.org/uniprot/" + accession + ".fasta";
            //todo: give fail message
            d3.text(url, function(error, txt) {
                if (error) {
                    alert("FAILURE: could not retrieve sequence for accession " + accession);
                } else {
                    var sequence = "";
                    var lines = txt.split('\n');
                    var lineCount = lines.length;
                    for (var l = 1; l < lineCount; l++) {
                        var line = lines[l];
                        line = lines[l];
                        sequence += line;
                    }
                    sequence = sequence.replace(/[^A-Z]/g, '');
                    callback(id, sequence);
                }
            });
        };

        function addCSVLinks() {

            self.initDecoyLookup();


            var proxlRegex = /(.*?)\((\d*)\)/; //for parsing proxl downloads

            var crossLinks = self.get("crossLinks");
            var id, score, autoval, val;
            for (var ir = 1; ir < countRows; ir++) {
                var row = rows[ir];
                if (row.length > 3) {
                    if (iId !== -1) {
                        id = row[iId];
                    } else {
                        id = ir;
                    }
                    if (iScore !== -1) {
                        score = +row[iScore];
                    }
                    if (iAutovalidated !== -1) {
                        autoval = row[iAutovalidated].trim().toLowerCase()[0];
                    }
                    if (iValidated !== -1) {
                        val = row[iValidated].split(',')[0].trim();
                    }

                    var rawMatches = [];
                    var match;

                    //if itsXquest... theres more we could do to get pep info, code(regex) is in v1 of xiNET

                    if ((iPepPos1 != -1 && iLinkPos1 != -1 &&
                            iPepPos2 != -1 && iLinkPos2 != -1) || itsProxl) {
                        //its matches (with peptide info)
                        var linkPos1 = +row[iLinkPos1];
                        var linkPos2 = +row[iLinkPos2];
                        var prot1, prot2, pepPos1, pepPos2;
                        if (!itsProxl) {
                            prot1 = split(row[iProt1]);
                            prot2 = split(row[iProt2]);
                            pepPos1 = split(row[iPepPos1]);
                            pepPos2 = split(row[iPepPos2]);
                        } else {
                            proxlRegex.lastIndex = 0;
                            var result1 = proxlRegex.exec(row[iProt1]);

                            var goingIn = row[iProt1];
                            prot1 = [result1[1].trim()];
                            pepPos1 = [+result1[2] - (linkPos1 - 1)];

                            proxlRegex.lastIndex = 0;
                            var result2 = proxlRegex.exec(row[iProt2]);
                            prot2 = [result2[1].trim()];
                            pepPos2 = [+result2[2] - (linkPos2 - 1)];
                        }
                        var pepSeq_mods1, pepSeq_mods2, pepSeq1, pepSeq2, charge, precursorMZ,
                            calcMass, runName, scanNo;
                        if (iPepSeq1 !== -1) {
                            pepSeq_mods1 = row[iPepSeq1].trim();
                            self.commonRegexes.notUpperCase.lastIndex = 0;
                            pepSeq1 = pepSeq_mods1.replace(self.commonRegexes.notUpperCase, '').trim();
                        }
                        if (iPepSeq2 !== -1) {
                            pepSeq_mods2 = row[iPepSeq2].trim();
                            self.commonRegexes.notUpperCase.lastIndex = 0;
                            pepSeq2 = pepSeq_mods2.replace(self.commonRegexes.notUpperCase, '').trim();
                        }
                        if (iCharge !== -1) {
                            charge = +row[iCharge];
                        }
                        if (iPrecursorMZ !== -1) {
                            precursorMZ = +row[iPrecursorMZ];
                        }
                        if (iCalcMass !== -1) {
                            calcMass = +row[iCalcMass];
                        }
                        if (iRunName !== -1) {
                            runName = row[iRunName].trim();
                        }
                        if (iScanNo !== -1) {
                            scanNo = row[iScanNo].trim();
                        }

                        var pep1 = {
                            id: id,
                            si: fileName,
                            sc: score,
                            av: autoval,
                            v: val,
                            //todo : need to remove spaces from split data
                            pos: pepPos1,
                            lp: +row[iLinkPos1],
                            prt: prot1,
                            seq_mods: pepSeq_mods1,
                            sequence: pepSeq1,
                            //following only read from first matched peptide
                            pc_c: charge,
                            pc_mz: precursorMZ,
                            cm: calcMass,
                            run_name: runName,
                            sn: scanNo,
                        };
                        var pep2 = {
                            id: id,
                            si: fileName,
                            sc: score,
                            av: autoval,
                            v: val,
                            pos: pepPos2,
                            lp: +row[iLinkPos2],
                            prt: prot2,
                            seq_mods: pepSeq_mods2,
                            sequence: pepSeq2,
                        };

                        rawMatches.push(pep1);
                        rawMatches.push(pep2);
                        match = new CLMS.model.SpectrumMatch(self,
                            participants,
                            crossLinks,
                            null, //no peptide info
                            rawMatches);


                    } else {
                        //its links (no peptide info); also no proper ambiguity info
                        var pep1 = {
                            id: id,
                            si: fileName,
                            sc: score,
                            av: autoval,
                            v: val,
                            pos: split(row[iSeqPos1]),
                            lp: 1,
                            prt: [accFromIdentifier(row[iProt1])],
                            sequence: ""
                        };
                        var pep2 = {
                            id: id,
                            si: fileName,
                            sc: score,
                            av: autoval,
                            v: val,
                            pos: split(row[iSeqPos2]),
                            lp: 1,
                            prt: [accFromIdentifier(row[iProt2])],
                            sequence: ""
                        };

                        rawMatches.push(pep1);
                        rawMatches.push(pep2);
                        match = new CLMS.model.SpectrumMatch(self,
                            participants,
                            crossLinks,
                            null, //no peptide info
                            rawMatches);
                    }

                    self.get("matches").push(match);
                }
            }

            self.trigger("change:matches");

            // following isn't very tidy -
            // todo: filterModel should maybe be part of CLMS-model?
            CLMSUI.compositeModelInst.get("filterModel").set("unval", true);
            CLMSUI.compositeModelInst.get("filterModel").trigger("change");
        };
    },

    initDecoyLookup: function(prefixes) {
        // Make map of reverse/random decoy proteins to real proteins
        prefixes = prefixes || ["REV_", "RAN_", "DECOY_", "DECOY:", "reverse_", "REV", "RAN"];
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
                    if ( /*targetProtIDByName && */ targetProtIDByAccession) {
                        decoyProt.targetProteinID = targetProtIDByAccession /*targetProtIDByName*/ ; // mjg
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
            label: "Crosslink Match Count",
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
                var scores = link.filteredMatches_pp.map(function(m) {
                    return m.match.score();
                });
                return [Math.max.apply(Math, scores)];
            },
            unfilteredLinkFunc: function(link) {
                var scores = link.matches_pp.map(function(m) {
                    return m.match.score();
                })
                return [Math.max.apply(Math, scores)];
            },
            id: "Highest Score",
            label: "Highest Match Score per Crosslink",
            decimalPlaces: 2,
            matchLevel: false
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
                    return m.match.missingPeaks();
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.missingPeaks();
                });
            },
            id: "MissingPeaks",
            label: "Missing Peaks",
            decimalPlaces: 0,
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
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    var p = m.match.precursor_intensity;
                    return isNaN(p) ? undefined : p;
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    var p = m.match.precursor_intensity;
                    return isNaN(p) ? undefined : p;
                });
            },
            id: "PrecursorIntensity",
            label: "Match Precursor Intensity",
            decimalPlaces: 0,
            matchLevel: true,
            valueFormat: d3.format(".1e"),
            logAxis: true,
            logStart: 1000
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.elution_time_start;
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.elution_time_start;
                });
            },
            id: "ElutionTimeStart",
            label: "Elution Time Start",
            decimalPlaces: 2,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.elution_time_end;
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.elution_time_end;
                });
            },
            id: "ElutionTimeEnd",
            label: "Elution Time End",
            decimalPlaces: 2,
            matchLevel: true
        },
        {
            //watch out for the 'this' reference
            linkFunc: function(link, option) {
                //return link.isLinearLink() ? [] : [this.model.getSingleCrosslinkDistance(link, null, null, option)];
                return link.isLinearLink() ? [] : [link.getMeta("distance")];
            },
            unfilteredLinkFunc: function(link, option) {
                //return link.isLinearLink() ? [] : [this.model.getSingleCrosslinkDistance(link, null, null, option)];
                return link.isLinearLink() ? [] : [link.getMeta("distance")];
            },
            id: "Distance",
            label: "Crosslink Cα-Cα Distance (Å)",
            decimalPlaces: 2,
            maxVal: 90,
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.experimentalMissedCleavageCount();
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.experimentalMissedCleavageCount();
                });
            },
            id: "ExpMissedCleavages",
            label: "Experimental Max. Missed Cleavages",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.searchMissedCleavageCount();
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.searchMissedCleavageCount();
                });
            },
            id: "SearchMissedCleavages",
            label: "Search Max. Missed Cleavages",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function(link) {
                return link.filteredMatches_pp.map(function(m) {
                    return m.match.modificationCount();
                });
            },
            unfilteredLinkFunc: function(link) {
                return link.matches_pp.map(function(m) {
                    return m.match.modificationCount();
                });
            },
            id: "ModificationCount",
            label: "Modification Count",
            decimalPlaces: 0,
            matchLevel: true
        },
    ],

});
