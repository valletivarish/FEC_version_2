package com.fec.port.fog;

/** Identifies one (sensor_type, site_id) group inside the ledger and the flush cycle. */
public record GroupKey(String sensorType, String siteId) {}
