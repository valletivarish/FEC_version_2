package com.fec.port.fog;

import java.util.List;

/**
 * Builds the SQS message body for one window's aggregate via plain string
 * concatenation (StringBuilder + manual quoting), not Jackson. Every other
 * Java fog sibling in this portfolio reaches for a Jackson API to build this
 * exact payload: 02 and 16 hand-build a blank ObjectNode field-by-field with
 * .put() calls; 04 and 08 serialize a POJO straight to a string via
 * ObjectMapper.writeValueAsString(); 07 goes through a bespoke fluent
 * JsonBuilder wrapper around ObjectNode; 09 writes it token-by-token through
 * Jackson's low-level JsonGenerator streaming API; 19 goes POJO-to-tree via
 * ObjectMapper.valueToTree() and then mutates that tree. This class touches
 * no Jackson class at all for the outgoing message -- the only place in this
 * project that hand-builds JSON this way for an SQS payload specifically
 * (the sensors already do the same for their /ingest POST body, following
 * 02's precedent for THAT payload, but no fog sibling does it for the
 * fog-to-SQS message).
 */
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
