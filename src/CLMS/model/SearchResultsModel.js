//      CLMS-model
//      Copyright 2015 Rappsilber Laboratory, Edinburgh University
//
//      authors: Colin Combe, Martin Graham
//
//      SearchResultsModel.js

(function(win) {
	"use strict"; // todo: we got some issues with 'use strict' and how we access the global namespace

	win.CLMS = win.CLMS || {};
	win.CLMS.model = win.CLMS.model || {};

	win.CLMS.model.SearchResultsModel = Backbone.Model.extend ({
		defaults : {
			interactors: new Map (), //map
			matches: [], //array
			crossLinks: new Map(), //map
			proteinLinks: new Map(), //map
			minScore: NaN,
			maxScore: NaN,
			groups: new Set()
		},

		constructor: function (rawInteractors, rawMatches) {
		
			Backbone.Model.apply( this ); // calls overridden constructor

			var interactorMap = this.get("interactors");
			if (rawInteractors) {
				for (var i of rawInteractors){
					var protein = new CLMS.model.Protein (i[0], i[1], i[2]);
					protein.setSequence(i[3]);
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
					var match = new CLMS.model.SpectrumMatch (this, tempMatches[i][0], tempMatches[i][1], tempMatches[i][2], tempMatches[i][3],
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

			this.initialize();				
		},
		
		initialize: function (options){
			
			var interactorMap = this.get("interactors");
			var interactorCount = interactorMap.size;
			var xiNET_StorageNS = "xiNET.";

			for (var protein of interactorMap.values()){
				uniProtTxt(protein);	
			}
			
			function uniProtTxt (p){
				if (p.accession) {
					var accession = p.accession;
					function uniprotWebService(){
						var url = "http://www.uniprot.org/uniprot/" + accession + ".txt";
						d3.text(url, function (txt){
							//~ console.log(accession + " retrieved from UniProt.");
							if(typeof(Storage) !== "undefined") {
								win.localStorage.setItem(xiNET_StorageNS  + "UniProtKB."+ accession, txt);
								//~ console.log(accession + " UniProt added to local storage.");
							}
							processUniProtTxt(p, txt);
						});
					}

					if(Storage){
						// Code for localStorage/sessionStorage.
						//~ console.log("Local storage found.");
						// Retrieve
						var stored = win.localStorage.getItem(xiNET_StorageNS + "UniProtKB." + accession);
						if (stored){
							console.log(accession + " UniProt from local storage.");
							processUniProtTxt(p, stored);
						}
						else {
							console.log(accession + " UniProt not in local storage.");
							uniprotWebService();
						}
					}
					else {
						//~ console.log("No local storage found.");
						uniprotWebService();
					}
					
				} else {
					interactorCount--; //no accession
					if (interactorCount === 0) doneProcessingUniProtText();
				}
			}
			
			function processUniProtTxt(p, txt){
				
				var sequence = "";
				var lines = txt.split('\n');
				var lineCount = lines.length;
				for (var l = 1; l < lineCount; l++){
					var line = lines[l];
					if (line.indexOf("SQ") === 0){
						//sequence = line;
						l++;
						for (l; l < lineCount; l++){
							line = lines[l];
							sequence += line;
						}
					}
				}
				
				sequence = sequence.replace(/[^A-Z]/g, '');
							
				p.canonicalSeq = sequence;
				
				interactorCount--;
				if (interactorCount === 0) doneProcessingUniProtText();
			}
			
			function doneProcessingUniProtText(){
				//~ console.log("YO!");
				for (var protein of interactorMap.values()) {
					console.log(protein.id + "\t" + protein.accession + "\t" + protein.sequence)
					console.log(protein.id + "\t" + protein.accession + "\t" + protein.canonicalSeq)
				}	
				CLMSUI.vent.trigger("uniprotDataParsed");
			}
					
		}

	});

} (this));
