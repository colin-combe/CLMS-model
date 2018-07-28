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
    if (preg_match($pattern, $uploadId) || preg_match($pattern, $spectrumId)){
        exit();
    }

    $id_rands = explode("," , $uploadId);
    $search_meta_json = '{';
    $searchId_randomId = [];
    for ($i = 0; $i < count($id_rands); $i++) {
        if ($i > 0) {
            $search_meta_json = $search_meta_json.',';
        }
        $dashSeperated = explode("-" , $id_rands[$i]);
        $randId = implode('-' , array_slice($dashSeperated, 1 , 4));
        $id = $dashSeperated[0];

        $searchDataQuery = "SELECT * FROM uploads WHERE id = '".$id."';";

        $res = pg_query($searchDataQuery)
                    or die('Query failed: ' . pg_last_error());
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);

        if (count($dashSeperated) == 6){
            $line["group"] = $dashSeperated[5];
        } else {
            $line["group"] = "'NA'";
        }
        if ($line["random_id"] != $randId){
            //echo "no";
            exit();
        }
        $search_meta_json = $search_meta_json.'"'.$id.'":{';
        $v = 0;
        foreach($line as $key=>$value) {
            if ($v > 0) {
                $search_meta_json = $search_meta_json.',';
            }
            $v++;
            if ($value[0] == '{' || $value[0] == '['){
                $search_meta_json = $search_meta_json.'"'.$key.'":'.$value;
            }
            else {
                $search_meta_json = $search_meta_json.'"'.$key.'":"'.$value.'"';
            }
        }
        $search_meta_json = $search_meta_json.'}';
        // $searchId_metaData[$id] = json_encode($line);
        $searchId_randomId[$id] = $randId;
    }
    $search_meta_json = $search_meta_json.'}';
    //keep the long identifier for this combination of searches
    echo '{"sid":"'.$uploadId.'","searches":'.$search_meta_json.',';

    //load data -
    $WHERE_uploadClause = ' (';
    $WHERE_uploadClause_tableP = ' (';
    $i = 0;
    foreach ($searchId_randomId as $id => $randId) {
        if ($i > 0){
            $WHERE_uploadClause = $WHERE_uploadClause.' OR ';
            $WHERE_uploadClause_tableP = $WHERE_uploadClause_tableP.' OR ';
        }
        $WHERE_uploadClause = $WHERE_uploadClause.'(upload_id = '.$id.') ';
        $WHERE_uploadClause_tableP = $WHERE_uploadClause_tableP.'(p.upload_id = '.$id.') ';
        $i++;
    }
    $WHERE_uploadClause = $WHERE_uploadClause.') ';
    $WHERE_uploadClause_tableP = $WHERE_uploadClause_tableP.') ';

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

    $query = "SELECT * FROM modifications WHERE ".$WHERE_uploadClause.";";
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


    $query = "SELECT * FROM spectrum_identifications WHERE ".$WHERE_uploadClause." AND ";
    if ($spectrumId != null) {
        $query = $query. "spectrum_id = ".$spectrumId;
    }
    else {
        $query = $query. "rank = 1";
    }
    $query = $query. " ORDER BY scores->>'score' DESC";
    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
    //~ echo '/*rows:'.pg_num_rows($res)."\n";
    $startTime = microtime(true);
    echo "\"identifications\":[\n";
    $peptideIds = array();
    $sourceIds = array();
    //TODO - use json encode
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
            echo json_encode (array(
                "id"=>$line["id"],
                "pi1"=>$line["pep1_id"],
                "pi2"=>$line["pep2_id"],
                "sp"=>$line["spectrum_id"],
                //"sc"=>json_decode($line["scores"], true)["score"],
                "sc"=>json_decode($line["scores"]),
                "si"=>$line["upload_id"],
                "r"=>$line["rank"],
                "ions"=>$line["ions"],
                "pc_c"=>$line["charge_state"],
                "e_mz"=>$line["exp_mz"],
                "c_mz"=>$line["calc_mz"]
            ));
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
    $query = "SELECT id, peak_list_file_name, scan_id, frag_tol FROM spectra WHERE ".$WHERE_uploadClause.";";
    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
    //~ echo '/*rows:'.pg_num_rows($res)."\n";
    $startTime = microtime(true);
    echo "\"spectra\":[\n";
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
            echo json_encode (array(
                "id"=>$line["id"],
                "file"=>$line["peak_list_file_name"],
                "sn"=>$line["scan_id"],
                "ft"=>$line["frag_tol"]
            ));
            $line = pg_fetch_array($res, null, PGSQL_ASSOC);
            if ($line) {echo ",\n";}
    }
    echo "\n],\n";
    // Free resultset
    pg_free_result($res);
    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

     /*
     * PEPTIDES (including PEPTIDE EVIDENCES)
     */
     $proteinIdField = "dbsequence_ref";
     if (count($searchId_randomId) > 1) {
            $proteinIdField = "protein_accession";
     }
     $query = "SELECT * FROM peptides as p left join (
         select peptide_ref, array_agg(".$proteinIdField.") as proteins,
                array_agg(pep_start) as positions,
                array_agg(is_decoy) as is_decoy,
                upload_id
                from peptide_evidences where ".$WHERE_uploadClause. " group by peptide_ref, upload_id
            )
            as pe on (pe.peptide_ref = p.id AND pe.upload_id = p.upload_id)
            WHERE ".$WHERE_uploadClause_tableP.";";
     //echo '**'.$query."**";
     $startTime = microtime(true);
     $res = pg_query($query) or die('Query failed: ' . pg_last_error());
     $endTime = microtime(true);
     //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
     //~ echo '/*rows:'.pg_num_rows($res)."\n";
     $startTime = microtime(true);
     $proteinIds = [];
     echo "\"peptides\":[\n";
     $line = pg_fetch_array($res, null, PGSQL_ASSOC);
     while ($line){// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
             $proteins = str_replace('"', '',  $line["proteins"]);
             $proteinsArray = explode(",",substr($proteins, 1, strlen($proteins) - 2));
             //get protein ids, in case db_seq missing
             $pCount = count($proteinsArray);
             for ($p = 0; $p < $pCount; $p++) {
                 $proteinIds[$proteinsArray[$p]] = 1;
             }

             $positions = $line['positions'];
             $positionsArray = explode(",",substr($positions, 1, strlen($positions) - 2));
             $pCount = count($positionsArray);
             for ($p = 0; $p < $pCount; $p++) {
                 $positionsArray[$p] = (int) $positionsArray[$p];
             }

             $isDecoys = $line['is_decoy'];
             $isDecoyArray = explode(",",substr($isDecoys, 1, strlen($isDecoys) - 2));
             $dCount = count($isDecoyArray);
             for ($d = 0; $d < $pCount; $d++) {
                 $isDecoyArray[$d] = (int) $isDecoyArray[$d];
             }

             echo json_encode (array(
                 "id"=>$line["id"],
                 "u_id"=>$line["upload_id"],
                 "seq_mods"=>$line["seq_mods"],
                 "linkSite"=>(int) $line["link_site"],
                 "clModMass"=>$line["crosslinker_modmass"],
                 "prt"=>$proteinsArray,
                 "pos"=>$positionsArray,
                 "is_decoy"=>$isDecoyArray
             ));

             $line = pg_fetch_array($res, null, PGSQL_ASSOC);
             if ($line) {echo ",\n";}
     }
     echo "\n],\n";
    // Free resultset
    pg_free_result($res);
     $endTime = microtime(true);
     //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

    /*
     * PROTEINS
     */

    $proteinIdField = "id";
    if (count($searchId_randomId) > 1) {
        $proteinIdField = "accession";
    }

    $query = "SELECT * FROM db_sequences WHERE ".$WHERE_uploadClause.";";

    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    $interactorAccs = [];
    echo "\"proteins\":[\n";
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    if (!$line){
        //get from uniprot table
        $pCount = count($proteinIds);
        $pKeys = array_keys($proteinIds);
        for ($p = 0; $p < $pCount; $p++){
            echo '{'
                . '"id":"' . $pKeys[$p] . '",'
                . '"name":"' . $pKeys[$p] . '",'
                . '"description":"' . $pKeys[$p] . '",'
                . '"accession":"' .$pKeys[$p]  . '",'
                . '"seq_mods":"'  .'ABCDEFG' . '"'
                // . '"is_decoy":' .$isDecoy
                . "}";
            if ($p < ($pCount - 1)) {echo ",\n";}
        }
    }
    else {
        while ($line){
                $pId = $line[$proteinIdField];

                echo json_encode(array(
                    "id"=>$pId,
                    "name"=>$line["protein_name"],
                    "description"=>$line["description"],
                    "accession"=>$line["accession"],
                    "seq_mods"=>$line["sequence"]
                ));

                $interactorAccs[$line["accession"]] = 1;

                $line = pg_fetch_array($res, null, PGSQL_ASSOC);
                if ($line) {echo ",\n";}
        }
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
    //pg_free_result($res);
    // Closing connection
    pg_close($dbconn);

}
?>
