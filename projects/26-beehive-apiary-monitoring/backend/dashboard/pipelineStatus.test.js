"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { countTableItems } = require("./pipelineStatus");

function fakeScanDoc(pages) {
  let call = 0;
  return {
    send: async () => {
      const page = pages[call];
      call += 1;
      return page;
    },
  };
}

test("countTableItems returns a single page's Count when the table fits in one Scan", async () => {
  const doc = fakeScanDoc([{ Count: 6 }]);
  const total = await countTableItems(doc, "bam-readings");
  assert.equal(total, 6);
});

test("countTableItems follows LastEvaluatedKey and sums every page's Count", async () => {
  const doc = fakeScanDoc([
    { Count: 400, LastEvaluatedKey: { site_id: "apiary-a" } },
    { Count: 400, LastEvaluatedKey: { site_id: "apiary-b" } },
    { Count: 137 },
  ]);
  const total = await countTableItems(doc, "bam-readings");
  assert.equal(total, 937, "undercounts to just the first page's Count without pagination");
});

test("countTableItems passes each page's LastEvaluatedKey back in as ExclusiveStartKey on the next Scan", async () => {
  const seenStartKeys = [];
  let call = 0;
  const pages = [
    { Count: 10, LastEvaluatedKey: { site_id: "apiary-a" } },
    { Count: 5 },
  ];
  const doc = {
    send: async (command) => {
      seenStartKeys.push(command.input.ExclusiveStartKey);
      const page = pages[call];
      call += 1;
      return page;
    },
  };
  await countTableItems(doc, "bam-readings");
  assert.deepEqual(seenStartKeys, [undefined, { site_id: "apiary-a" }]);
});

test("countTableItems returns 0 for an empty table", async () => {
  const doc = fakeScanDoc([{ Count: 0 }]);
  const total = await countTableItems(doc, "bam-readings");
  assert.equal(total, 0);
});
