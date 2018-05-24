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

    include('../../connectionString.php');
    $dbconn = pg_connect($connectionString) or die('Could not connect: ' . pg_last_error());

    $uploadId = urldecode($_GET["upload"]);
    if (isset($_GET["spectrum"])){
        $spectrumId = urldecode($_GET["spectrum"]);
    }
    else {
        $spectrumId = null;
    }
    //SQL injection defense
    $pattern = '/[^0-9,\-]/';
    if (preg_match($pattern, $uid) || preg_match($pattern, $sid)){
        exit;
    }


    //keep the long identifier for this combination of searches
    echo '{"sid":"'.$uploadId.'",';

    // TODO - aggreated uploads
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


        $searchId_metaData[$id] = $line;
        $searchId_randomId[$id] = $randId;
    }

    echo "\"searches\":".json_encode($searchId_metaData). ",\n";
*/
/*    // TODO Stored layouts
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


    $query = "SELECT * FROM uploads WHERE id = ".$uploadId.";";
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    echo "\"searches\":".json_encode($line). ",\n";
    // Free resultset
    pg_free_result($res);



    $query = "SELECT * FROM modifications WHERE upload_id = ".$uploadId.";";
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    $modifications = [];
    while ($line) {
        array_push($modifications, $line);
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    }
    echo "\"modifications\":".json_encode($modifications). ",\n";
    // Free resultset
    pg_free_result($res);

    //load data -

    $query = "SELECT * FROM spectrum_identifications WHERE upload_id = ".$uploadId." AND ";
    if ($spectrumId != null) {
        $query = $query. "spectrum_id = ".$spectrumId.";";
    }
    else {
        $query = $query. "rank = 1;";
    }
    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
    //~ echo '/*rows:'.pg_num_rows($res)."\n";
    $startTime = microtime(true);
    echo "\"identifications\":[\n";
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
    // Free resultset
    pg_free_result($res);
    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

    /*
     * SPECTRA
     */
    $query = "SELECT id, peak_list_file_name, scan_id, frag_tol FROM spectra WHERE upload_id = ".$uploadId.";";
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
    // Free resultset
    pg_free_result($res);
    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";


    /*
     * PEPTIDES
     */

// SELECT (array_agg(p.seq_mods))[1] as seq_mods, (array_agg(p.link_site))[1] as link_site,
// (array_agg(pe.start)) as pos,(array_agg(pe.dbsequence_ref)) as prt
// FROM peptides p JOIN (select * from peptide_evidences where upload_id = 1) pe on p.id = pe.peptide_ref
// WHERE p.upload_id = 1 group by p.id;

     $query = "SELECT * FROM peptides as p left join (select peptide_ref, array_agg(dbsequence_ref) as proteins, array_agg(pep_start) as positions, array_agg(is_decoy) as is_decoy from peptide_evidences where upload_id = " . $uploadId . " group by peptide_ref) as pe on pe.peptide_ref = p.id WHERE upload_id = ".$uploadId.";";
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
    // Free resultset
    pg_free_result($res);
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

    $query = "SELECT * FROM db_sequences WHERE upload_id = ".$uploadId.";";

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
    // Free resultset
    pg_free_result($res);

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
