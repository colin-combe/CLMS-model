//      CLMS-model
//      Copyright 2015 Rappsilber Laboratory, Edinburgh University
//
//      authors: Colin Combe, Martin Graham
//
//      SearchResultsModel.js


	var CLMS = CLMS || {};
	CLMS.model = CLMS.model || {};

	CLMS.model.SearchResultsModel = Backbone.Model.extend ({
		defaults : {
			interactors: new Map (), //map
			matches: [], //array
			crossLinks: new Map(), //map
			minScore: NaN,
			maxScore: NaN,
			searches: new Map(),
			groups: new Set()
		},

		initialize: function (options) {

			var defaultOptions = {};

			this.options = _.extend(defaultOptions, options);

			var self = this;
			
			//search meta data
			var searches = new Map();			
			for(var propertyName in this.options.searches) {
			   searches.set(propertyName, this.options.searches[propertyName]);
			}
			this.set("searches", searches);
			
			
			var interactorMap = this.get("interactors");
			if (this.options.rawInteractors) {
				for (i of this.options.rawInteractors){
					var protein = new CLMS.model.Protein (i[0], i[1], i[2], i[4]);
					protein.setSequence(i[3]);
					interactorMap.set(protein.id, protein);
				}
			}

			var rawMatches = this.options.rawMatches;
			if (rawMatches) {
				var matches = this.get("matches");
				var minScore = this.get("minScore");
				var maxScore = this.get("maxScore");
				var groups = this.get("groups");


				var l = rawMatches.length;
				console.log("l " + l);
				for (var i = 0; i < l; i++) {
					var match = new CLMS.model.SpectrumMatch (this, rawMatches[i][0], rawMatches[i][1], rawMatches[i][2], rawMatches[i][3],
						rawMatches[i][4], rawMatches[i][5], rawMatches[i][6], rawMatches[i][7],
						rawMatches[i][8], rawMatches[i][9], rawMatches[i][10], rawMatches[i][11],
						rawMatches[i][12], rawMatches[i][13], rawMatches[i][14], 
						rawMatches[i][15], rawMatches[i][16], rawMatches[i][17]);

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

			var interactorMap = this.get("interactors");
			var interactorCount = interactorMap.size;
			var xiNET_StorageNS = "xiNET.";
			var pdbRegex = /DR...PDB;.(....);/g
			var candidatePDBs = new Set();
			var uniprotFeatureTypes = new Set();

			for (var protein of interactorMap.values()){
				uniProtTxt(protein);
			}

			function uniProtTxt (p){
				if (/*interactor is protein AND*/ p.accession && p.isDecoy() === false) {
					var accession = p.accession;
					function uniprotWebService(){
						var url = "http://www.uniprot.org/uniprot/" + accession + ".txt";
						d3.text(url, function (txt) {
							//~ console.log(accession + " retrieved from UniProt.");
							if(typeof(Storage) !== "undefined") {
								localStorage.setItem(xiNET_StorageNS  + "UniProtKB."+ accession, txt);
								//~ console.log(accession + " UniProt added to local storage.");
							}
							processUniProtTxt(p, txt);
						});
					}

					if(Storage){
						// Code for localStorage/sessionStorage.
						//~ console.log("Local storage found.");
						// Retrieve
						var stored = localStorage.getItem(xiNET_StorageNS + "UniProtKB." + accession);
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

		},

		readCSV : function (csv, fasta, annotations) {
			var self = this;
			
			var interactorMap = this.get("interactors");
			
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
				var prots = this.proteins.values();
				var protCount = prots.length;
				for (var p = 0; p < protCount; p++) {
					var prot = prots[p];
					if (prot.proteinLinks.keys().length === 0) {
						this.proteins.remove(prot.id);
					}
				}
				if (annotations){
					self.addAnnotations(annotations);
				}
				self.initProteins();
			}
			else { // no FASTA file
				//we may encounter proteins with
				//different ids/names but the same accession number.
				addProteins(iProt1);
				addProteins(iProt2);
				var protCount = interactorMap.size;
				var countSequences = 0;
				var protIter = interactorMap.values();
				for (prot of protIter){
					var id = prot.id;
					this.xiNET_storage.getSequence(id, function(ident, seq){
							interactorMap.get(ident).setSequence(seq);
							countSequences++;
							if (countSequences === protCount){
								if (annotations){
									self.addAnnotations(annotations);
								}
								self.initProteins();
							}
						}
					);
				}
				addCSVLinks();
			}

			this.set("interactors", interactorMap);

			function addProteins(columnIndex) {
				for (var row = 1; row < countRows; row++) {
					var prots = rows[row][columnIndex].replace(/(['"])/g, '');
					var accArray = prots.split(/[;,]/);
					for (var i = 0; i < accArray.length; i++) {
						var id = accArray[i].trim();
						if (id.trim() !== '-' && id.trim() !== 'n/a'){
							var acc, name;
							if (accArray[i].indexOf('|') === -1) {
								acc = accArray[i].trim();
							}
							else {
								var splitOnBar = accArray[i].split('|');
								acc = splitOnBar [1].trim();
								name = splitOnBar[2].trim();
								var iUnderscore = name.indexOf("_");
								if (iUnderscore !== -1) {
									name = name.substring(0, iUnderscore).trim();
								}
							}
							if (!interactorMap.has(id)) {
								var protein = new CLMS.model.Protein(id, self, acc, name);
								interactorMap.set(id, protein);
							}
						}
					}
				}
			}

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
			};
			
			function addMatch (id,
				pep1_protIDs, pep1_positions, pep1_seq, linkPos1,
				pep2_protIDs, pep2_positions, pep2_seq, linkPos2,
				score, dataSetId, autovalidated, validated, run_name, scan_number) {
				//~ CLMS.model.SpectrumMatch = function (containingModel, id,
				//~ 	pep1_protIDs, pep1_positions, pepSeq1, linkPos1,
				//~ 	pep2_protIDs, pep2_positions, pepSeq2, linkPos2,
				//~ 	score, dataSetId, autovalidated, validated, run_name, scan_number){		
				var match = new CLMS.model.SpectrumMatch(self, id,
					pep1_protIDs, pep1_positions, pep1_seq, linkPos1,
					pep2_protIDs, pep2_positions, pep2_seq, linkPos2,
					score, dataSetId, autovalidated, validated, run_name, scan_number);
					return match;
			};
			
		}

	});

