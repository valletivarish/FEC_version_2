package com.fec.transit.fog;

/** Buffer group key: one bucket per (sensor_type, site_id) pair, e.g. (engine_temp_c, depot-a). */
record GroupKey(String sensorType, String siteId) {}
