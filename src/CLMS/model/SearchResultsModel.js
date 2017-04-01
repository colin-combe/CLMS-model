//      CLMS-model
//      Copyright 2015 Rappsilber Laboratory, Edinburgh University
//
//      authors: Colin Combe, Martin Graham
//
//      SearchResultsModel.js


    var CLMS = CLMS || {};
    CLMS.model = CLMS.model || {};
    CLMS.uniprotAccRegex = /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/;

    CLMS.model.SearchResultsModel = Backbone.Model.extend ({
        //http://stackoverflow.com/questions/19835163/backbone-model-collection-property-not-empty-on-new-model-creation
        defaults :  function() {
            return {
                participants: new Map (), //map
                //peptides: new Map (), //map
                matches: [],
                crossLinks: new Map(), //map
                scoreExtent: null,
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
            
            //saved config should end up including filter settings not just xiNET layout
            this.set("xiNETLayout", options.xiNETLayout);
            //spectrum sources
            var spectrumSources = new Map();
            var specSource;
            for (var propertyName in this.options.spectrumSources) {
                specSource = this.options.spectrumSources[propertyName];
                spectrumSources.set(+specSource.id, specSource.name);
            }
            this.set("spectrumSources", spectrumSources);

            // we will be removing modification info from sequences
            var notUpperCase = /[^A-Z]/g;

            var participants = new Map();
            var proteins = this.options.proteins;
            var participant;
            for (var propertyName in proteins) {
                notUpperCase.lastIndex = 0;
                participant = proteins[propertyName];
                participant.sequence = participant.seq_mods.replace(notUpperCase, '');
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
                notUpperCase.lastIndex = 0;
                peptide = this.options.peptides[propertyName];
                peptide.sequence = peptide.seq_mods.replace(notUpperCase, '');
                peptides.set(peptide.id, peptide);
            }
            //this.set("peptides", peptides);

            var crossLinks = this.get("crossLinks");

            var rawMatches = this.options.rawMatches;
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

                    matches.push(match);//set(match.id, match);

                    if (match.score > maxScore) {
                        maxScore = match.score;
                    }
                    else if (match.score < minScore) {
                        minScore = this.score;
                    }
                }
            }

            this.set("scoreExtent", [minScore, maxScore]);

            var participantCount = participants.size;

            if (participantCount < 101) {
                for (var protein of participants.values()){
                    uniProtTxt(protein);
                }
            }
            else {
                CLMSUI.vent.trigger("uniprotDataParsed", self);
            }

            function uniProtTxt (p){
                CLMS.uniprotAccRegex.lastIndex = 0;
                if (!p.is_decoy && CLMS.uniprotAccRegex.test(p.accession)) {
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
			console.log("sp:", specificity, "df:", digestibleResiduesAsFeatures);
            return digestibleResiduesAsFeatures;
        }
    });
