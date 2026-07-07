package com.fec.retail.fog;

/** Identity of a buffered stream: one (sensor_type, site_id) pair. */
public record SensorKey(String sensorType, String siteId) {}
