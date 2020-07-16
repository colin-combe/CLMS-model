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

    $output = [];

    $dbconn = @pg_connect($connectionString);// or die('Could not connect to database.');
    if ($dbconn) {
        try {
        $sid = urldecode($_GET["sid"]);

        $unval = false;
        if (isset($_GET['unval'])) {
            if ($_GET['unval'] === '1' || $_GET['unval'] === '0') {
                $unval = (bool) $_GET['unval'];
            }
        }

        $linears = false;
        if (isset($_GET['linears'])) {
            if ($_GET['linears'] === '1' || $_GET['linears'] === '0') {
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

        $accAsId = true;
        // if (isset($_GET['accAsId'])) {
        //     if ($_GET['accAsId'] === '1' || $_GET['accAsId'] === '0') {
        //         $accAsId = (bool) $_GET['accAsId'];
        //     }
        // }

        //SQL injection defense
        $pattern = '/[^0-9,\-]/';
        if (preg_match($pattern, $sid)
            || preg_match($pattern, $unval)
            || preg_match($pattern, $linears)
            || preg_match($pattern, $spectrum)
            || preg_match($pattern, $matchid)
            || preg_match($pattern, $lowestScore)
            || preg_match($pattern, $accAsId)
            ) {
            exit();
        }

        //keep the long identifier for this combination of searches
        $output["sid"] = $sid;

        //get search meta data
        $id_rands = explode(",", $sid);
        $searchId_metaData = [];
        $searchId_randomId = [];
        $missingSearchIDs = [];
        $incorrectSearchIDs = [];


        $times = array();
        $times["startAbsolute"] = microtime(true);
        $zz = $times["startAbsolute"];

        for ($i = 0; $i < count($id_rands); $i++) {
            $dashSeperated = explode("-", $id_rands[$i]);
            $randId = implode('-', array_slice($dashSeperated, 1, 4));
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
                $line = pg_fetch_assoc($res);

            if (pg_num_rows($res) === 0) {
                $missingSearchIDs[$id] = true;
            } elseif ($randId !== $line["random_id"]) {
                $incorrectSearchIDs[$id] = true;
            } else {
                if (count($dashSeperated) == 6) {
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

                //ions
                $ionsQuery = "SELECT * FROM chosen_ions ci INNER JOIN ion i ON ci.ion_id = i.id
                 WHERE ci.paramset_id = '".$psId."';";
                $ionsResult = pg_query($dbconn, $ionsQuery)
                            or die('Query failed: ' . pg_last_error());
                $ions = [];
                while ($ion = pg_fetch_object($ionsResult)) {
                    array_push(
                        $ions,
                        (object) ['type' => explode(':', $ion -> description)[1]]
                    );
                }
                $line["ionTypes"] = $ions;
                // Free resultset
                pg_free_result($ionsResult);

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
                //  $crosslinkerQuery = "SELECT * FROM chosen_crosslinker cc INNER JOIN crosslinker cl ON cc.crosslinker_id = cl.id
                //  WHERE cc.paramset_id = '".$psId."';";

                //lutz...
                //https://github.com/Rappsilber-Laboratory/xi3-issue-tracker/issues/473#issuecomment-658401738
                $crosslinkerQuery = "SELECT regexp_replace(d,'\s*(.*)','\\1','i') AS description, regexp_replace(d,'.*[;:]ID:\s*([0-9]*).*','\\1','i')::int AS id, regexp_replace(d,'.*[;:]mass:\s*([+-]?[0-9.]*).*','\\1','i') AS mass, regexp_replace(d,'.*[;:]name:\s*([^;]*).*','\\1','i') AS name, d ~* '.*[;:]decoy.*' as is_decoy, false as is_default   FROM (SELECT  unnest(regexp_split_to_array(customsettings,E'\n','i')) AS d FROM parameter_set WHERE id = ".$psId.") c WHERE c.d ~* '\s*crosslinker:.*' UNION SELECT description as d, cl.id, mass, name, is_decoy, is_default FROM chosen_crosslinker cc INNER JOIN crosslinker cl ON cc.crosslinker_id = cl.id WHERE cc.paramset_id = ".$psId.";";

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
        $times["searchData"] = microtime(true) - $zz;
        $zz = microtime(true);

        if (count($missingSearchIDs) > 0 || count($incorrectSearchIDs) > 0) {
            // missing / mangled any of the search id's then bail out, and add these fields to output to inform user back in javascriptland
            $output["missingSearchIDs"] = array_keys($missingSearchIDs);
            $output["incorrectSearchIDs"] = array_keys($incorrectSearchIDs);
            //echo "\"{missingSearchIDs\":".json_encode(array_keys($missingSearchIDs)).",\n\"incorrectSearchIDs\":".json_encode(array_keys($incorrectSearchIDs))."}\n";
        } else {
            $output["searches"] = $searchId_metaData;

            //Stored layouts
            $layoutQuery = "SELECT t1.layout AS l, t1.description AS n "
                    . " FROM layouts AS t1 "
                    . " WHERE t1.search_id LIKE '" . $sid . "' "
                        . " ORDER BY t1.time desc LIMIT 1"
                        //. " AND t1.time = (SELECT max(t1.time) FROM layouts AS t1 "
                        //. " WHERE t1.search_id LIKE '" . $sid . "' );"
                ;

            $layoutResult = pg_query($layoutQuery) or die('Query failed: ' . pg_last_error());
                if ($line = pg_fetch_assoc($layoutResult)) {
                $output["xiNETLayout"] = [];
                $output["xiNETLayout"]["name"] = $line["n"];
                $output["xiNETLayout"]["layout"] = json_decode(stripslashes($line["l"]));
            }
            $times["layoutData"] = microtime(true) - $zz;
            $zz = microtime(true);

            //load data -
            $WHERE_spectrumMatch = ' ( ( '; //WHERE clause for spectrumMatch table
            $WHERE_matchedPeptide = ' ( ';//WHERE clause for matchedPeptide table
            $i = 0;
            foreach ($searchId_randomId as $key => $value) {
                if ($i > 0) {
                    $WHERE_spectrumMatch = $WHERE_spectrumMatch.' OR ';
                    $WHERE_matchedPeptide = $WHERE_matchedPeptide.' OR ';
                }
                $id = $key;
                $randId = $value;
                // an IN clause seems to be slower
                $WHERE_spectrumMatch = $WHERE_spectrumMatch.'(search_id = '.$id.') ';
                $WHERE_matchedPeptide = $WHERE_matchedPeptide.'search_id = '.$id.'';

                $i++;
            }
            $WHERE_spectrumMatch = $WHERE_spectrumMatch.' ) AND score >= '.$lowestScore;
            if (isset($_GET['highestScore'])) {
                $WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND score <= '.((float) $_GET['highestScore']).') ';
            } else {
                $WHERE_spectrumMatch = $WHERE_spectrumMatch.') ';
            }
            $WHERE_matchedPeptide = $WHERE_matchedPeptide.' ) ';

            // if ($decoys == false){
            // 	$WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND (NOT is_decoy) ';
            // }

            if ($unval == false) {
                $WHERE_spectrumMatch = $WHERE_spectrumMatch." AND ((sm.autovalidated = true AND (sm.rejected != true OR sm.rejected is null)) OR
                            (sm.validated LIKE 'A') OR (sm.validated LIKE 'B') OR (sm.validated LIKE 'C')
                            OR (sm.validated LIKE '?')) ";
            }


            if ($spectrum) {
                $WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND spectrum_id = ' . $spectrum . ' ';
            } else {
                $WHERE_spectrumMatch = $WHERE_spectrumMatch.' AND dynamic_rank ';
            }

            /*
             * SPECTRUM MATCHES AND MATCHED PEPTIDES
             */

            $times["specString"] = microtime(true) - $zz;
            $zz = microtime(true);

            if ($linears == false) {
                $WHERE_matchedPeptide = $WHERE_matchedPeptide." AND link_position != -1 ";
            }

            $query = "
                    SELECT
                            mp.match_id, mtypes, mpeps, link_positions, mclid, sm.spectrum_id,
                            ROUND(sm.score,2) as score, sm.autovalidated, sm.validated, sm.rejected,
                    sm.search_id, sm.is_decoy, sm.calc_mass, sm.precursor_charge,
                    sp.scan_number, sp.scan_index, sp.source_id as source, sp.peaklist_id as plfid,
                    sp.precursor_intensity, sp.precursor_mz, sp.elution_time_start, sp.elution_time_end
                FROM
                    (SELECT sm.id, sm.score, sm.autovalidated, sm.validated, sm.rejected,
                    sm.search_id, sm.precursor_charge, sm.is_decoy, sm.spectrum_id,
                    sm.calc_mass
                            FROM spectrum_match sm
                    WHERE ".$WHERE_spectrumMatch.") sm
                INNER JOIN
                           (SELECT mp.match_id, string_agg(mp.match_type::text,',') as mtypes, string_agg(mp.peptide_id::text,',') as mpeps,
                            json_agg(mp.link_position + 1) as link_positions, max(COALESCE(mp.crosslinker_id, -1)) as mclid
                            FROM matched_peptide mp WHERE ".$WHERE_matchedPeptide." GROUP BY mp.match_id) mp
                    ON sm.id = mp.match_id
                INNER JOIN spectrum sp ON sm.spectrum_id = sp.id
                        ORDER BY score DESC, sm.id;";
        //}

            $res = pg_query($query) or die('{"error": "Query failed: ' . pg_last_error().'"}');
            $times["matchQueryDone"] = microtime(true) - $zz;
            $zz = microtime(true);

            $matches = [];

            function jsonagg_number_split ($str) {
                $arr = explode(', ', substr($str, 1, -1));
                $arrCount = count($arr);
                for ($i = 0; $i < $arrCount; $i++) {
                    $arr[$i] = +$arr[$i];
                }
                return $arr;
            }

            function stringagg_number_split ($str) {
                $arr = explode(',', $str);
                $arrCount = count($arr);
                for ($i = 0; $i < $arrCount; $i++) {
                    $arr[$i] = +$arr[$i];
                }
                return $arr;
            }

            //error_log (print_r ("1 ".memory_get_usage(), true));

            $peptideIds = array();
            $sourceIds = array();
            $peakListIds = array();
                $line = pg_fetch_assoc($res);
                //$lineCount = 0;
                while ($line) {
                    //error_log (print_r ($line["mpeps"], true));
                    $peptideId = stringagg_number_split($line["mpeps"]); //json_decode($line["mpeps"]);

                    foreach ($peptideId as $value) {
                        $peptideIds[strval($value)] = 1;
                    }

                $sourceId = $line["source"];
                $sourceIds[$sourceId] = 1;
                $peakListId = $line["plfid"];
                if(isset($peakListId)){
                    $peakListIds[$peakListId] = 1;
                }
                    $matches[] = array(
                        "id"=>+$line["match_id"],
                            "ty"=>stringagg_number_split($line["mtypes"]),
                            "pi"=>$peptideId,
                            "lp"=>jsonagg_number_split($line["link_positions"]),
                            "cl"=>+$line["mclid"],
                        "spec"=>$line["spectrum_id"],
                            "sc"=>+$line["score"],
                        "si"=>+$line["search_id"],
                        "dc"=>$line["is_decoy"],
                        "av"=>$line["autovalidated"],
                        "v"=>$line["validated"],
                        "rj"=>$line["rejected"],
                        "sc_i"=>$line["scan_index"],
                        "src"=>$sourceId,
                        "plf"=>$peakListId,
                        "sn"=>+$line["scan_number"],
                        "pc_c"=>+$line["precursor_charge"],
                        "pc_mz"=>+$line["precursor_mz"],
                        "cm"=>+$line["calc_mass"],
                        "pc_i"=>+$line["precursor_intensity"],
                        "e_s"=>+$line["elution_time_start"],
                        "e_e"=>+$line["elution_time_end"]
                        )
                    ;

                    $line = pg_fetch_assoc($res);
                    //$lineCount++;
            }

                pg_free_result ($res);

                //error_log (print_r ("2 ".memory_get_usage(), true));
            $output["rawMatches"] = $matches; //TODO - rename to matches or PSM

                //error_log (print_r ($matches, true));

            $times["matchQueryToArray"] = microtime(true) - $zz;
            $zz = microtime(true);

            /*
             * SPECTRUM SOURCES
             */
            $spectrumSources = [];
            if (sizeof($sourceIds) > 0) {
                $implodedSourceIds = '('.implode(array_keys($sourceIds), ",").')';
                $query = "SELECT src.id, src.name
                    FROM spectrum_source AS src WHERE src.id IN "
                            .$implodedSourceIds.";";
                $res = pg_query($query) or die('Query failed: ' . pg_last_error());

                    $spectrumSources = pg_fetch_all ($res);
            }
            $output["spectrumSources"] = $spectrumSources;
            $times["spectrumSources"] = microtime(true) - $zz;
            $zz = microtime(true);
            /*
             * PEAK LIST FILES
             */
            $peakListFiles = [];
            if (isset ($peakListIds) && sizeof($peakListIds) > 0) {
                $implodedPeakListIds = '('.implode(array_keys($peakListIds), ",").')';
                $query = "SELECT plf.id, plf.name
                    FROM peaklistfile AS plf WHERE plf.id IN "
                            .$implodedPeakListIds.";";
                $res = pg_query($query) or die('Query failed: ' . pg_last_error());

                    $peakListFiles = pg_fetch_all ($res);
            }
            $output["peakListFiles"] = $peakListFiles;
            $times["peakListFiles"] = microtime(true) - $zz;
            $zz = microtime(true);


            $proteinIdField = "hp.protein_id";
            if (count($searchId_randomId) > 1 || $accAsId) {
                $proteinIdField = "p.accession_number";
            }

            /*
             * PEPTIDES
             */
            $peptides = [];
                $dbIds = [];
            if (sizeof($peptideIds) > 0) {
                $implodedPepIds = '('.implode(array_keys($peptideIds), ",").')';
                $query = "SELECT pep.id, (array_agg(pep.sequence))[1] as sequence,
                        string_agg(".$proteinIdField."::text,',') as proteins, string_agg(hp.protein_id::text,',') as test, json_agg(hp.peptide_position + 1) as positions
                    FROM (SELECT id, sequence FROM peptide WHERE id IN "
                            .$implodedPepIds.") pep
                    INNER JOIN (SELECT peptide_id, protein_id, peptide_position
                    FROM has_protein WHERE peptide_id IN "
                            .$implodedPepIds.") hp ON pep.id = hp.peptide_id ";
                $query = $query."INNER JOIN protein p ON hp.protein_id = p.id ";
                $query = $query."GROUP BY pep.id;";

                $res = pg_query($query) or die('Query failed: ' . pg_last_error());
                $times["peptideQuery"] = microtime(true) - $zz;
                $zz = microtime(true);
                    $line = pg_fetch_assoc($res);
                while ($line) {
                    $proteins = $line["proteins"];
                        $proteinsArray = explode(",", $proteins);
                    $protCount = count($proteinsArray);
                    for ($p = 0; $p < $protCount; $p++) {
                        $id = $proteinsArray[$p];
                            //if (strpos($id, '"') === 0) {
                            if (strncmp ($id, '"', 1) === 0) {
                                $proteinsArray[$p] = substr($id, 1, -1);
                        }
                    }
                    $dbProteinIds = $line["test"];
                        $dbProteinsArray = explode(",", $dbProteinIds);
                    foreach ($dbProteinsArray as $v) {
                        $dbIds[$v] = 1;
                    }

                        $positionsArray = jsonagg_number_split ($line['positions']);

                        $peptides[] = array(
                            "id"=>+$line["id"],
                            "seq_mods"=>$line["sequence"],
                            "prt"=>$proteinsArray,
                            "pos"=>$positionsArray
                        );

                        $line = pg_fetch_assoc($res);
                }
                     //error_log (print_r ($dbIds, true));
                    //error_log (print_r (count($peptides), true));
                     //error_log (print_r ($peptideIds, true));
                    pg_free_result ($res);
                $output["peptides"] = $peptides;

                $times["peptideQueryToArray"] = microtime(true) - $zz;
                $zz = microtime(true);

                /*
                 * PROTEINS
                 */
                $proteins = [];

                $proteinIdField = "id";
                if (count($searchId_randomId) > 1  || $accAsId) {
                    $proteinIdField = "accession_number";
                }

                $query = "SELECT ".$proteinIdField." AS id,
                        CASE WHEN name IS NULL OR name = '' OR name = 'REV_' OR name = 'RAN_' THEN accession_number
                        ELSE name END AS name,
                            description, accession_number as accession, sequence as seq_mods, is_decoy
                        FROM protein WHERE id IN ('".implode(array_keys($dbIds), "','")."')";
                $res = pg_query($query) or die('Query failed: ' . pg_last_error());
                    $times["proteinQuery"] = microtime(true) - $zz;
                    $zz = microtime(true);
                $interactorAccs = [];

                    $line = pg_fetch_assoc($res);
                while ($line) {// = pg_fetch_array($res, null, PGSQL_ASSOC)) {
                    $isDecoy = $line["is_decoy"] == "t";
                        $line["is_decoy"] = $isDecoy;   // turn is_decoy into boolean

                        $proteins[] = $line;    //  can copy from db results as we set the field names to be the same^^^
                        if (!$isDecoy) {
                            $interactorAccs[preg_split("/-/", $line["accession"])[0]] = 1;//echo "**".$interactorQuery."**";
                      }
                      $line = pg_fetch_assoc($res);

                }
                $output["proteins"] = $proteins;
                    $times["proteinQueryToArray"] = microtime(true) - $zz;
                $zz = microtime(true);

                //interactors
                $interactors = [];
//                 $interactorQuery = "SELECT accession, sequence, features, array_to_json(go) AS go FROM uniprot_trembl WHERE accession IN ('"
//                         .implode(array_keys($interactorAccs), "','")."');";
//                 try {
//                     // @ stops pg_connect echo'ing out failure messages that knacker the returned data
//                     $interactorDbConn = @pg_connect($interactionConnection);
//                     if ($interactorDbConn) {
//                         $interactorResult = pg_query($interactorQuery);
//                         $line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
//                         while ($line) {
//                             $line["features"] = json_decode($line["features"]);
//                             $line["go"] = json_decode($line["go"]);
//                             $interactors[$line["accession"]] = $line;
//                             $line = pg_fetch_array($interactorResult, null, PGSQL_ASSOC);
//                         }
//                     } else {
//                         throw new Exception("Could not connect to uniprot interactor database");
//                     }
//                 } catch (Exception $e) {
//                     $output["warn"] = "Could not connect to uniprot interactor database";
//                 }
                $output["interactors"] = $interactors;
                $times["uniprotQuery"] = microtime(true) - $zz;
                $zz = microtime(true);

                if ($matchid !== "") {	// send matchid back for sync purposes
                    $output["matchid"] = $matchid;
                }

                $times["endAbsolute"] = microtime(true);
            }
        }

        $output["times"] = $times;
        $output["timeStamp"] = $_SERVER["REQUEST_TIME"];

        // Free resultset
        pg_free_result($res);
        } catch (Exception $e) {
            $output["error"] = $e;
        }
        // Closing connection
        pg_close($dbconn);
    } else {
        $output["error"] = "Could not connect to database";
    }

    echo json_encode($output);
}
