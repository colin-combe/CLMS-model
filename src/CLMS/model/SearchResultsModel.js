//      CLMS-model
//      Copyright 2015 Rappsilber Laboratory, Edinburgh University
//
//      authors: Colin Combe, Martin Graham
//
//      SearchResultsModel.js


    var CLMS = CLMS || {};
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
            decoyNames: /(REV_)|(RAN_)|(DECOY_)/,
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

                //enzyme specificity
                var postAaSet = new Set();
                var aaConstrainedCTermSet = new Set();
                var aaConstrainedNTermSet = new Set();
                var searchArray = Array.from(searches.values());
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

                function getResiduesFromEnzymeDescription (regexMatch, residueSet) {
                    if (regexMatch && regexMatch.length > 1) {
                        var resArray = regexMatch[1].split(',');
                        var resCount = resArray.length;
                        for (var r = 0; r < resCount; r++){
                            residueSet.add(resArray[r]);
                        }
                    }
                }

                var enzymeSpecificity = [];
                addEnzymeSpecificityResidues(postAaSet, "Post AA constrained");
                addEnzymeSpecificityResidues(aaConstrainedCTermSet, "AA constrained c-term");
                addEnzymeSpecificityResidues(aaConstrainedNTermSet, "AA constrained n-term");
                this.set("enzymeSpecificity", enzymeSpecificity);

                function addEnzymeSpecificityResidues (residueSet, type) {
                    var resArray = Array.from(residueSet.values());
                    var resCount = resArray.length;
                    for (var r = 0; r < resCount; r++) {
                        enzymeSpecificity.push(
                            {aa: resArray[r] , type: type}
                        );
                    }
                }

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
                        //TODO: this will need updated for ternary or higher order crosslinks
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

                if (participantCount < 101 && participantCount > 0) {
                    var participantArray = Array.from(participants.values());
                    var invariantCount = participantCount;
                    for (var p = 0; p < invariantCount; p++ ){
                        uniProtTxt(participantArray[p]);
                    }
                }
                else {
                    CLMSUI.vent.trigger("uniprotDataParsed", self);
                }

                function uniProtTxt (p){
                    self.commonRegexes.uniprotAccession.lastIndex = 0;
                    if (!p.is_decoy && self.commonRegexes.uniprotAccession.test(p.accession)) {
                        var url = "https://www.ebi.ac.uk/proteins/api/features/" + p.accession + ".json";

                        d3.json(url, function (json) {
                            processUniProtTxt(p, json);
                        });
                    } else { //not protein, no accession or isDecoy
                        participantCount--;
                        if (participantCount === 0) {
                            CLMSUI.vent.trigger("uniprotDataParsed", self);
                        }
                    }
                }

                function processUniProtTxt(p, json){
                    p.uniprot = json;
                    participantCount--;
                    if (participantCount === 0) {
                        CLMSUI.vent.trigger("uniprotDataParsed", self);
                    }
                }
            }

        },

        //adds some attributes we want to protein object
        initProtein(protObj){
            if (protObj.seq_mods) {
                this.commonRegexes.notUpperCase.lastIndex = 0;
                protObj.sequence = protObj.seq_mods.replace(this.commonRegexes.notUpperCase, '');
            }
            if (protObj.sequence) protObj.size = protObj.sequence.length;
            protObj.crossLinks = [];
            protObj.hidden = false;//?
            protObj.is_decoy = false;
            if (protObj.name.indexOf("DECOY") == 0) {
                protObj.is_decoy = true;
            }
            //~ return protObj;
        },

        getDigestibleResiduesAsFeatures(participant){
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

        getCrosslinkableResiduesAsFeatures(participant){
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

        parseCSV: function(csv, fasta/*, annotations*/) {
            var self = this;

            var participants = this.get("participants");

            var rows = d3.csv.parseRows(csv);
            var headers = rows[0];
            for (var h = 0; h < headers.length; h++) {
                headers[h] = headers[h].trim();
            }
            //console.log(headers.toString());
            var iProt1 = headers.indexOf('Protein1');
            var iRes1 = headers.indexOf('PepPos1');
            var iProt2 = headers.indexOf('Protein2');
            var iRes2 = headers.indexOf('PepPos2');
            var iScore = headers.indexOf('Score');
            var iId = headers.indexOf('Id');
            var iLinkPosition1 = headers.indexOf('LinkPos1');
            var iPepSeq1 = headers.indexOf('PepSeq1');
            var iLinkPosition2 = headers.indexOf('LinkPos2');
            var iPepSeq2 = headers.indexOf('PepSeq2');
            var iType = headers.indexOf('Type');//for xQuest looplinks and monolinks
            //missing Protein column
            if (iProt1 === -1){
                alert("Failed to read column 'Protein1' from CSV file");
                return;
            }
            if (iProt2 === -1){
                alert("Failed to read column 'Protein2' from CSV file");
                return;
            }
            //missing Residue column(s)
            if (iLinkPosition1 === -1){
                // we could try a different sometimes used column name
                iLinkPosition1 = headers.indexOf('AbsPos1');
                if (iLinkPosition1 === -1){
                    alert("Failed to read column 'LinkPos1' from CSV file");
                    return;
                }
            }
            if (iLinkPosition2 === -1){
                // we could try a different sometimes used column name
                iLinkPosition2 = headers.indexOf('AbsPos2');
                if (iLinkPosition2 === -1){
                    alert("Failed to read column 'LinkPos2' from CSV file");
                    return;
                }
            }
            // no score? no problem, we can still proceed
            if (iScore === -1){
                // we could try a different sometimes used column name
                iScore = headers.indexOf('ld-Score');
            }

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
                                var name = nameFromIdentifier(tempIdentifier);
                                //accession number is null
                                var prot = new Protein(tempIdentifier, this, null, name);
                                prot.setSequence(tempSeq.trim());
                                this.proteins.set(tempIdentifier, prot);

                                //Also adds xQuest reversed & decoys
                                var decRevProt = new Protein("decoy_reverse_" + tempIdentifier,
                                    this, null, "DECOY_" + name);
                                decRevProt.setSequence(tempSeq.trim().split("").reverse().join(""));
                                this.proteins.set("decoy_reverse_" + tempIdentifier, decRevProt);
                                var revProt = new Protein("reverse_" + tempIdentifier,
                                    this, null, "DECOY_" + name);
                                revProt.setSequence(tempSeq.trim().split("").reverse().join(""));
                                this.proteins.set("reverse_" + tempIdentifier, revProt);

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
                name = nameFromIdentifier(tempIdentifier);
                //there will be one protein still to be added when we get to end
                var prot = new Protein(tempIdentifier, this, null, name);
                prot.setSequence(tempSeq.trim());
                this.proteins.set(tempIdentifier, prot);
                //same for xQuest decoys
                var decRevProt = new Protein("decoy_reverse_" + tempIdentifier,
                    this, null, "DECOY_" + name);
                decRevProt.setSequence(tempSeq.trim().split("").reverse().join(""));
                this.proteins.set("decoy_reverse_" + tempIdentifier, decRevProt);
                var revProt = new Protein("reverse_" + tempIdentifier,
                    this, null, "DECOY_" + name);
                revProt.setSequence(tempSeq.trim().split("").reverse().join(""));
                this.proteins.set("reverse_" + tempIdentifier, revProt);

                //read links
                addCSVLinks();
                //take out unlinked
                //~ var prots = this.proteins.values();
                //~ var protCount = prots.length;
                //~ for (var p = 0; p < protCount; p++) {
                    //~ var prot = prots[p];
                    //~ if (prot.proteinLinks.keys().length === 0) {
                        //~ this.proteins.remove(prot.id);
                    //~ }
                //~ }
                //~ if (annotations){
                    //~ self.addAnnotations(annotations);
                //~ }
                //~ self.initProteins();
            }
            else { // no FASTA file
                //we may encounter proteins with
                //different ids/names but the same accession number.
                addProteins(iProt1);
                addProteins(iProt2);
                var protCount = participants.size;
                var countSequences = 0;
                var protIter = participants.values();
                //FIX OF
                for (prot of protIter){
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

            this.set("interactors", participants);
            this.initDecoyLookup();

            function addProteins(columnIndex) {
                for (var row = 1; row < countRows; row++) {
                    var prots = rows[row][columnIndex].replace(/(['"])/g, '');
                    var accArray = prots.split(/[;,]/);
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
                                self.initProtein(protein);

                            }
                        }
                    }
                }
            };

            function uniprotWebServiceFASTA(id, callback){
                var accession = accessionFromId(id);
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
                        //~ console.log(sequence);
                        sequence = sequence.replace(/[^A-Z]/g, '');
                        callback(id, sequence);
                    }
                });
            };

            function accessionFromId (id){
                id = id + "";
                if (id.indexOf('|') !== -1){
                    return id.split('|')[1];
                } else {
                    return id;
                }
            };

            function nameFromIdentifier(ident){
                var name = ident;
                var iBar = ident.indexOf("|");
                if (iBar !== -1) {
                    var splitOnBar = ident.split("|");
                    if (splitOnBar.length === 3) {
                        name = splitOnBar[2];
                        var iUnderscore = name.indexOf("_");
                        if (iUnderscore !== -1) {
                            name = name.substring(0, iUnderscore);
                        }
                    }
                }
                return name;
            };

            function addCSVLinks() {
                var prot1, prot2, id, score;
                for (var row = 1; row < countRows; row++) {
                    prot1 = rows[row][iProt1];
                    prot2 = rows[row][iProt2];
                    if (iId !== -1){
                        id = rows[row][iId];
                    }
                    else {
                        id = row;
                    }
                    if (iScore !== -1){
                        score = rows[row][iScore];
                    }
                    var xQuestCrosslinkIdRegex = /(.*)-(.*)-a(\d*)-b(\d*)/; //only appiles to type 2 products (i.e. cross-linked peptides)
                    var xQuestOtherIdRegex = /(.*)-(.*)-(.*)/;
                    var m = xQuestCrosslinkIdRegex.exec(id);
                    var m2 = xQuestOtherIdRegex.exec(id);
                    if (m !== null){
                        var pep1_seq = m[1], pep2_seq = m[2],
                            linkPos1 = m[3] - 0, linkPos2 = m[4] - 0;
                        var peptidePositions1 = rows[row][iLinkPosition1].toString().split(/[;,]/);
                        for (var pp = 0; pp < peptidePositions1.length; pp++){
                            peptidePositions1[pp] = parseInt(peptidePositions1[pp]) - linkPos1 + 1;
                        }
                        var peptidePositions2 = rows[row][iLinkPosition2].toString().split(/[;,]/);
                        for (pp = 0; pp < peptidePositions2.length; pp++){
                            peptidePositions2[pp] = parseInt(peptidePositions2[pp]) - linkPos2 + 1;
                        }
                        addMatch(id,
                                    prot1, peptidePositions1.join(';'), pep1_seq, linkPos1,
                                    prot2, peptidePositions2.join(';'), pep2_seq, linkPos2,
                                    score);
                    } else if (iType !== -1 && m2 !== null && (rows[row][iType] === "intralink" || rows[row][iType] === "monolink")) {
                        var pep1_seq = m2[1];
                        var linkPos1 = parseInt(m2[2].substring(1));
                        var peptidePositions1 = rows[row][iLinkPosition1].toString().split(/[;,]/);
                        for (var pp = 0; pp < peptidePositions1.length; pp++){
                            peptidePositions1[pp] = parseInt(peptidePositions1[pp]) - linkPos1 + 1;
                        }
                        if (rows[row][iType] === "intralink") {//its an internally linked peptide
                            var linkPos2 = parseInt(m2[3].substring(1));
                            addMatch(id,
                                    prot1,  peptidePositions1.join(';'), pep1_seq, linkPos1,
                                    null, null, null, linkPos2,
                                    score);
                        } else { //its a linker modified peptide
                            addMatch(id,
                                    prot1,  peptidePositions1.join(';'), pep1_seq, linkPos1,
                                    null, null, null, null,
                                    score);
                        }
                    }
                    else {
                        var m = rows[row];
                        /*id,
                        pep1_protIDs, pep1_positions, pep1_seq, linkPos1,
                        pep2_protIDs, pep2_positions, pep2_seq, linkPos2,
                        score, dataSetId, autovalidated, validated*/
                        addMatch(id,
                                    prot1, m[iRes1], m[iPepSeq1], m[iLinkPosition1],
                                    prot2, m[iRes2], m[iPepSeq2], m[iLinkPosition2],
                                    score);
                    }
                }
                self.trigger ("change:matches", self);
                //todo: oh oh, the following isn't right
                CLMSUI.compositeModelInst.applyFilter();
            };

            function addMatch (id,
                pep1_protIDs, pep1_positions, pep1_seq, linkPos1,
                pep2_protIDs, pep2_positions, pep2_seq, linkPos2,
                score, dataSetId, autovalidated, validated, run_name, scan_number) {

                //~ var match = new CLMS.model.SpectrumMatch(self, id,
                    //~ pep1_protIDs, pep1_positions, pep1_seq, linkPos1,
                    //~ pep2_protIDs, pep2_positions, pep2_seq, linkPos2,
                    //~ score, dataSetId, autovalidated, validated, run_name, scan_number);
                    //~ return match;

                var participants = self.get("participants");
                var crossLinks = self.get("crossLinks");
                var rawMatches = [];
                var pep1 = {id:id, si:"CSV file", pos: [0], lp: linkPos1, prt: [pep1_protIDs], sequence: ""};
                var pep2 = {id:id, si:"CSV file", pos: [0], lp: linkPos2, prt: [pep2_protIDs], sequence: ""};
                rawMatches.push(pep1);
                rawMatches.push(pep2);
                var match = new CLMS.model.SpectrumMatch(self,
                                                    participants,
                                                    crossLinks,
                                                    new Map (),
                                                    rawMatches);
                self.get("matches").push(match);

            };

        },


        initDecoyLookup: function (prefixes) {
            // Make map of reverse/random decoy proteins to real proteins
            prefixes = prefixes || ["REV_", "RAN_", "DECOY_", "DECOY:"];
            var prots = Array.from(this.get("participants").values());
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
                    var realProtIDByAccession = accessionMap.get (decoyProt.accession.substring(pre.length));
                    if (realProtIDByName && realProtIDByAccession) {
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
		
		isDecoyLink: function (crossLink) {
               return (crossLink.fromProtein.is_decoy == true 
					|| (crossLink.toProtein && crossLink.toProtein.is_decoy == true));
        },

        getSearchRandomId : function (match) {
            var searchId = match.searchId;
            var searchMap = this.get("searches");
            var searchData = searchMap.get(searchId);
            var randId = searchData.random_id;
            return randId;
        },

    });
