//      CLMS-model
//      Copyright 2015 Rappsilber Laboratory, Edinburgh University
//
//      authors: Colin Combe, Martin Graham
//
//      SearchResultsModel.js

(function(win) {
	"use strict"; // todo: we got some issues with 'use strict' and how we access the global namespace

	win.CLMS = win.CLMS || {};

	win.CLMS.DataModelBB = Backbone.Model.extend ({
		defaults : {
			interactors: new Map (), //map
			matches: [], //array
			crossLinks: new Map(), //map
			proteinLinks: new Map(), //map
			minScore: NaN,
			maxScore: NaN,
			groups: new Set(),
		},

		constructor: function (rawInteractors, rawMatches) {
		
			Backbone.Model.apply( this ); // calls overridden constructor

			if (rawInteractors) {
				var interactorMap = this.get("interactors");
				for (var i of rawInteractors){
					var protein = new Protein (i[0], i[1], i[3]);
					protein.setSequence(i[2]);
					interactorMap.set(protein.id, protein);
				}
			}

			if (rawMatches) {
				var matches = this.get("matches");
				var minScore = this.get("minScore");
				var maxScore = this.get("maxScore");
				var groups = this.get("groups");

				var l = rawMatches.length;
				console.log("l " + l);
				for (var i = 0; i < l; i++) {
					var match = new Match (this, tempMatches[i][0], tempMatches[i][1], tempMatches[i][2], tempMatches[i][3],
					tempMatches[i][4], tempMatches[i][5], tempMatches[i][6], tempMatches[i][7],
					tempMatches[i][8], tempMatches[i][9], tempMatches[i][10], tempMatches[i][11],
					tempMatches[i][12], tempMatches[i][13], tempMatches[i][14], tempMatches[i][15]);

					matches.push(match);

					if (!maxScore || match.score > maxScore) {
						maxScore = match.score;
					}
					else if (!minScore || match.score < minScore) {
						minScore = this.score;
					}

					groups.add(match.group);

				}
			}
			
		}

	});

} (this));
