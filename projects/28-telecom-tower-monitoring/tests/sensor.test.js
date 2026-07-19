import test from "node:test";
import assert from "node:assert/strict";
import { generatorFor, dispatch, PROFILES } from "../sensors/sensor.js";

test("every profile carries a unit and bounds", () => {
  for (const [type, p] of Object.entries(PROFILES)) {
    assert.ok(typeof p.unit === "string" && p.unit.length > 0, `${type} unit`);
    assert.ok(p.high > p.low);
  }
});

test("generators stay within plausible physical range over many ticks", () => {
  for (const type of Object.keys(PROFILES)) {
    const next = generatorFor(type);
    for (let i = 0; i < 3000; i++) {
      const v = next();
      assert.ok(Number.isFinite(v), `${type} produced non-finite`);
      assert.ok(v > -50 && v < 250, `${type} produced wild value ${v}`);
    }
  }
});

test("rf_utilization shows twin busy-hour peaks above its baseline", () => {
  const next = generatorFor("rf_utilization_pct");
  let max = -Infinity;
  for (let i = 0; i < 2000; i++) max = Math.max(max, next());
  assert.ok(max > 60, `expected a busy-hour peak, saw max ${max}`);
});

test("unknown sensor type throws", () => {
  assert.throws(() => generatorFor("nope"));
});

test("dispatch clears the buffer on a successful post", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 202 });
  try {
    const out = await dispatch([{ ts: "t", value: 1 }], { unit: "A" });
    assert.deepEqual(out, []);
  } finally {
    globalThis.fetch = original;
  }
});

test("dispatch retains the buffer when the fog rejects", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    const buf = [{ ts: "t", value: 1 }, { ts: "t2", value: 2 }];
    const out = await dispatch(buf, { unit: "A" });
    assert.equal(out.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("dispatch retains the buffer when the network throws", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
  try {
    const buf = [{ ts: "t", value: 1 }];
    const out = await dispatch(buf, { unit: "A" });
    assert.equal(out.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("dispatch on an empty buffer is a no-op", async () => {
  const out = await dispatch([], { unit: "A" });
  assert.deepEqual(out, []);
});
