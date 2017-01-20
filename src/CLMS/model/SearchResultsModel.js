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
				searches: new Map(),
				decoysPresent: false,
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
            
			var uniprotAccRegex = /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/
			if (participantCount < 101) {
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
    });
