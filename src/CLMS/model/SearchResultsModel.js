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

            this.set("xiNETLayout", options.xiNETLayout);

            // we will be removing modification info from sequences
            var capitalsOnly = /[^A-Z]/g;

            // participants - I think this is the correct (PSI-MI) compliant term
            var participants = new Map();
            var proteins = this.options.proteins;
            var participant;
            for (var propertyName in proteins) {
                capitalsOnly.lastIndex = 0;
                participant = proteins[propertyName];
                participant.sequence = participant.seq_mods.replace(capitalsOnly, '');
                participant.size = participant.sequence.length;
                participant.crossLinks = [];
                participant.hidden = false;//?
                participants.set(participant.id, participant);
            }
            this.set("participants", participants);

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

            var participantCount = participants.size;
            var uniprotFeatureTypes = new Set();

			var uniprotAccRegex = /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/
			if (participantCount < 31) {
				for (var protein of participants.values()){
					uniProtTxt(protein);
				}
            }
			else {
				CLMSUI.vent.trigger("uniprotDataParsed", self);
			}
			
            function uniProtTxt (p){
				uniprotAccRegex.lastIndex = 0;
                if (!p.is_decoy && uniprotAccRegex.test(p.accession)) {
					var url = "http://www.uniprot.org/uniprot/" + p.accession + ".txt";
					d3.text(url, function (txt) {
						processUniProtTxt(p, txt);
					});
                } else { //not protein, no accession or isDecoy
                    participantCount--;
                    if (participantCount === 0) doneProcessingUniProtText();
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

                    if (line.indexOf("FT") === 0){
                        var fields = line.split(/\s{2,}/g);
                        if (fields.length > 4 && fields[1] === 'DOMAIN') {
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

                participantCount--;
                if (participantCount === 0) doneProcessingUniProtText();
            }

            function doneProcessingUniProtText(){
                self.set("uniprotFeatureTypes", uniprotFeatureTypes);
                CLMSUI.vent.trigger("uniprotDataParsed", self);
            }

        }
    });
