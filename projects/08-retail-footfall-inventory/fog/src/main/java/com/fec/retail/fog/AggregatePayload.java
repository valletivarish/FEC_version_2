package com.fec.retail.fog;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

import java.util.List;

/**
 * Public DTO serialized directly by Jackson (objectMapper.writeValueAsString)
 * -- no manual ObjectNode tree-building anywhere in this module. Field order
 * is pinned with @JsonPropertyOrder purely so the wire payload reads the same
 * way on every run, which keeps loadtest/verify script assertions and manual
 * curl inspection predictable.
 */
@JsonPropertyOrder({"sensor_type", "site_id", "unit", "window_start", "window_end",
    "count", "min", "max", "avg", "latest", "alerts"})
public final class AggregatePayload {

    public final String sensor_type;
    public final String site_id;
    public final String unit;
    public final String window_start;
    public final String window_end;
    public final int count;
    public final double min;
    public final double max;
    public final double avg;
    public final double latest;
    public final List<String> alerts;

    public AggregatePayload(WindowAggregate window, List<String> alerts) {
        this.sensor_type = window.sensorType();
        this.site_id = window.siteId();
        this.unit = window.unit();
        this.window_start = window.windowStart();
        this.window_end = window.windowEnd();
        this.count = window.count();
        this.min = window.min();
        this.max = window.max();
        this.avg = window.avg();
        this.latest = window.latest();
        this.alerts = alerts;
    }
}
