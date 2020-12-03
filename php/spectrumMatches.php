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

header("Cache-Control: max-age=25920000, private"); //300days (60sec * 60min * 24hours * 300days)

if (count($_GET) > 0) {
    include('../../connectionString.php');
    $dbconn = pg_connect($connectionString) or die('Could not connect: ' . pg_last_error());

    $uploadId = urldecode($_GET["upload"]);

    if (isset($_GET["spectrum"])) {
        $spectrumId = urldecode($_GET["spectrum"]);
    } else {
        $spectrumId = null;
    }

    $linears = false;
    if (isset($_GET['linears'])) {
        if ($_GET['linears'] === '1' || $_GET['linears'] === '0') {
            $linears = (bool) $_GET['linears'];
        }
    }

    $matchid = '';
    if (isset($_GET['matchid'])) {
        $matchid = (string) $_GET['matchid'];
    }

    $pattern = '/[^0-9,\-_]/';
    if (preg_match($pattern, $uploadId)
            || preg_match($pattern, $spectrumId)
            || preg_match($pattern, $linears)
            || preg_match($pattern, $matchid)) {
        exit();
    }

    $id_rands = explode(",", $uploadId);
    $searchId_randomId = [];
    for ($i = 0; $i < count($id_rands); $i++) {
        $dashSeperated = explode("-", $id_rands[$i]);
        $randId = implode('-', array_slice($dashSeperated, 1, 4));
        $id = $dashSeperated[0];

        $searchDataQuery = "SELECT * FROM uploads WHERE id = '".$id."';";

        $res = pg_query($searchDataQuery)
                    or die('Query failed: ' . pg_last_error());
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);

        // json decoding
        $line["peak_list_file_names"] = json_decode($line["peak_list_file_names"]);
        $line["analysis_software"] = json_decode($line["analysis_software"]);
        $line["provider"] = json_decode($line["provider"]);
        $line["audits"] = json_decode($line["audits"]);
        $line["samples"] = json_decode($line["samples"]);
        $line["analyses"] = json_decode($line["analyses"]);
        $line["protocol"] = json_decode($line["protocol"]);
        $line["bib"] = json_decode($line["bib"]);
        $line["spectra_formats"] = json_decode($line["spectra_formats"]);
        $line["upload_warnings"] = json_decode($line["upload_warnings"]);

        if (count($dashSeperated) == 6) {
            $line["group"] = $dashSeperated[5];
        } else {
            $line["group"] = "'NA'";
        }
        if ($line["random_id"] != $randId) {
            //echo "no";
            exit();
        }
        $searchId_metaData[$id] = $line;
        $searchId_randomId[$id] = $randId;
    }

    $output = [];
    $output["sid"] = $uploadId;
    $output["searches"] = $searchId_metaData;

    //load data -
    $WHERE_uploadClause = ' (';
    $WHERE_uploadClause_tableP = ' (';
    $i = 0;
    foreach ($searchId_randomId as $id => $randId) {
        if ($i > 0) {
            $WHERE_uploadClause = $WHERE_uploadClause.' OR ';
            $WHERE_uploadClause_tableP = $WHERE_uploadClause_tableP.' OR ';
        }
        $WHERE_uploadClause = $WHERE_uploadClause.'(upload_id = '.$id.') ';
        $WHERE_uploadClause_tableP = $WHERE_uploadClause_tableP.'(p.upload_id = '.$id.') ';
        $i++;
    }
    $WHERE_uploadClause = $WHERE_uploadClause.') ';
    $WHERE_uploadClause_tableP = $WHERE_uploadClause_tableP.') ';

    // Stored layouts
    //TODO _loading wrong one by default?
    $layoutQuery = "SELECT t1.layout AS l, t1.description AS n  "
    . " FROM layouts AS t1 "
    . " WHERE t1.search_id LIKE '" . $uploadId . "' "
    . " AND t1.time = (SELECT max(t1.time) FROM layouts AS t1 "
    . " WHERE t1.search_id LIKE '" . $uploadId . "' );";

    $layoutResult = pg_query($layoutQuery) or die('Query failed: ' . pg_last_error());
    while ($line = pg_fetch_array($layoutResult, null, PGSQL_ASSOC)) {
        $output["xiNETLayout"] = [];
        $output["xiNETLayout"]["name"] = $line["n"];
        $output["xiNETLayout"]["layout"] = json_decode(stripslashes($line["l"]));
    }

    $query = "SELECT * FROM modifications WHERE ".$WHERE_uploadClause.";";
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    $modifications = [];
    while ($line) {
        array_push($modifications, $line);
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    }
    //echo "\"modifications\":".json_encode($modifications). ",\n";
    $output["modifications"] = $modifications;
    // Free resultset
    pg_free_result($res);


    $query = "SELECT * FROM spectrum_identifications WHERE ".$WHERE_uploadClause." AND ";
    if ($spectrumId != null) {
        $query = $query. "spectrum_id = ".$spectrumId;
    } else {
        $query = $query. "rank = 1";
    }
    # $query = $query. " ORDER BY scores->>'xi:score' DESC";
    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
    //~ echo '/*rows:'.pg_num_rows($res)."\n";
    $startTime = microtime(true);
    //echo "\"identifications\":[\n";
    $identifications = [];
    $peptideIds = [];
    $sourceIds = [];
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    while ($line) {// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
        array_push($identifications, array(
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
                "c_mz"=>$line["calc_mz"],
                "pass"=>$line["pass_threshold"]
            ));
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);
        // if ($line) {echo ",\n";}
    }
    // echo "\n],\n";
    $output["identifications"] = $identifications;
    // Free resultset
    pg_free_result($res);
    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms\n\n";

    /*
     * SPECTRA
     */
    $query = "SELECT id, upload_id, peak_list_file_name, scan_id, frag_tol,  (peak_list is not null) as pks FROM spectra WHERE ".$WHERE_uploadClause.";";
    $startTime = microtime(true);
    $res = pg_query($query) or die('Query failed: ' . pg_last_error());
    $endTime = microtime(true);
    //~ echo '/*db time: '.($endTime - $startTime)."ms\n";
    //~ echo '/*rows:'.pg_num_rows($res)."\n";
    $startTime = microtime(true);
    //echo "\"spectra\":[\n";
    $spectra = [];
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    while ($line) {// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
        array_push($spectra, array(
                "id"=>$line["id"],
                "up_id"=>$line["upload_id"],
                "file"=>$line["peak_list_file_name"],
                "sn"=>$line["scan_id"],
                "ft"=>$line["frag_tol"],
                "pks"=>($line["pks"] == 't')
            ));
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);
        //if ($line) {echo ",\n";}
    }
    //echo "\n],\n";
    $output["spectra"] = $spectra;
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
    //echo "\"peptides\":[\n";
    $peptides = [];
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    while ($line) {// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
        $proteins = str_replace('"', '', $line["proteins"]);
        $proteinsArray = explode(",", substr($proteins, 1, strlen($proteins) - 2));
        //get protein ids, in case db_seq missing
        $pCount = count($proteinsArray);
        for ($p = 0; $p < $pCount; $p++) {
            $proteinIds[$proteinsArray[$p]] = 1;
        }

        $positions = $line['positions'];
        $positionsArray = explode(",", substr($positions, 1, strlen($positions) - 2));
        $pCount = count($positionsArray);
        for ($p = 0; $p < $pCount; $p++) {
            $positionsArray[$p] = (int) $positionsArray[$p];
        }

        $isDecoys = $line['is_decoy'];
        $isDecoyArray = explode(",", substr($isDecoys, 1, strlen($isDecoys) - 2));
        $dCount = count($isDecoyArray);
        for ($d = 0; $d < $pCount; $d++) {
            $isDecoyArray[$d] = $isDecoyArray[$d] == 't' ? 1 : 0;
        }

        array_push($peptides, array(
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
        //if ($line) {echo ",\n";}
    }
    //echo "\n],\n";
    $output["peptides"] = $peptides;
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
    //echo "\"proteins\":[\n";
    $proteins = [];
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);
    if (!$line) {
        //get from uniprot table
        // $pCount = count($proteinIds);
        // $pKeys = array_keys($proteinIds);
        // for ($p = 0; $p < $pCount; $p++){
        //     echo '{'
        //         . '"id":"' . $pKeys[$p] . '",'
        //         . '"name":"' . $pKeys[$p] . '",'
        //         . '"description":"' . $pKeys[$p] . '",'
        //         . '"accession":"' .$pKeys[$p]  . '",'
        //         . '"seq_mods":"'  .'ABCDEFG' . '"'
        //         // . '"is_decoy":' .$isDecoy
        //         . "}";
        //     if ($p < ($pCount - 1)) {echo ",\n";}
        // }
    } else {
        while ($line) {
            $pId = $line[$proteinIdField];

            array_push($proteins, array(
                    "id"=>$pId,
                    "name"=>$line["protein_name"],
                    "description"=>$line["description"],
                    "accession"=>$line["accession"],
                    "seq_mods"=>$line["sequence"]
                ));

            $interactorAccs[$line["accession"]] = 1;

            $line = pg_fetch_array($res, null, PGSQL_ASSOC);
            //if ($line) {echo ",\n";}
        }
    }
    //echo "\n]";
    $output["proteins"] = $proteins;
    // Free resultset
    pg_free_result($res);

    //interactors
    $interactors = [];
    $interactorQuery = "SELECT accession, sequence, gene, array_to_json(keywords) as keywords, array_to_json(comments) as comments, features, array_to_json(go) AS go FROM uniprot_trembl WHERE accession IN ('"             .implode(array_keys($interactorAccs), "','")."');";
     try {
         // @ stops pg_connect echo'ing out failure messages that knacker the returned data
         $interactorDbConn = @pg_connect($interactionConnection);
         if ($interactorDbConn) {
             $interactorResult = pg_query($interactorQuery);
             $line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
             while ($line) {
                 $line["features"] = json_decode($line["features"]);
                 $line["go"] = json_decode($line["go"]);
                 $line["keywords"] = json_decode($line["keywords"]);
                 $line["comments"] = json_decode($line["comments"]);
                 $line["gene"] = $line["gene"];
                 $interactors[$line["accession"]] = $line;
                 $line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
             }
         } else {
             throw new Exception("Could not connect to interaction database");
         }
     } catch (Exception $e) {
         $output["error"] = "Could not connect to uniprot interactor database";
     }
    $output["interactors"] = $interactors;

    $endTime = microtime(true);
    //~ echo '/*php time: '.($endTime - $startTime)."ms*/\n\n";
    //echo ",\n";

    if ($matchid !== "") {	// send matchid back for sync purposes
        $output["matchid"] = $matchid;
    }
    // else {
    //     echo "}";
    // }
    // Free resultset
    pg_free_result($interactorResult);
    // Closing connection
    pg_close($dbconn);
    pg_close($interactorDbConn);

    echo json_encode($output);
}
