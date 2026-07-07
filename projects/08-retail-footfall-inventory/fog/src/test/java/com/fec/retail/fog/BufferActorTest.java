package com.fec.retail.fog;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BufferActorTest {

    private BufferActor actor;

    @BeforeEach
    void setUp() {
        actor = new BufferActor();
        actor.start();
    }

    @AfterEach
    void tearDown() {
        actor.stop();
    }

    @Test
    void enqueueBuffersReadingsUnderTheirKey() {
        actor.enqueue("queue_length", "store-1", "people", List.of(3.0, 5.0));

        BufferSnapshot snapshot = actor.drainAll();
        SensorKey key = new SensorKey("queue_length", "store-1");
        assertEquals(List.of(3.0, 5.0), snapshot.buffers().get(key));
        assertEquals("people", snapshot.units().get("queue_length"));
    }

    @Test
    void drainAllClearsBufferAfterDraining() {
        actor.enqueue("energy_draw_kw", "store-1", "kW", List.of(20.0));
        actor.drainAll();

        BufferSnapshot second = actor.drainAll();
        assertTrue(second.buffers().isEmpty());
    }

    @Test
    void drainAllKeepsSitesSeparate() {
        actor.enqueue("footfall_count", "store-1", "visitors", List.of(100.0));
        actor.enqueue("footfall_count", "store-2", "visitors", List.of(200.0, 220.0));

        BufferSnapshot snapshot = actor.drainAll();
        assertEquals(List.of(100.0), snapshot.buffers().get(new SensorKey("footfall_count", "store-1")));
        assertEquals(List.of(200.0, 220.0), snapshot.buffers().get(new SensorKey("footfall_count", "store-2")));
    }

    @Test
    void drainAllOnlyIncludesIngestsEnqueuedBeforeIt() {
        actor.enqueue("shelf_stock_pct", "store-1", "%", List.of(50.0));
        BufferSnapshot first = actor.drainAll();
        assertEquals(1, first.buffers().size());

        // A later ingest must not leak into a snapshot that was already taken.
        actor.enqueue("shelf_stock_pct", "store-1", "%", List.of(60.0));
        BufferSnapshot second = actor.drainAll();
        assertEquals(List.of(60.0), second.buffers().get(new SensorKey("shelf_stock_pct", "store-1")));
    }
}
