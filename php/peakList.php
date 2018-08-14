<?php
if (count($_GET) > 0) {
    $sid = urldecode($_GET["sid"]);
    $spid = urldecode($_GET['spid']); // spectrum id
    //SQL injection defense
    $pattern = '/[^0-9,\-]/';
    if (preg_match($pattern, $sid) || preg_match($pattern, $spid)) {
        exit();
    }

    include('../../connectionString.php');
    $dbconn = pg_connect($connectionString) or die('Could not connect to database.');

    $dashSeperated = explode("-", $sid);
    $randId = implode('-', array_slice($dashSeperated, 1, 4));
    $id = $dashSeperated[0];

    $searchDataQuery = "SELECT s.id, s.random_id
		FROM search s
		WHERE s.id = '".$id."';";

    $res = pg_query($searchDataQuery)
                or die('Query failed: ' . pg_last_error());
    $line = pg_fetch_array($res, null, PGSQL_ASSOC);

    if (pg_num_rows($res) != 1  || $randId !== $line["random_id"]) {
        // Free resultset
        pg_free_result($res);
        // Closing connection
        pg_close($dbconn);
        exit();
    } else {
        $query = "SELECT intensity, mz
			FROM spectrum_peak
			WHERE spectrum_id = $spid";// AND upload_id = $uid;";

        $res = pg_query($dbconn, $query) or die('Query failed: ' . pg_last_error());
        echo json_encode(pg_fetch_all($res));
    }

    // Free resultset
    pg_free_result($res);
    // Closing connection
    pg_close($dbconn);
}
