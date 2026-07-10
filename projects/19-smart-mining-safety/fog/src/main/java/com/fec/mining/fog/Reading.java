package com.fec.mining.fog;

/** One timestamped sample as received from a sensor's /ingest batch. */
record Reading(String ts, double value) {}
