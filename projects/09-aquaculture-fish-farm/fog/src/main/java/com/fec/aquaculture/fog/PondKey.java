package com.fec.aquaculture.fog;

/** Buffer key: one bucket per (sensor_type, site_id) pair, e.g. (dissolved_oxygen_mgl, pond-1). */
record PondKey(String sensorType, String siteId) {}
