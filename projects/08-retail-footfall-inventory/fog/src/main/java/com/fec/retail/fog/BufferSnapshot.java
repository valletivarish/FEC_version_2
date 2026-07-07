package com.fec.retail.fog;

import java.util.List;
import java.util.Map;

/** Immutable copy of the actor's buffers+units, handed back across a Drain. */
record BufferSnapshot(Map<SensorKey, List<Double>> buffers, Map<String, String> units) {}
