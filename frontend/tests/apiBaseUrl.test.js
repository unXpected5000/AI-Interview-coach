import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiBaseUrl } from "../src/utils/env.js";

test("a Render origin works with or without /api and trailing slashes", () => {
  for (const value of ["https://coach-api.onrender.com", "https://coach-api.onrender.com/", "https://coach-api.onrender.com/api", " https://coach-api.onrender.com/api/ "]) {
    assert.equal(resolveApiBaseUrl(value), "https://coach-api.onrender.com/api", value);
  }
});

test("without a configured URL, production uses the same-origin proxy and dev uses the local API", () => {
  assert.equal(resolveApiBaseUrl(""), "/api");
  assert.equal(resolveApiBaseUrl(undefined), "/api");
  assert.equal(resolveApiBaseUrl("", { dev: true }), "http://localhost:8000/api");
  assert.equal(resolveApiBaseUrl("/api/"), "/api");
});
