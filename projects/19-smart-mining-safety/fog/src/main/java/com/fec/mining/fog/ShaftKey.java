package com.fec.mining.fog;

/** Groups buffered readings by (sensor_type, site_id) -- site_id is one of "shaft-a"/"shaft-b". */
record ShaftKey(String sensorType, String siteId) {}
