package com.fec.port.fog;

import java.util.List;

// Builds the SQS payload via raw StringBuilder concatenation with manual escaping instead of any Jackson API -- the 6th distinct JSON-building idiom among this portfolio's Java fog siblings.
public class BatchPayloadJson {

    private static String escape(String raw) {
        return raw.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public static String build(WindowAggregate w, List<String> alerts) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"sensor_type\":\"").append(escape(w.sensorType())).append("\",");
        sb.append("\"site_id\":\"").append(escape(w.siteId())).append("\",");
        sb.append("\"unit\":\"").append(escape(w.unit())).append("\",");
        sb.append("\"window_start\":\"").append(w.windowStart()).append("\",");
        sb.append("\"window_end\":\"").append(w.windowEnd()).append("\",");
        sb.append("\"count\":").append(w.count()).append(",");
        sb.append("\"min\":").append(w.min()).append(",");
        sb.append("\"max\":").append(w.max()).append(",");
        sb.append("\"avg\":").append(w.avg()).append(",");
        sb.append("\"latest\":").append(w.latest()).append(",");
        sb.append("\"alerts\":[");
        for (int i = 0; i < alerts.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escape(alerts.get(i))).append("\"");
        }
        sb.append("]}");
        return sb.toString();
    }
}
