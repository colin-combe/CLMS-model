//      CLMS-model
//      Copyright 2015 Rappsilber Laboratory, Edinburgh University
//
//      authors: Colin Combe, Martin Graham
//
//      SearchResultsModel.js


    var CLMS = CLMS || {};

    //For IE, which doesn't yet support values(). entries(), or keys() on ECMA6 Map
    CLMS.arrayFromMapValues = function (map) {
        if (map.values) {return Array.from(map.values());}
        else {
            var array = [];
            map.forEach(function (value, key, map) {array.push(value)});
            return array;
        }
    };

    CLMS.arrayFromMapEntries = function (map) {
        if (map.entries) {return Array.from(map.entries());}
        else {
            var array = [];
            map.forEach(function (value, key, map) {array.push([key, value])});
            return array;
        }
    };

    CLMS.arrayFromMapKeys = function (map) {
        if (map.keys) {return Array.from(map.keys());}
        else {
            var array = [];
            map.forEach(function (value, key, map) {array.push(key)});
            return array;
        }
    };

    CLMS.removeDomElement = function (child) {
        if (child.parentNode) {
          child.parentNode.removeChild(child);
        }
    };

    CLMS.model = CLMS.model || {};

    CLMS.model.SearchResultsModel = Backbone.Model.extend ({
        //http://stackoverflow.com/questions/19835163/backbone-model-collection-property-not-empty-on-new-model-creation
        defaults :  function() {
            return {
                participants: new Map (), //map
                matches: [],
                crossLinks: new Map(), //map
                scoreExtent: null,
                searches: new Map(),
                decoysPresent: false,
                ambiguousPresent: false,
            };
        },

        commonRegexes: {
            uniprotAccession: /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/,
            notUpperCase: /[^A-Z]/g,
            decoyNames: /(REV_)|(RAN_)|(DECOY_)|(DECOY:)|(reverse_)/,
        },

        //our SpectrumMatches are constructed from the rawMatches and peptides arrays in this json
        parseJSON: function (json) {
            if (json) {
                var self = this;
                this.set("sid", json.sid);

                //search meta data
                var searches = new Map();
                for(var propertyName in json.searches) {
                    var search = json.searches[propertyName];
                    searches.set(propertyName, search);
                }
                this.set("searches", searches);

                var getResiduesFromEnzymeDescription = function (regexMatch, residueSet) {
                    if (regexMatch && regexMatch.length > 1) {
                        var resArray = regexMatch[1].split(',');
                        var resCount = resArray.length;
                        for (var r = 0; r < resCount; r++){
                            residueSet.add(resArray[r]);
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
                    for (var e = 0; e < enzymeCount ; e++) {
                        var enzymeDescription = enzymes[e].description;
                        var postAARegex = /DIGESTED:(.*?);/g;
                        var postAAMatch = postAARegex.exec(enzymeDescription);
                        getResiduesFromEnzymeDescription (postAAMatch, postAaSet);

                        var cTermRegex = /CTERMDIGEST:(.*?);/g;
                        var ctMatch = cTermRegex.exec(enzymeDescription);
                        getResiduesFromEnzymeDescription (ctMatch, aaConstrainedCTermSet);

                        var nTermRegex = /NTERMDIGEST:(.*?);/g;
                        var ntMatch = nTermRegex.exec(enzymeDescription);
                        getResiduesFromEnzymeDescription (ntMatch, aaConstrainedNTermSet);
                    }
                }

                var addEnzymeSpecificityResidues = function (residueSet, type) {
                    var resArray = CLMS.arrayFromMapValues(residueSet);
                    var resCount = resArray.length;
                    for (var r = 0; r < resCount; r++) {
                        enzymeSpecificity.push(
                            {aa: resArray[r] , type: type}
                        );
                    }
                };

                var enzymeSpecificity = [];
                addEnzymeSpecificityResidues(postAaSet, "Post AA constrained");
                addEnzymeSpecificityResidues(aaConstrainedCTermSet, "AA constrained c-term");
                addEnzymeSpecificityResidues(aaConstrainedNTermSet, "AA constrained n-term");
                this.set("enzymeSpecificity", enzymeSpecificity);

                //crosslink specificity
                var linkableResSet = new Set();
                for (var s = 0; s < searchCount; s++) {
                    var search = searchArray[s];
                    var crosslinkers = search.crosslinkers;
                    var crosslinkerCount = crosslinkers.length;
                    for (var cl = 0; cl < crosslinkerCount ; cl++) {
                        var crosslinkerDescription = crosslinkers[cl].description;
                        var linkedAARegex = /LINKEDAMINOACIDS:(.*?);/g;
                        var result = null;
                        while ((result = linkedAARegex.exec(crosslinkerDescription)) !== null) {
                            var resArray = result[1].split(',');
                            var resCount = resArray.length;
                            for (var r = 0; r < resCount; r++){
                                var resRegex = /([A-Z])(.*)?/
                                var resMatch = resRegex.exec(resArray[r]);
                                if (resMatch) {
                                    linkableResSet.add(resMatch[1]);
                                }
                            }
                        }
                    }
                }

                this.set("crosslinkerSpecificity", Array.from(linkableResSet));

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
                if (rawMatches) {
                    var matches = this.get("matches");
                    var minScore = Number.MIN_VALUE;
                    var maxScore = Number.MAX_VALUE;

                    var l = rawMatches.length, match;
                    for (var i = 0; i < l; i++) {
                        //this would need updated for trimeric or higher order crosslinks
                        if ((i < (l - 1)) && rawMatches[i].id == rawMatches[i+1].id){
                            match = new CLMS.model.SpectrumMatch (this, participants, crossLinks, peptides, [rawMatches[i], rawMatches[i+1]]);
                            i++;
                        }
                        else {
                            match = new CLMS.model.SpectrumMatch (this, participants, crossLinks, peptides, [rawMatches[i]]);
                        }

                        matches.push(match);

                        if (match.score > maxScore) {
                            maxScore = match.score;
                        }
                        else if (match.score < minScore) {
                            minScore = this.score;
                        }
                    }
                }

                this.set("minScore", minScore);
                this.set("maxScore", maxScore);

                var participantCount = participants.size;

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

                if (participantCount < 101 && participantCount > 0) {
                    var participantArray = CLMS.arrayFromMapValues(participants);
                    var invariantCount = participantCount;
                    for (var p = 0; p < invariantCount; p++ ){
                        uniProtTxt(participantArray[p]);
                    }
                }
                else {
                    CLMSUI.vent.trigger("uniprotDataParsed", self);
                }

            }

        },

        //adds some attributes we want to protein object
        initProtein: function(protObj){
            if (protObj.seq_mods) {
                this.commonRegexes.notUpperCase.lastIndex = 0;
                protObj.sequence = protObj.seq_mods.replace(this.commonRegexes.notUpperCase, '');
            }
            if (protObj.sequence) protObj.size = protObj.sequence.length;
            protObj.crossLinks = [];
            protObj.hidden = false;//?
        },

        getDigestibleResiduesAsFeatures: function (participant){
            var digestibleResiduesAsFeatures = [];

            var sequence = participant.sequence;
            var seqLength = sequence.length;
            var specificity = this.get("enzymeSpecificity");

            var specifCount = specificity.length;
            for (var i = 0; i < specifCount; i++){
                var spec = specificity[i];
                for (var s = 0; s < seqLength; s++) {
                    if (sequence[s] == spec.aa) {
                        digestibleResiduesAsFeatures.push(
                            {
                                begin: s + 1,
                                end: s + 1,
                                name: spec.type,
                                protID: participant.id,
                                id: participant.id+" "+spec.type+(s+1),
                                category: "Digestible residue",
                                type: spec.type
                            }
                        );
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
                                name: "Crosslinkable residue",
                                protID: participant.id,
                                id: participant.id+" Crosslinkable residue"+(s+1),
                                category: "Crosslinkable residue",
                                type: spec.type
                            }
                        );
                    }
                }
            }
            //console.log("sp:", specificity, "clf:", crosslinkableResiduesAsFeatures);
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
            var itsXquest = false;
            //for historical reasons, theres sometimes a number of column headers names we'll accept
            function getHeaderIndex(columnNames){
                var iCol = -1, ni = 0;
                while (ni < columnNames.length && iCol == -1) {
					iCol = headers.indexOf(columnNames[ni].toLowerCase().trim());
					//console.log(columnNames[ni]);
                    ni++;
                }
                if (iCol != -1) {
                    console.log(columnNames[ni - 1]);
                    if (columnNames[ni - 1] == "AbsPos1") {itsXquest = true;}
                }
                return iCol;
            }

            console.log("CSV column headers:");
            var iProt1 = getHeaderIndex(['Protein 1', 'Protein1']);
            var iProt2 = getHeaderIndex(['Protein 2', 'Protein2']);
            var iSeqPos1 = getHeaderIndex(['SeqPos 1', 'SeqPos1', 'fromSite', 'AbsPos1']);
            var iSeqPos2 = getHeaderIndex(['SeqPos 2', 'SeqPos2', 'ToSite', 'AbsPos2']);
            var iId = getHeaderIndex(['Id', 'LinkID']);
            var iScore = getHeaderIndex(['Score', 'Highest Score', 'ld-Score']);
            var iAutovalidated = getHeaderIndex(['AutoValidated']);
            var iValidated = getHeaderIndex(['Validated']);
            //for csv of matches
            var iLinkPos1 = getHeaderIndex(['LinkPos 1', 'LinkPos1']);
            var iLinkPos2 =getHeaderIndex(['LinkPos 2', 'LinkPos2']);
            var iPepPos1 = getHeaderIndex(['PepPos 1', 'PepPos1']);
            var iPepPos2 = getHeaderIndex(['PepPos 2', 'PepPos2']);
            var iPepSeq1 = getHeaderIndex(['PepSeq 1', 'PepSeq1']);
            var iPepSeq2 = getHeaderIndex(['PepSeq 2', 'PepSeq2']);
            var iCharge = getHeaderIndex(['Charge']);
            var iPrecursorMZ = getHeaderIndex(['Exp M/Z']);
            var iCalcMass = getHeaderIndex(['MatchMass']);
            var iRunName = getHeaderIndex(['RunName']);
            var iScanNo = getHeaderIndex(['ScanNumber']);

            var countRows = rows.length;
            if (fasta){ //FASTA file provided
                var line_array = fasta.split("\n");
                var tempIdentifier = null;
                var tempDescription;
                var tempSeq;
                var iFirstSpace;
                for(var i = 0;i < line_array.length;i++){
                    var line = "" + line_array[i];
                    // semi-colons indicate comments, ignore them
                    if(line.indexOf(";") !== 0){
                        // greater-than indicates description line
                        if(line.indexOf(">") === 0){
                            if (tempIdentifier !== null) {
                                makeProtein(tempIdentifier, tempSeq, tempDescription);
                                if (itsXquest) {
                                    //Also add xQuest reversed & decoys to participants
                                    var reversedSeq = tempSeq.trim().split("").reverse().join("");
                                    makeProtein("decoy_reverse_" + tempIdentifier, reversedSeq, "DECOY");
                                    makeProtein("reverse_" + tempIdentifier, reversedSeq, "DECOY");
                                }
                                tempSeq = "";
                            }
                            iFirstSpace = line.indexOf(" ");
                            if (iFirstSpace === -1 ) iFirstSpace = line.length;
                            tempIdentifier = line.substring(1, iFirstSpace).trim().replace(/(['"])/g, '');
                            tempDescription = line.substring(iFirstSpace).trim();
                            //console.log(tempIdentifier);
                        }
                        else{
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
                //read links
                addCSVLinks();
            }
            else { // no FASTA file
                //we may encounter proteins with
                //different ids/names but the same accession number.
                addProteins(iProt1);
                addProteins(iProt2);
                var protCount = participants.size;
                var countSequences = 0;
                var protArray = CLMS.arrayFromMapValues(participants);
                for (var p = 0; p < protCount; p++){
                    var prot = protArray[p];
                    if (prot.is_decoy == false) {
                        var id = prot.id;
                        uniprotWebServiceFASTA(id, function(ident, seq){
                                var prot = participants.get(ident);
                                prot.sequence = seq;
                                self.initProtein(prot);
                                countSequences++;
                                if (countSequences === protCount){
                                    addCSVLinks();
                                }
                            }
                        );
                    } else {
                        countSequences++;
                        if (countSequences === protCount){
                            addCSVLinks();
                        }
                    }
                }
            }

            //this.set("interactors", participants);
            this.initDecoyLookup();

            function addProteins(columnIndex) {
                for (var row = 1; row < countRows; row++) {
                    var prots = rows[row][columnIndex].replace(/(['"])/g, '');
                    var accArray = split(prots);
                    for (var i = 0; i < accArray.length; i++) {
                        var id = accArray[i].trim();
                        if (id.trim() !== '-' && id.trim() !== 'n/a'){
                            var acc, name;
                            if (id.indexOf('|') === -1) {
                                acc = id;
                                name = id;
                            }
                            else {
                                var splitOnBar = accArray[i].split('|');
                                acc = splitOnBar [1].trim();
                                name = splitOnBar[2].trim();
                            }
                            if (!participants.has(id)) {
                                var protein = {id:id, name:name, accession:acc};
                                participants.set(id, protein);
                                self.commonRegexes.decoyNames.lastIndex = 0;
                                var regexMatch = self.commonRegexes.decoyNames.exec(protein.name);
                                if (regexMatch) {
                                    protein.is_decoy = true;
                                } else {
                                    protein.is_decoy = false;
                                }
                                self.initProtein(protein);
                            }
                        }
                    }
                }
            };
			
			
			function split(str){
				var arr = str.split(/[;,]/);
				for (var i = 0; i < arr.length; i++){
					arr[i] = arr[i].trim();
				}
				return arr;
			}
			
            //for reading fasta files
            function makeProtein(id, sequence, desc){
                var name = nameFromIdentifier(id);
                var protein = {id:id, name:name, sequence: tempSeq, description: desc};
                participants.set(id, protein);
                self.commonRegexes.decoyNames.lastIndex = 0;
                var regexMatch = self.commonRegexes.decoyNames.exec(protein.id);
                if (regexMatch) {
                    protein.is_decoy = true;
                } else {
                    protein.is_decoy = false;
                }
                self.initProtein(protein);
            };

            //for reading fasta files
            function nameFromIdentifier(ident){
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

            function uniprotWebServiceFASTA(id, callback){
                id = id + "";
                var accession = id;
                if (id.indexOf('|') !== -1){
                    accession = id.split('|')[1];
                }
                var url = "http://www.uniprot.org/uniprot/" + accession + ".fasta";
                d3.text(url, function (txt){
                    if (txt) {
                        var sequence = "";
                        var lines = txt.split('\n');
                        var lineCount = lines.length;
                        for (var l = 1; l < lineCount; l++){
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
                var crossLinks = self.get("crossLinks");
                var id, score, autoval, val;
                for (var ir = 1; ir < countRows; ir++) {
                    var row = rows[ir];
                    if (row.length > 3) {
                        if (iId !== -1){
                            id = row[iId];
                        }
                        else {
                            id = ir;
                        }
                        if (iScore !== -1){
                            score = +row[iScore];
                        }
                        if (iAutovalidated !== -1){
                            autoval = row[iAutovalidated].trim().toLowerCase()[0];
                        }
                        if (iValidated !== -1){
                            val = row[iValidated].split(',')[0].trim();
                        }

                        var rawMatches = [];
                        var match;
                        if (iPepPos1 != -1 && iLinkPos1 != -1 &&
                                iPepPos2 != -1 && iLinkPos2 != -1) {
                            //its matches (with peptide info)
                            var linkPos1 = +row[iLinkPos1];
                            var linkPos2 = +row[iLinkPos2];
                            var pepPos1 = +row[iPepPos1];
                            var pepPos2 = +row[iPepPos2];
                            var pepSeq_mods1, pepSeq_mods2, pepSeq1, pepSeq2, charge, precursorMZ,
                                calcMass, runName, scanNo;
                            if (iPepSeq1 !== -1){
                                pepSeq_mods1 = row[iPepSeq1].trim();
                                self.commonRegexes.notUpperCase.lastIndex = 0;
                                pepSeq1 = pepSeq_mods1.replace(self.commonRegexes.notUpperCase, '').trim();
                            }
                            if (iPepSeq2 !== -1){
                                pepSeq_mods2 = row[iPepSeq2].trim();
                                self.commonRegexes.notUpperCase.lastIndex = 0;
                                pepSeq2 = pepSeq_mods2.replace(self.commonRegexes.notUpperCase, '').trim();
                            }
                            if (iCharge !== -1){
                                charge = +row[iCharge];
                            }
                            if (iPrecursorMZ !== -1){
                                precursorMZ = +row[iPrecursorMZ];
                            }
                            if (iCalcMass !== -1){
                                calcMass = +row[iCalcMass];
                            }
                            if (iRunName !== -1){
                                runName = row[iRunName].trim();
                            }
                            if (iScanNo !== -1){
                                scanNo = row[iScanNo].trim();
                            }

                            var pep1 = {id:id,
                                        si:fileName,
                                        sc:score,
                                        av: autoval,
                                        v:val,
                                        //todo : need to remove spaces from split data
                                        pos: split(row[iPepPos1]),
                                        lp: row[iLinkPos1],
                                        prt: split(row[iProt1]),
                                        seq_mods: pepSeq_mods1,
                                        sequence: pepSeq1,
                                        //following only read from first matched peptide
                                        pc_c: charge,
                                        pc_mz: precursorMZ,
                                        cm: calcMass,
                                        run_name: runName,
                                        sn: scanNo,
                                        };
                            var pep2 = {id:id,
                                        si:fileName,
                                        sc:score,
                                        av: autoval,
                                        v:val,
                                        pos: split(row[iPepPos2]),
                                        lp: row[iLinkPos2],
                                        prt: split(row[iProt2]),
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
                            var pep1 = {id:id,
                                        si:fileName,
                                        sc:score,
                                        av: autoval,
                                        v:val,
                                        pos: split(row[iSeqPos1]),
                                        lp: 1,
                                        prt: split(row[iProt1]),
                                        sequence: ""};
                            var pep2 = {id:id,
                                        si:fileName,
                                        sc:score,
                                        av: autoval,
                                        v:val,
                                        pos: split(row[iSeqPos2]),
                                        lp: 1,
                                        prt: split(row[iProt2]),
                                        sequence: ""};

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
                self.trigger ("change:matches");
                //following isn't very tidy
                CLMSUI.compositeModelInst.get("filterModel").trigger("change");
                CLMSUI.compositeModelInst.get("filterModel").set("unval",true);
            };
        },

        initDecoyLookup: function (prefixes) {
            // Make map of reverse/random decoy proteins to real proteins
            prefixes = prefixes || ["REV_", "RAN_", "DECOY_", "DECOY:", "reverse_"];
            var prots = CLMS.arrayFromMapValues(this.get("participants"));
            var nameMap = d3.map ();
            var accessionMap = d3.map ();
            prots.forEach (function (prot) {
                nameMap.set (prot.name, prot.id);
                accessionMap.set (prot.accession, prot.id);
            });
            var decoyToRealMap = d3.map ();
            var decoys = prots.filter(function (p) { return p.is_decoy; });
            decoys.forEach (function (decoyProt) {
                prefixes.forEach (function (pre) {
                    var realProtIDByName = nameMap.get (decoyProt.name.substring(pre.length));
                    if (decoyProt.accession) {
						var realProtIDByAccession = accessionMap.get (decoyProt.accession.substring(pre.length));
						if (realProtIDByName && realProtIDByAccession) {
							decoyToRealMap.set (decoyProt.id, realProtIDByName);
						}
					} else if (realProtIDByName){
						decoyToRealMap.set (decoyProt.id, realProtIDByName);
					}
                });
            });

            this.decoyToRealProteinMap = decoyToRealMap;

            this.realProteinCount = prots.length - decoys.length;

        },

        getRealProteinID: function (decoyProteinID) {
            return this.decoyToRealProteinMap.get (decoyProteinID);
        },

        isMatchingProteinPair: function (prot1, prot2) {
                if (prot1.id === prot2.id) { return true; }
                var p1decoy = prot1.is_decoy;
                if (p1decoy === prot2.is_decoy) {   // won't be matching real+decoy pair if both are real or both are decoys
                    return false;
                }
                var decoy = p1decoy ? prot1 : prot2;
                var real = p1decoy ? prot2 : prot1;
                return this.getRealProteinID(decoy.id) === real.id;
            },

        isMatchingProteinPairFromIDs: function (prot1ID, prot2ID) {
                if (prot1ID === prot2ID) { return true; }
                var prot1 = this.get("participants").get(prot1ID);
                var prot2 = this.get("participants").get(prot2ID);
                return this.isMatchingProteinPair (prot1, prot2);
         },

        isIntraLink: function (crossLink) {
                return (crossLink.toProtein && this.isMatchingProteinPair (crossLink.toProtein, crossLink.fromProtein));
        },

        getSearchRandomId : function (match) {
            var searchId = match.searchId;
            var searchMap = this.get("searches");
            var searchData = searchMap.get(searchId);
            var randId = searchData.random_id;
            return randId;
        },

    });
