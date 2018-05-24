<?php

	$spectrum_ref = $_GET['id'];
	if (session_status() === PHP_SESSION_NONE){session_start();}

	if ($_GET['tmp'] == '1'){
		$dbname = "tmp/".$_GET['db'];
	}
	elseif (isset($_GET['db'])){
		$dbname = "saved/".$_GET['db'];
	}
	else {
		die();
	}

	//check authentication
	if(!isset($_SESSION['access'])) $_SESSION['access'] = array();
	if(!in_array($_GET['db'], $_SESSION['access'])){
		//if no valid authentication re-test authentication
		//this includes a connection string to the sql database
		require('../../xiSPEC_sql_conn.php');
		require('checkAuth.php');
	}
	// re-check authentication
	if(!in_array($_GET['db'], $_SESSION['access'])){
		$json['error'] = "Authentication error occured!";
		die(json_encode($json));
	}

	$xiSPEC_ms_parser_dir = '../../xiSPEC_ms_parser/';
	$dir = 'sqlite:'.$xiSPEC_ms_parser_dir.'/dbs/'.$dbname.'.db';
	$dbh = new PDO($dir) or die("cannot open the database");
	$dbh->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

	//ToDo: not needed? if we use first internal_id
	if ($spectrum_ref == -1){
		$stmt = $dbh->prepare("SELECT spectrum_ref FROM spectra LIMIT 1");
		if ($stmt->execute()) {
			while ($row = $stmt->fetch()) {
				$spectrum_ref = $row['spectrum_ref'];
			}
		}
	}

	$JSON = array();

	if (isset($_GET['sname'])){
		$scoreName = $_GET['sname'];

		$sql = "SELECT
				si.id AS identification_id,
				sp.spectrum_ref AS spectrum_ref,
				pep1_table.seq_mods AS pep1,
				pep2_table.seq_mods AS pep2,
				pep1_table.link_site AS linkpos1,
				pep2_table.link_site AS linkpos2,
				si.charge_state AS charge,
				MAX(pep1_ev.decoy, COALESCE(pep2_ev.decoy, 0)) as is_decoy,
				pep1_ev.decoy AS decoy1,
				pep2_ev.decoy AS decoy2,
				atom AS score,
				si.scores AS scores,
				pep1_ev.protein AS protein1,
				pep2_ev.protein AS protein2,
				si.pass_threshold AS pass_threshold,
				si.rank AS rank
				sp.peak_list_file_name AS file,
				sp.scan_id AS scan_id
				FROM spectrum_identifications AS si, json_each(si.scores)
				LEFT JOIN spectra AS sp ON (si.spectrum_id = sp.id)
				LEFT JOIN peptides AS pep1 ON (si.pep1_id = pep1_table.id)
				LEFT JOIN
					(SELECT peptide_ref, group_concat(DISTINCT protein_accession) AS protein,
					group_concat(DISTINCT is_decoy) AS decoy
					FROM peptide_evidences GROUP BY peptide_ref) AS pep1_ev ON (si.pep1_id = pep1_ev.peptide_ref)
				LEFT JOIN peptides AS pep2 ON (si.pep2_id = pep2.id)
				LEFT JOIN
					(SELECT peptide_ref, group_concat(DISTINCT protein_accession) AS protein,
					group_concat(DISTINCT is_decoy) AS decoy FROM peptide_evidences GROUP BY peptide_ref) AS pep2_ev ON (si.pep2_id = pep2_ev.peptide_ref)
				WHERE json_each.key LIKE :scoreName AND sp.spectrum_ref=:spec_ref
				ORDER BY si.rank";

		$stmt = $dbh->prepare($sql);
		$stmt->bindParam(':spec_ref', $spectrum_ref);
		$stmt->bindParam(':scoreName', $scoreName);
	}

	else {
		$sql = "SELECT
				si.id AS identification_id,
				sp.spectrum_ref AS sprectrum_ref,
				pep1_table.seq_mods AS pep1,
				pep2_table.seq_mods AS pep2,
				pep1_table.link_site AS linkpos1,
				pep2_table.link_site AS linkpos2,
				si.charge_state AS charge,
				MAX(pep1_ev.decoy, COALESCE(pep2_ev.decoy, 0)) as is_decoy,
				pep1_ev.decoy AS decoy1,
				pep2_ev.decoy AS decoy2,
				atom AS score,
				si.scores AS scores,
				pep1_ev.protein AS protein1,
				pep2_ev.protein AS protein2,
				si.pass_threshold AS pass_threshold,
				si.rank AS rank
				FROM spectrum_identifications AS si, json_each(si.scores)
				LEFT JOIN spectra AS sp ON (si.spectrum_id = sp.id)
				LEFT JOIN peptides AS pep1_table ON (si.pep1_id = pep1_table.id)
				LEFT JOIN
					(SELECT peptide_ref, group_concat(DISTINCT protein_accession) AS protein,
					group_concat(DISTINCT is_decoy) AS decoy
					FROM peptide_evidences GROUP BY peptide_ref) AS pep1_ev ON (si.pep1_id = pep1_ev.peptide_ref)
				LEFT JOIN peptides AS pep2_table ON (si.pep2_id = pep2_table.id)
				LEFT JOIN
					(SELECT peptide_ref, group_concat(DISTINCT protein_accession) AS protein,
					group_concat(DISTINCT is_decoy) AS decoy FROM peptide_evidences GROUP BY peptide_ref) AS pep2_ev ON (si.pep2_id = pep2_ev.peptide_ref)
				WHERE sp.spectrum_ref=:spec_ref
				ORDER BY si.rank";
		// $sql = "SELECT identifications.id, sid, pep1, pep2, linkpos1, linkpos2, charge, isDecoy, atom AS score, allScores, protein1, protein2, passThreshold, rank
		// 	FROM identifications, json_each(identifications.allScores)
		// 	WHERE sid=:sid
		// 	ORDER BY identifications.id,rank";
		// echo($sql);
		$stmt = $dbh->prepare($sql);
		$stmt->bindParam(':spec_ref', $spectrum_ref);
	}

	// echo $sid;

	if ($stmt->execute()) {

		$result = $stmt->fetchAll();
		foreach ($result as $row) {
			$row['alt_count'] = count($result);
			array_push($JSON, $row);
		}
	}

	$arr = array('data' => $JSON);

	echo json_encode($arr);

?>
