package com.fec.retail.fog;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** Descriptive metadata for one alert rule, as surfaced by GET /thresholds. */
@JsonPropertyOrder({"field", "op", "limit", "key"})
public final class ThresholdDescription {
    public final String field;
    public final String op;
    public final double limit;
    public final String key;

    public ThresholdDescription(String field, String op, double limit, String key) {
        this.field = field;
        this.op = op;
        this.limit = limit;
        this.key = key;
    }
}
