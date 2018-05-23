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

    $sid = urldecode($_GET["uid"]);
    //SQL injection defense
    $pattern = '/[^0-9,\-]/';
    if (preg_match($pattern, $sid)){
        exit;
    }

    // $unval = false;
    // if (isset($_GET['unval'])){
    //     if ($_GET['unval'] === '1' || $_GET['unval'] === '0'){
    //         $unval = (bool) $_GET['unval'];
    //     }
    // }
    //
    // $decoys = false;
    // if (isset($_GET['decoys'])){
    //     if ($_GET['decoys'] === '1' || $_GET['decoys'] === '0'){
    //         $decoys = (bool) $_GET['decoys'];
    //     }
    // }
    //
    // $linears = false;
    // if (isset($_GET['linears'])) {
    //     if ($_GET['linears'] === '1' || $_GET['linears'] === '0')     {
    //         $linears = (bool) $_GET['linears'];
    //     }
    // }
    //
    // $spectrum = '';
    // if (isset($_GET['spectrum'])) {
    //     $spectrum= (string) $_GET['spectrum'];
    // }
    //
    // $lowestScore = 0;
    // if (isset($_GET['lowestScore'])) {
    //     $lowestScore= (float) $_GET['lowestScore'];
    // }
    //
    // $accAsId = 0;
    // if (isset($_GET['accAsId'])) {
    //     if ($_GET['accAsId'] === '1' || $_GET['accAsId'] === '0')     {
    //         $accAsId = (bool) $_GET['accAsId'];
    //     }
    // }

    //keep the long identifier for this combination of searches
    echo '{"sid":"'.$sid.'",';

    //get search meta data
    /*$id_rands = explode("," , $sid);
    $searchId_metaData = [];
    $searchId_randomId = [];
    for ($i = 0; $i < count($id_rands); $i++) {
        //$s = [];
        $dashSeperated = explode("-" , $id_rands[$i]);
        $randId = implode('-' , array_slice($dashSeperated, 1 , 4));
        $id = $dashSeperated[0];

        $searchDataQuery = "SELECT s.id AS id, s.name, s.private,
			s.submit_date, s.notes, s.random_id, paramset_id,
			ps.enzyme_chosen AS enzyme_chosen, ps.customsettings
			FROM search s
			INNER JOIN parameter_set ps ON s.paramset_id = ps.id
			INNER JOIN users u ON s.uploadedby = u.id
			WHERE s.id = '".$id."';";

        $res = pg_query($searchDataQuery)
                    or die('Query failed: ' . pg_last_error());
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);

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
*/
    // $query = "SELECT * FROM uploads WHERE id = ".$sid.";";
    // $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    // $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    // echo "\"searches\":".json_encode($line). ",\n";
    // 
    $query = "SELECT * FROM modifications WHERE upload_id = ".$sid.";";
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    $modifications = [];
    while ($line) {
        array_push($modifications, $line);
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    }
    echo "\"modifications\":".json_encode($modifications). ",\n";

    //load data -
/*    $WHERE_spectrumMatch = ' ( ( '; //WHERE clause for spectrumMatch table
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
    $WHERE_spectrumMatch = $WHERE_spectrumMatch.' ) AND score >= '.$lowestScore.') ';
    $WHERE_matchedPeptide = $WHERE_matchedPeptide.' ) ';

    if ($decoys == false){
        $WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND (NOT is_decoy) ';
    }

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
    */

    $query = "SELECT * FROM spectrum_identifications WHERE upload_id = ".$sid.";";
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
            //$peptideId = $line["peptide_id"];
            // $peptideIds[$peptideId] = 1;
            // $sourceId = $line["source"];
            // $sourceIds[$sourceId] = 1;
            echo "{"
                . '"id":' . $line["id"] . ','
            //     . '"ty":' . $line["match_type"] . ','
                . '"pi1":' . $line["pep1_id"] . ',';

            if ($line["pep2_id"]) {
                echo '"pi2":' . $line["pep2_id"] . ',';
            }
            //     . '"lp":'. $line["link_position"]. ','
            echo '"spec":' . $line["spectrum_id"] . ','
            //     . '"sc":' . round($line["score"], 2) . ','
                . '"si":' . $line["upload_id"] . ','
                . '"r":' . $line["rank"] . ','
            //     . '"dc":"' . $line["is_decoy"] . '",';
            // $autoVal =  $line["autovalidated"];
            // if (isset($autoVal)){
            //     echo '"av":"' . $autoVal.'"' . ',';
            // }
            // $val = $line["validated"];
            // if (isset($val)){
            //     echo '"v":"'.$val.'"' . ',';
            // }
            // $rej = $line["rejected"];
            // if (isset($rej)){
            //     echo '"rj":"'.$rej.'"' . ',';
            // }
            // echo '"src":"' . $sourceId. '",'
                // . '"sn":' . $line["scan_number"]. ','
                . '"ions":"' . $line["ions"] .'",'
                . '"pc_c":' . $line["charge_state"] . ','
                . '"e_mz":' . $line["exp_mz"] . ','
                . '"c_mz":' . $line["calc_mz"] // . ','
                // . '"pc_i":' . $line["precursor_intensity"] . ','
                // . '"e_s":' . $line["elution_time_start"] . ','
                // . '"e_e":' . $line["elution_time_end"]
                . "}";
            $line = pg_fetch_array($res, null, PGSQL_ASSOC);
            if ($line) {echo ",\n";}
    }
    echo "\n],\n";
    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

    /*
     * SPECTRA
     */
    $query = "SELECT * FROM spectra WHERE upload_id = ".$sid.";";
    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
    //~ echo '/*rows:'.pg_num_rows($res)."\n";
    $startTime = microtime(true);
    echo "\"spectra\":[\n";
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
            echo "{"
                . '"id":' . $line["id"] . ','
                . '"file":"' . $line["peak_list_file_name"] . '",'
                . '"sn":' . $line["scan_id"] . ','
                . '"ft":"' . $line["frag_tol"]. '"'
                . "}";
            $line = pg_fetch_array($res, null, PGSQL_ASSOC);
            if ($line) {echo ",\n";}
    }
    echo "\n],\n";
    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";


    /*
     * PEPTIDES
     */

// SELECT (array_agg(p.seq_mods))[1] as seq_mods, (array_agg(p.link_site))[1] as link_site,
// (array_agg(pe.start)) as pos,(array_agg(pe.dbsequence_ref)) as prt
// FROM peptides p JOIN (select * from peptide_evidences where upload_id = 1) pe on p.id = pe.peptide_ref
// WHERE p.upload_id = 1 group by p.id;

     $query = "SELECT * FROM peptides as p left join (select peptide_ref, array_agg(dbsequence_ref) as proteins, array_agg(pep_start) as positions, array_agg(is_decoy) as is_decoy from peptide_evidences where upload_id = " . $sid . " group by peptide_ref) as pe on pe.peptide_ref = p.id WHERE upload_id = ".$sid.";";
     $startTime = microtime(true);
     $res = pg_query($query) or die('Query failed: ' . pg_last_error());
     $endTime = microtime(true);
     //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
     //~ echo '/*rows:'.pg_num_rows($res)."\n";
     $startTime = microtime(true);
     echo "\"peptides\":[\n";
     $line = pg_fetch_array($res, null, PGSQL_ASSOC);
     while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
             $proteins = str_replace('"', '',  $line["proteins"]);
             $proteinsArray = explode(",",substr($proteins, 1, strlen($proteins) - 2));
             $positions = $line['positions'];
             echo "{"
                 . '"id":"' . $line["id"] . '",'
                 . '"seq_mods":"' . $line["seq_mods"] . '",'
                 . '"linkSite":"' . $line["link_site"]. '",'
                 . '"clModMass":"' . $line["crosslinker_modmass"]. '",'
                 . '"prt":["' . implode($proteinsArray, '","') . '"],'
                 . '"pos":[' . substr($positions, 1, strlen($positions) - 2) . ']'
                 . "}";
             $line = pg_fetch_array($res, null, PGSQL_ASSOC);
             if ($line) {echo ",\n";}
     }
     echo "\n],\n";
     $endTime = microtime(true);
     //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

     /*
      * PEPTIDE EVIDENCES
      */
      // $query = "SELECT * FROM peptide_evidences WHERE upload_id = ".$sid.";";
      // $startTime = microtime(true);
      // $res = pg_query($query) or die('Query failed: ' . pg_last_error());
      // $endTime = microtime(true);
      // //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
      // //~ echo '/*rows:'.pg_num_rows($res)."\n";
      // $startTime = microtime(true);
      // echo "\"peptide_evidences\":[\n";
      // $line = pg_fetch_array($res, null, PGSQL_ASSOC);
      // while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
      //         echo "{"
      //             . '"pep_id":"' . $line["peptide_ref"] . '",'
      //             . '"seq_id":"' . $line["dbsequence_ref"] . '",'
      //             . '"start":' . $line["pep_start"]//. ','
      //             // . '"isDecoy":' . $line["is_decoy"]
      //             . "}";
      //         $line = pg_fetch_array($res, null, PGSQL_ASSOC);
      //         if ($line) {echo ",\n";}
      // }
      // echo "\n],\n";
      // $endTime = microtime(true);
      //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

    /*
     * PROTEINS
     */

    // $proteinIdField = "id";
    // if (count($searchId_randomId) > 1  || $accAsId) {
    //     $proteinIdField = "accession_number";
    // }

    // $query = "SELECT ".$proteinIdField." AS id, protein.id as real_id,
    //         CASE WHEN name IS NULL OR name = '' OR name = 'REV_' OR name = 'RAN_' THEN accession_number
    //         ELSE name END AS name,
    //         description, accession_number, sequence, is_decoy
    //         FROM protein WHERE id IN ('".implode(array_keys($dbIds), "','")."')";

    $query = "SELECT * FROM db_sequences WHERE upload_id = ".$sid.";";

    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    $interactorAccs = [];
    echo "\"proteins\":[\n";
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
            // $isDecoy = ($line["is_decoy"] == "t")? 'true' : 'false';
            $pId = $line["id"];
            //~ echo '"' . $pId . '":{'
            echo '{'
                . '"id":"' . $pId . '",'
                // . '"real_id":"' . $line["real_id"] . '",'
                . '"name":"' . $line["protein_name"] . '",'
                . '"description":' . $line["description"] . ','
                . '"accession":"' .$line["accession"]  . '",'
                . '"seq_mods":"' .$line["sequence"] . '"'
                // . '"is_decoy":' .$isDecoy
                . "}";

            $interactorAccs[$line["accession"]] = 1;

            $line = pg_fetch_array($res, null, PGSQL_ASSOC);
            if ($line) {echo ",\n";}
        }
    echo "\n]";

	//interactors
	// $interactorQuery = "SELECT * FROM uniprot WHERE accession IN ('"
	// 		.implode(array_keys($interactorAccs), "','")."');";
	// //echo "**".$interactorQuery."**";
    // try {
    //     // @ stops pg_connect echo'ing out failure messages that knacker the returned data
    //     $interactorDbConn = @pg_connect($interactionConnection);// or die('Could not connect: ' . pg_last_error());
    //
    //     if ($interactorDbConn) {
    //         $interactorResult = pg_query($interactorQuery);// or die('Query failed: ' . pg_last_error());
    //         echo "\"interactors\":{\n";
    //         $line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
    //         while ($line) {
    //             echo "\"".$line["accession"]."\":".$line["json"];
    //             $line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
    //             if ($line) {echo ",\n";}
    //         }
    //         echo "\n},";
    //     } else {
    //         throw new Exception ("Could not connect to interaction database");
    //     }
    // } catch (Exception $e) {
    //     //error_log (print_r ("UNIPROT ERR ".$e, true));
    //     echo "\"interactors\":{},\n";
    // }



    echo "}\n";
    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms*/\n\n";

    // Free resultset
    pg_free_result($res);
    // Closing connection
    pg_close($dbconn);

}
?>
