<?php

//  CLMS-UI
//  Copyright 2015 Colin Combe, Rappsilber Laboratory, Edinburgh University
//
//  This file is part of CLMS-UI.
//
//  CLMS-UI is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  CLMS-UI is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with CLMS-UI.  If not, see <http://www.gnu.org/licenses/>.

//$pageStartTime = microtime(true);

if (count($_GET) > 0) {

    include('../connectionString.php');
    $dbconn = pg_connect($connectionString) or die('Could not connect: ' . pg_last_error());

    $sid = urldecode($_GET["sid"]);
    //SQL injection defense
    $pattern = '/[^0-9,\-]/';
    if (preg_match($pattern, $sid)){
        exit();
    }

    $unval = false;
    if (isset($_GET['unval'])){
        if ($_GET['unval'] === '1' || $_GET['unval'] === '0'){
            $unval = (bool) $_GET['unval'];
        }
    }

    // $decoys = false;
    // if (isset($_GET['decoys'])){
    //     if ($_GET['decoys'] === '1' || $_GET['decoys'] === '0'){
    //         $decoys = (bool) $_GET['decoys'];
    //     }
    // }

    $linears = false;
    if (isset($_GET['linears'])) {
        if ($_GET['linears'] === '1' || $_GET['linears'] === '0')     {
            $linears = (bool) $_GET['linears'];
        }
    }

    $spectrum = '';
    if (isset($_GET['spectrum'])) {
        $spectrum= (string) $_GET['spectrum'];
    }
	
	$matchid = '';
    if (isset($_GET['matchid'])) {
        $matchid = (string) $_GET['matchid'];
    }

    $lowestScore = 0;
    if (isset($_GET['lowestScore'])) {
        $lowestScore= (float) $_GET['lowestScore'];
    }

    $accAsId = 0;
    if (isset($_GET['accAsId'])) {
        if ($_GET['accAsId'] === '1' || $_GET['accAsId'] === '0')     {
            $accAsId = (bool) $_GET['accAsId'];
        }
    }

    //keep the long identifier for this combination of searches
    echo '{"sid":"'.$sid.'",';

    //get search meta data
    $id_rands = explode("," , $sid);
    $searchId_metaData = [];
    $searchId_randomId = [];
	$missingSearchIDs = [];
	$incorrectSearchIDs = [];
	
    for ($i = 0; $i < count($id_rands); $i++) {
        //$s = [];
        $dashSeperated = explode("-" , $id_rands[$i]);
        $randId = implode('-' , array_slice($dashSeperated, 1 , 4));
        $id = $dashSeperated[0];

        $searchDataQuery = "SELECT s.id AS id, s.name, s.private,
			s.submit_date, s.notes, s.random_id, xv.version, paramset_id,
			ps.missed_cleavages as missedCleavages, ps.ms_tol as msTolerance, ps.ms_tol_unit as msToleranceUnits,
			ps.ms2_tol as ms2Tolerance, ps.ms2_tol_unit as ms2ToleranceUnits,
			ps.enzyme_chosen AS enzyme_chosen, ps.customsettings
			FROM search s
			INNER JOIN parameter_set ps ON s.paramset_id = ps.id
			INNER JOIN users u ON s.uploadedby = u.id
			LEFT JOIN xiversions xv ON xv.id = s.xiversion
			WHERE s.id = '".$id."';";
		// left join return null values if xiversion not stated, inner join blanks result

        $res = pg_query($searchDataQuery)
                    or die('Query failed: ' . pg_last_error());
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);
		
		if (pg_num_rows ($res) === 0) {
			$missingSearchIDs[$id] = true;
		} else if ($randId !== $line["random_id"]) {
			$incorrectSearchIDs[$id] = true;
		} else {
			if (count($dashSeperated) == 6){
				$line["group"] = $dashSeperated[5];
			} else {
				$line["group"] = "'NA'";
			}
			$line["random_id"] = $randId;

			//sequence files
			$seqFileQuery = "SELECT search_id, name, file_name, decoy_file, file_path, notes, upload_date,
				 user_name AS uploaded_by
				 FROM search_sequencedb
				 INNER JOIN sequence_file
				 ON search_sequencedb.seqdb_id = sequence_file.id
				 INNER JOIN users
				 ON sequence_file.uploadedby = users.id
				 WHERE search_sequencedb.search_id = '".$id."';";
			$sequenceFileResult = pg_query($seqFileQuery)
						or die('Query failed: ' . pg_last_error());
			$sequenceFiles = [];
			while ($seqFile = pg_fetch_object($sequenceFileResult)) {
				array_push($sequenceFiles, $seqFile);
			}
			$line["sequenceFiles"] = $sequenceFiles;
			// Free resultset
			pg_free_result($sequenceFileResult);



			//runs
			$runQuery = "SELECT *
				FROM search_acquisition sa
				INNER JOIN (
					SELECT acq_id, run_id,
							run.name AS run_name,
							run.file_path AS run_file_path,
							acquisition.name AS acquisition_name,
							users.user_name AS uploaded_by,
							notes
					FROM run
					INNER JOIN acquisition ON run.acq_id = acquisition.id
					INNER JOIN users ON acquisition.uploadedby = users.id
					) r
				ON sa.run_id = r.run_id AND sa.acq_id = r.acq_id
			WHERE sa.search_id = '".$id."';";
			$runResult = pg_query($dbconn, $runQuery)
						or die('Query failed: ' . pg_last_error());
			$runs = [];
			while ($run = pg_fetch_object($runResult)) {
				array_push($runs, $run);
			}
			$line["runs"] = $runs;
			// Free resultset
			pg_free_result($runResult);

			//enzymes - xiDB only supports 1 enzyme at moment, xiUI will get it as array containing 1 element
			//	since it should change to multiple enzymes at some future point,
			$enzymeQuery = "SELECT * FROM enzyme e WHERE e.id = '".$line["enzyme_chosen"]."';";
			$enzymeResult = pg_query($dbconn, $enzymeQuery)
						or die('Query failed: ' . pg_last_error());
			$enzymes = [];
			while ($enzyme = pg_fetch_object($enzymeResult)) { //this will only loop once at moment
				array_push($enzymes, $enzyme);
			}
			$line["enzymes"] = $enzymes;
			// Free resultset
			pg_free_result($enzymeResult);

			//need paramater_set id for modification, crosslinkers & losses
			$psId =$line["paramset_id"];

			//modifications
			$modQuery = "SELECT * FROM chosen_modification cm INNER JOIN modification m ON cm.mod_id = m.id
			 WHERE cm.paramset_id = '".$psId."';";
			$modResult = pg_query($dbconn, $modQuery)
						or die('Query failed: ' . pg_last_error());
			$mods = [];
			while ($mod = pg_fetch_object($modResult)) {
				array_push($mods, $mod);
			}
			$line["modifications"] = $mods;
			// Free resultset
			pg_free_result($modResult);

			//cross-linkers
			$crosslinkerQuery = "SELECT * FROM chosen_crosslinker cc INNER JOIN crosslinker cl ON cc.crosslinker_id = cl.id
			 WHERE cc.paramset_id = '".$psId."';";
			$crosslinkerResult = pg_query($dbconn, $crosslinkerQuery)
						or die('Query failed: ' . pg_last_error());
			$crosslinkers = [];
			while ($crosslinker = pg_fetch_object($crosslinkerResult)) {
				array_push($crosslinkers, $crosslinker);
			}
			$line["crosslinkers"] = $crosslinkers;
			// Free resultset
			pg_free_result($crosslinkerResult);


			//losses
			$lossesQuery = "SELECT * FROM chosen_losses closs INNER JOIN loss ON closs.loss_id = loss.id
			 WHERE closs.paramset_id = '".$psId."';";
			$lossesResult = pg_query($dbconn, $lossesQuery)
						or die('Query failed: ' . pg_last_error());
			$losses = [];
			while ($loss = pg_fetch_object($lossesResult)) { //this will only loop once at moment
				array_push($losses, $loss);
			}
			$line["losses"] = $losses;
			//free result set
			pg_free_result($lossesResult);
			

			//now take out some untidy looking attributes
			unset($line["enzyme_chosen"]);
			unset($line["paramset_id"]);

			$searchId_metaData[$id] = $line;
			$searchId_randomId[$id] = $randId;
		}
		
    }
	
	if (count($missingSearchIDs) > 0 || count($incorrectSearchIDs) > 0) {
		// missing / mangled any of the search id's then bail out, use these fields to inform user back in javascriptland
		echo "\"missingSearchIDs\":".json_encode(array_keys($missingSearchIDs)).",\n\"incorrectSearchIDs\":".json_encode(array_keys($incorrectSearchIDs))."}\n";
	} else {

		echo "\"searches\":".json_encode($searchId_metaData). ",\n";

		//Stored layouts
		$layoutQuery = "SELECT t1.layout AS l "
				. " FROM layouts AS t1 "
				. " WHERE t1.search_id LIKE '" . $sid . "' "
				. " AND t1.time = (SELECT max(t1.time) FROM layouts AS t1 "
				. " WHERE t1.search_id LIKE '" . $sid . "' );";

		$layoutResult = pg_query($layoutQuery) or die('Query failed: ' . pg_last_error());
		while ($line = pg_fetch_array($layoutResult, null, PGSQL_ASSOC)) {
			echo "\"xiNETLayout\":" . stripslashes($line["l"]) . ",\n\n";
		}

		//load data -
		$WHERE_spectrumMatch = ' ( ( '; //WHERE clause for spectrumMatch table
		$WHERE_matchedPeptide = ' ( ';//WHERE clause for matchedPeptide table
		$i = 0;
		foreach ($searchId_randomId as $key => $value) {
			if ($i > 0){
				$WHERE_spectrumMatch = $WHERE_spectrumMatch.' OR ';
				$WHERE_matchedPeptide = $WHERE_matchedPeptide.' OR ';
			}
			$id = $key;
			$randId = $value;
			$WHERE_spectrumMatch = $WHERE_spectrumMatch.'(search_id = '.$id.' AND random_id = \''.$randId.'\''.') ';
			$WHERE_matchedPeptide = $WHERE_matchedPeptide.'search_id = '.$id.'';

			$i++;
		}
		$WHERE_spectrumMatch = $WHERE_spectrumMatch.' ) AND score >= '.$lowestScore;
		if (isset($_GET['highestScore'])) {
			$WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND score <= '.((float) $_GET['highestScore']).') ';
		}
		else {
				$WHERE_spectrumMatch = $WHERE_spectrumMatch.') ';
		}
		$WHERE_matchedPeptide = $WHERE_matchedPeptide.' ) ';

		// if ($decoys == false){
		// 	$WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND (NOT is_decoy) ';
		// }

		if ($unval == false){
			$WHERE_spectrumMatch = $WHERE_spectrumMatch." AND ((sm.autovalidated = true AND (sm.rejected != true OR sm.rejected is null)) OR
						(sm.validated LIKE 'A') OR (sm.validated LIKE 'B') OR (sm.validated LIKE 'C')
						OR (sm.validated LIKE '?')) ";
		}


		if ($spectrum) {
			$WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND spectrum_id = ' . $spectrum . ' ';
		}
		else {
			$WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND dynamic_rank ';
		}

		// MJG. 06/09/16. Changed query 'cos it crashed when using old db
		$isNewQuery = pg_query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'spectrum_source'");
		$isNewQueryRow = pg_fetch_object ($isNewQuery);
		$oldDB = ($isNewQueryRow->count == 0 ? true : false);
		//pg_query("SELECT * FROM spectrum_source LIMIT 0") or ($oldDB = true);

		/*
		 * SPECTRUM MATCHES AND MATCHED PEPTIDES
		 */

		if ($oldDB == true) {
			//old DB

			$query = "
				SELECT
					mp.match_id, mp.match_type, mp.peptide_id,
					mp.link_position + 1 AS link_position,
					sm.score, sm.autovalidated, sm.validated, sm.rejected,
					sm.search_id, sm.precursor_charge, sm.is_decoy, sm.spectrum_id,
					sp.scan_number, r.run_name
				FROM
					(SELECT sm.id, sm.score, sm.autovalidated, sm.validated, sm.rejected,
					sm.search_id, sm.precursor_charge, sm.is_decoy, sm.spectrum_id
					FROM spectrum_match sm INNER JOIN search s ON search_id = s.id
					WHERE ".$WHERE_spectrumMatch.")
					sm
				INNER JOIN
					(SELECT mp.match_id, mp.match_type, mp.peptide_id,
					mp.link_position
					FROM matched_peptide mp WHERE link_position != -1) mp
					ON sm.id = mp.match_id
				INNER JOIN spectrum sp ON sm.spectrum_id = sp.id
				INNER JOIN (SELECT run_name, spectrum_match_id from  v_export_materialized
					WHERE (".$WHERE_matchedPeptide.")
					) r ON sm.id = r.spectrum_match_id
				ORDER BY score DESC, sm.id, mp.match_type;";
		}
		else {
			//New DB

			if ($linears == false){
				$WHERE_matchedPeptide = $WHERE_matchedPeptide." AND link_position != -1 ";
			}

			$query = "
					SELECT
					mp.match_id, mp.match_type, mp.peptide_id,
					mp.link_position + 1 AS link_position, sm.spectrum_id,
					sm.score, sm.autovalidated, sm.validated, sm.rejected,
					sm.search_id, sm.is_decoy, sm.calc_mass, sm.precursor_charge,
					sp.scan_number, sp.source_id as source,
					sp.precursor_intensity, sp.precursor_mz, sp.elution_time_start, sp.elution_time_end
				FROM
					(SELECT sm.id, sm.score, sm.autovalidated, sm.validated, sm.rejected,
					sm.search_id, sm.precursor_charge, sm.is_decoy, sm.spectrum_id,
					sm.calc_mass
					FROM spectrum_match sm INNER JOIN search s ON search_id = s.id
					WHERE ".$WHERE_spectrumMatch.") sm
				INNER JOIN
					(SELECT mp.match_id, mp.match_type, mp.peptide_id,
					mp.link_position
					FROM matched_peptide mp WHERE ".$WHERE_matchedPeptide.") mp
					ON sm.id = mp.match_id
				INNER JOIN spectrum sp ON sm.spectrum_id = sp.id
				ORDER BY score DESC, sm.id, mp.match_type;";
		}
		$startTime = microtime(true);
		$res = pg_query($query) or die('Query failed: ' . pg_last_error());
		$endTime = microtime(true);
		//~ echo '/*db time: '.($endTime - $startTime)."ms\n";
		//~ echo '/*rows:'.pg_num_rows($res)."\n";
		$startTime = microtime(true);
		echo "\"rawMatches\":[\n";
		$peptideIds = array();
		$sourceIds = array();
		$line = pg_fetch_array($res, null, PGSQL_ASSOC);
		while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
				$peptideId = $line["peptide_id"];
				$peptideIds[$peptideId] = 1;
				$sourceId = $line["source"];
				$sourceIds[$sourceId] = 1;
				echo "{"
					. '"id":' . $line["match_id"] . ','
					. '"ty":' . $line["match_type"] . ','
					. '"pi":' . $peptideId . ','
					. '"lp":'. $line["link_position"]. ','
					. '"spec":' . $line["spectrum_id"] . ','
					. '"sc":' . round($line["score"], 2) . ','
					. '"si":' . $line["search_id"] . ','
					. '"dc":"' . $line["is_decoy"] . '",';
				$autoVal =  $line["autovalidated"];
				if (isset($autoVal)){
					echo '"av":"' . $autoVal.'"' . ',';
				}
				$val = $line["validated"];
				if (isset($val)){
					echo '"v":"'.$val.'"' . ',';
				}
				$rej = $line["rejected"];
				if (isset($rej)){
					echo '"rj":"'.$rej.'"' . ',';
				}
				echo '"src":"' . $sourceId. '",'
					. '"sn":' . $line["scan_number"]. ','
					. '"pc_c":' . $line["precursor_charge"]. ','
					. '"pc_mz":' . $line["precursor_mz"] . ','
					. '"cm":' . $line["calc_mass"] . ','
					. '"pc_i":' . $line["precursor_intensity"] . ','
					. '"e_s":' . $line["elution_time_start"] . ','
					. '"e_e":' . $line["elution_time_end"]
					. "}";
				$line = pg_fetch_array($res, null, PGSQL_ASSOC);
				if ($line) {echo ",\n";}
		}
		echo "\n],\n";
		$endTime = microtime(true);
		//~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

		/*
		 * SPECTRUM SOURCES
		 */
		if (sizeof($sourceIds) === 0) {
			echo "\"spectrumSources\":[],";
		} else {
			$implodedSourceIds = '('.implode(array_keys($sourceIds), ",").')';
			$query = "SELECT src.id, src.name
				FROM spectrum_source AS src WHERE src.id IN "
						.$implodedSourceIds.";";
			$startTime = microtime(true);
			$res = pg_query($query) or die('Query failed: ' . pg_last_error());
			$endTime = microtime(true);
			//~ echo '//db time: '.($endTime - $startTime)."ms\n";
			//~ echo '//rows:'.pg_num_rows($res)."\n";
			echo "\"spectrumSources\":[\n";
			$line = pg_fetch_array($res, null, PGSQL_ASSOC);
			while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
					echo '{"id":' . $line["id"] . ','
						. '"name":"' . $line["name"] . '"}';
					$line = pg_fetch_array($res, null, PGSQL_ASSOC);
					if ($line) {echo ",\n";}
					}
			echo "\n],\n";
			$endTime = microtime(true);
		}

		$proteinIdField = "hp.protein_id";
		if (count($searchId_randomId) > 1 || $accAsId) {
			$proteinIdField = "p.accession_number";
		}

		/*
		 * PEPTIDES
		 */
		if (sizeof($peptideIds) === 0) {
			echo "\"peptides\":[],";
			echo "\"proteins\":[]}";
		} else {
			$implodedPepIds = '('.implode(array_keys($peptideIds), ",").')';
			$query = "SELECT pep.id, (array_agg(pep.sequence))[1] as sequence,
				array_agg(".$proteinIdField.") as proteins, array_agg(hp.protein_id) as test, array_agg(hp.peptide_position + 1) as positions
				FROM (SELECT id, sequence FROM peptide WHERE id IN "
						.$implodedPepIds.") pep
				INNER JOIN (SELECT peptide_id, protein_id, peptide_position
				FROM has_protein WHERE peptide_id IN "
						.$implodedPepIds.") hp ON pep.id = hp.peptide_id ";
			$query = $query."INNER JOIN protein p ON hp.protein_id = p.id ";
			$query = $query."GROUP BY pep.id;";
			$startTime = microtime(true);
			$res = pg_query($query) or die('Query failed: ' . pg_last_error());
			$endTime = microtime(true);
			//~ echo '//db time: '.($endTime - $startTime)."ms\n";
			//~ echo '//rows:'.pg_num_rows($res)."\n";
			echo "\"peptides\":[\n";
			$line = pg_fetch_array($res, null, PGSQL_ASSOC);
			while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
					$proteins = $line["proteins"];
					$proteinsArray = explode(",",substr($proteins, 1, strlen($proteins) - 2));
					//$c = count($proteinsArray);
					$dbProteinIds = $line["test"];
					$dbProteinsArray = explode(",", substr($dbProteinIds, 1, strlen($dbProteinIds) - 2));
					foreach ($dbProteinsArray as $v) {
						$dbIds[$v] = 1;
					}
					$positions = $line['positions'];
					echo '{"id":' . $line["id"] . ','
						. '"seq_mods":"' . $line["sequence"] . '",'
						. '"prt":["' . implode($proteinsArray, '","') . '"],'
					  //  . '"dbPrtIds":["' . implode($dbProteinsArray, '","') . '"],'
						. '"pos":[' . substr($positions, 1, strlen($positions) - 2) . ']'
						. "}";
					$line = pg_fetch_array($res, null, PGSQL_ASSOC);
					if ($line) {echo ",\n";}
					}
			echo "\n],\n";
		   // echo "" .implode(array_keys($dbIds), "','");
			$endTime = microtime(true);
			//~ echo '/*php time: '.($endTime - $startTime)."ms*/\n\n";


			/*
			 * PROTEINS
			 */

			$proteinIdField = "id";
			if (count($searchId_randomId) > 1  || $accAsId) {
				$proteinIdField = "accession_number";
			}

			$query = "SELECT ".$proteinIdField." AS id, protein.id as real_id,
					CASE WHEN name IS NULL OR name = '' OR name = 'REV_' OR name = 'RAN_' THEN accession_number
					ELSE name END AS name,
					description, accession_number, sequence, is_decoy
					FROM protein WHERE id IN ('".implode(array_keys($dbIds), "','")."')";
			$startTime = microtime(true);
			$res = pg_query($query) or die('Query failed: ' . pg_last_error());
			$endTime = microtime(true);
			//~ echo '/*db time: '.($endTime - $startTime)."ms*/\n";
			//~ echo '/*rows:'.pg_num_rows($res)."*/\n";
			$interactorAccs = [];
			echo "\"proteins\":[\n";
			$line = pg_fetch_array($res, null, PGSQL_ASSOC);
			while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
					$isDecoy = ($line["is_decoy"] == "t")? 'true' : 'false';
					$pId = $line["id"];
					//~ echo '"' . $pId . '":{'
					echo '{'
						. '"id":"' . $pId . '",'
						. '"real_id":"' . $line["real_id"] . '",'
						. '"name":"' . $line["name"] . '",'
						. '"description":"' . $line["description"] . '",'
						. '"accession":"' .$line["accession_number"]  . '",'
						. '"seq_mods":"' .$line["sequence"] . '",'
						. '"is_decoy":' .$isDecoy
						. "}";

					$interactorAccs[$line["accession_number"]] = 1;

					$line = pg_fetch_array($res, null, PGSQL_ASSOC);
					if ($line) {echo ",\n";}
				}
			echo "\n],";

			//interactors
			$interactorQuery = "SELECT * FROM uniprot WHERE accession IN ('"
					.implode(array_keys($interactorAccs), "','")."');";
			//echo "**".$interactorQuery."**";
			try {
				// @ stops pg_connect echo'ing out failure messages that knacker the returned data
				$interactorDbConn = @pg_connect($interactionConnection);// or die('Could not connect: ' . pg_last_error());

				if ($interactorDbConn) {
					$interactorResult = pg_query($interactorQuery);// or die('Query failed: ' . pg_last_error());
					echo "\"interactors\":{\n";
					$line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
					while ($line) {
						echo "\"".$line["accession"]."\":".$line["json"];
						$line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
						if ($line) {echo ",\n";}
					}
					echo "\n},";
				} else {
					throw new Exception ("Could not connect to interaction database");
				}
			} catch (Exception $e) {
				//error_log (print_r ("UNIPROT ERR ".$e, true));
				echo "\"interactors\":{},\n";
			}
			
			if ($matchid !== "") {	// send matchid back for sync purposes
				echo "\"matchid\":\"".$matchid."\",\n";
			}

			echo '"oldDB":'.($oldDB == 1 ? "true" : "false"); // Is this from the old db?
        	echo "}\n";
        	$endTime = microtime(true);
        	//~ echo '/*php time: '.($endTime - $startTime)."ms*/\n\n";
		}
    }

    // Free resultset
    pg_free_result($res);
    // Closing connection
    pg_close($dbconn);

}
?>
