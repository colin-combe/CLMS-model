<?php

include_once('../../vendor/php/utils.php');

if (count($_GET) > 0) {

    $sid = urldecode($_GET["upload"]);
    $spid = urldecode($_GET['spid']); // spectrum id
    //SQL injection defense
    $pattern = '/[^0-9,\-]/';
    if (preg_match($pattern, $sid) || preg_match($pattern, $spid)){
        exit();
    }

    include('../../connectionString.php');
    $dbconn = pg_connect($connectionString) or die('Could not connect: ' . pg_last_error());

    $id = validateID_RandID($dbConn, $sid);

	if ($id > 0) {
		$query = "SELECT peak_list
			FROM spectra
			WHERE id = $spid AND upload_id = $id;";
        $res = pg_query($dbconn, $query) or die('Query failed: ' . pg_last_error());
        $row = pg_fetch_row($res);
        echo $row[0];
	    // Free resultset
	    pg_free_result($res);
	}

    // Closing connection
	pg_close($dbconn);
	exit();
}
?>
