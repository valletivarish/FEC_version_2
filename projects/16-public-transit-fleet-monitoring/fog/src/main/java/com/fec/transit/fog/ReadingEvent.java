package com.fec.transit.fog;

/** One raw reading as it lands on the intake queue, still tagged with its own sensor_type/site_id/unit. */
record ReadingEvent(String sensorType, String siteId, String unit, double value) {}
