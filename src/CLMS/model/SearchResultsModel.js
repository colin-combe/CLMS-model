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
				interactors: new Map (), //map
				peptides: new Map (), //map
				matches: new Map (), //map
				crossLinks: new Map(), //map
				minScore: NaN,
				maxScore: NaN,
				searches: new Map()
			};
        },

        initialize: function (options) {

            var defaultOptions = {};

            this.options = _.extend(defaultOptions, options);

            var self = this;
			this.set("sid", this.options.sid);
            //search meta data
            var searches = new Map();
            for(var propertyName in this.options.searches) {
                var search = this.options.searches[propertyName];
                searches.set(propertyName, search);
            }
            this.set("searches", searches);

            // we will be removing modification info from sequences
            var capitalsOnly = /[^A-Z]/g;

            //proteins or 'participants'
            var interactors = new Map();// lets not call this 'interactors' after all
            var proteins = this.options.proteins;
            var protein;
            for (var propertyName in proteins) {
                capitalsOnly.lastIndex = 0;
                protein = proteins[propertyName];
                protein.sequence = protein.seq_mods.replace(capitalsOnly, '');
                protein.size = protein.sequence.length;
                protein.crossLinks = [];
                interactors.set(protein.id, protein);
            }
            this.set("interactors", interactors);

            //peptides
            var peptides = new Map();
            var peptide;
            for (var propertyName in this.options.peptides) {
                capitalsOnly.lastIndex = 0;
                peptide = this.options.peptides[propertyName];
                peptide.sequence = peptide.seq_mods.replace(capitalsOnly, '');
                peptides.set(peptide.id, peptide);
            }
            this.set("peptides", peptides);

            var rawMatches = this.options.rawMatches;
            if (rawMatches) {
                var matches = this.get("matches");
                var minScore = this.get("minScore");
                var maxScore = this.get("maxScore");

                var l = rawMatches.length, match;
                for (var i = 0; i < l; i++) {
                    //TODO: this will need updated for ternary or higher order crosslinks
                    if ((i < (l - 1)) && rawMatches[i].id == rawMatches[i+1].id){
                        match = new CLMS.model.SpectrumMatch (this, [rawMatches[i], rawMatches[i+1]]);
                        i++;
                    }
                    else {
                        match = new CLMS.model.SpectrumMatch (this, [rawMatches[i]]);
                    }

                    matches.set(match.id, match);

                    if (!maxScore || match.score > maxScore) {
                        maxScore = match.score;
                    }
                    else if (!minScore || match.score < minScore) {
                        minScore = this.score;
                    }
                }
            }

            var interactorCount = interactors.size;
            var xiNET_StorageNS = "xiNET.";
            var pdbRegex = /DR...PDB;.(....);/g
            var candidatePDBs = new Set();
            var uniprotFeatureTypes = new Set();

            //~ for (var protein of interactors.values()){
                //~ uniProtTxt(protein);
            //~ }
			CLMSUI.vent.trigger("uniprotDataParsed", self);
			
            function uniProtTxt (p){
                if (/*interactor is protein AND*/ p.accession && !p.is_decoy) {
                    var accession = p.accession;
                    function uniprotWebService(){
                        var url = "http://www.uniprot.org/uniprot/" + accession + ".txt";
                        d3.text(url, function (txt) {
                            //~ console.log(accession + " retrieved from UniProt.");
                            //~ if(typeof(Storage) !== "undefined") {
                                //~ localStorage.setItem(xiNET_StorageNS  + "UniProtKB."+ accession, txt);
                                //~ //console.log(accession + " UniProt added to local storage.");
                            //~ }
                            processUniProtTxt(p, txt);
                        });
                    }

                    if(Storage){
                        // Code for localStorage/sessionStorage.
                        //~ console.log("Local storage found.");
                        // Retrieve
                        var stored = localStorage.getItem(xiNET_StorageNS + "UniProtKB." + accession);
                        if (stored){
                            //console.log(accession + " UniProt from local storage.");
                            processUniProtTxt(p, stored);
                        }
                        else {
                            //console.log(accession + " UniProt not in local storage.");
                            uniprotWebService();
                        }
                    }
                    else {
                        //~ console.log("No local storage found.");
                        uniprotWebService();
                    }

                } else { //not protein, no accession or isDecoy
                    interactorCount--;
                    if (interactorCount === 0) doneProcessingUniProtText();
                }
            }

            function processUniProtTxt(p, txt){

                txt = txt || "";
                var features = [];
                var sequence = "";
                var lines = txt.split('\n');
                var lineCount = lines.length;
                for (var l = 1; l < lineCount; l++){
                    var line = lines[l];

                    if (line.indexOf("DR") === 0){
                        pdbRegex.lastIndex = 0;
                        var match = pdbRegex.exec(line);
                        if (match) {
                            candidatePDBs.add(match[1].toString().trim());
                        }
                    }

                    if (line.indexOf("FT") === 0){
                        var fields = line.split(/\s{2,}/g);
                        if (fields.length > 4 ) {// && fields[1] === 'DOMAIN') {
                            uniprotFeatureTypes.add(fields[1]);
                        //console.log(fields[1]);fields[4].substring(0, fields[4].indexOf("."))
                            var name = fields[4].substring(0, fields[4].indexOf("."));
                            features.push(new CLMS.model.AnnotatedRegion (name, fields[2], fields[3], null, fields[4], fields[1]));
                        }
                    }

                    if (line.indexOf("SQ") === 0){
                        //sequence = line;
                        l++;
                        for (l; l < lineCount; l++){
                            line = lines[l];
                            sequence += line;
                        }
                    }
                }

                p.uniprotFeatures = features;

                sequence = sequence.replace(/[^A-Z]/g, '');
                p.canonicalSeq = sequence;

                interactorCount--;
                if (interactorCount === 0) doneProcessingUniProtText();
            }

            function doneProcessingUniProtText(){
                //~ for (var protein of interactorMap.values()) {
                    //~ console.log(protein.id + "\t" + protein.accession + "\t" + protein.sequence)
                    //~ console.log(protein.id + "\t" + protein.accession + "\t" + protein.canonicalSeq)
                //~ }
                //~ console.log("candidatePDBs:" + Array.from(candidatePDBs.values()).toString());
                //~ console.log("uniprotFeatureTypes:" + Array.from(uniprotFeatureTypes.values()).toString());
                self.set("candidatePDBs", candidatePDBs);
                self.set("uniprotFeatureTypes", uniprotFeatureTypes);
                CLMSUI.vent.trigger("uniprotDataParsed", self);
            }

        }
    });

