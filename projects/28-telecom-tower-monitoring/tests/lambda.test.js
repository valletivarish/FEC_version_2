import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../backend/dashboard/lambda.js";

test("the dashboard exposes an API Gateway proxy handler", () => {
  assert.equal(typeof handler, "function");
});
