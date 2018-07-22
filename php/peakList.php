<?php
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

    $dashSeperated = explode("-" , $sid);
    $randId = implode('-' , array_slice($dashSeperated, 1 , 4));
    $id = $dashSeperated[0];

    $searchDataQuery = "SELECT s.id, s.random_id
		FROM uploads s
		WHERE s.id = '".$id."';";

    $res = pg_query($searchDataQuery)
                or die('Query failed: ' . pg_last_error());
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);

	if (pg_num_rows ($res) != 1  || $randId !== $line["random_id"]) {
	    // Free resultset
	    pg_free_result($res);
	    // Closing connection
	    pg_close($dbconn);
		exit();
	} else {
		$query = "SELECT peak_list
			FROM spectra
			WHERE id = $spid AND upload_id = $id;";
        $res = pg_query($dbconn, $query) or die('Query failed: ' . pg_last_error());
        $row = pg_fetch_row($res);
        echo $row[0];
	}

    // Free resultset
    pg_free_result($res);
    // Closing connection
    pg_close($dbconn);

}
?>
