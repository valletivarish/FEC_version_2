package com.fec.warehouse.fog;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Thin fluent wrapper over Jackson's ObjectNode so call sites read as a
 * sequence of field assignments rather than repeated node.put(...) statements.
 */
public class JsonBuilder {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ObjectNode node = MAPPER.createObjectNode();

    public static JsonBuilder start() {
        return new JsonBuilder();
    }

    public JsonBuilder field(String name, String value) {
        node.put(name, value);
        return this;
    }

    public JsonBuilder field(String name, int value) {
        node.put(name, value);
        return this;
    }

    public JsonBuilder field(String name, double value) {
        node.put(name, value);
        return this;
    }

    public JsonBuilder stringArray(String name, Iterable<String> values) {
        ArrayNode arr = node.putArray(name);
        values.forEach(arr::add);
        return this;
    }

    public static ObjectNode object() {
        return MAPPER.createObjectNode();
    }

    @Override
    public String toString() {
        return node.toString();
    }
}
