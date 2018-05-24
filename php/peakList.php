<?php

	$uid = $_GET['uid'];  // upload 
    $spid = $_GET['spid']; // spectrum id

	$query = "SELECT peak_list
		FROM spectra
		WHERE id = $spid AND upload_id = $uid;";

    include('../../connectionString.php');
    $dbconn = pg_connect($connectionString) or die('Could not connect: ' . pg_last_error());
    $result = pg_query($dbconn, $query) or die('Query failed: ' . pg_last_error());
    $row = pg_fetch_row($result);
    echo $row[0];

?>
