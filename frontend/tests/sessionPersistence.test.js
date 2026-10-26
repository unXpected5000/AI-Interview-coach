import test from "node:test";
import assert from "node:assert/strict";
import { shouldClearStoredSession } from "../src/auth/session.js";

test("stored login survives temporary API and network failures", () => {
  assert.equal(shouldClearStoredSession({ response: { status: 503 } }), false);
  assert.equal(shouldClearStoredSession({ message: "Network Error" }), false);
});

test("stored login is cleared when the server rejects an expired or invalid token", () => {
  assert.equal(shouldClearStoredSession({ response: { status: 401 } }), true);
});
