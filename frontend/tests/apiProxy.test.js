import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/api/[[path]].js";

test("API proxy preserves path, query, method, authorization, and request body", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (request) => {
    forwarded = request;
    return Response.json({ ok: true });
  };

  try {
    const request = new Request("https://coach.pages.dev/api/auth/login?source=test", {
      method: "POST",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "candidate@example.com", password: "not-a-real-secret" }),
    });
    const response = await onRequest({ request, env: { BACKEND_API_ORIGIN: "https://coach-api.onrender.com" } });

    assert.equal(response.status, 200);
    assert.equal(forwarded.url, "https://coach-api.onrender.com/api/auth/login?source=test");
    assert.equal(forwarded.method, "POST");
    assert.equal(forwarded.headers.get("authorization"), "Bearer test-token");
    assert.deepEqual(await forwarded.json(), { email: "candidate@example.com", password: "not-a-real-secret" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API proxy returns actionable setup error when backend origin is unset", async () => {
  const response = await onRequest({
    request: new Request("https://coach.pages.dev/api/health"),
    env: {},
  });

  assert.equal(response.status, 503);
  assert.match((await response.json()).detail, /BACKEND_API_ORIGIN/);
});

test("API proxy rejects non-HTTPS or path-bearing backend origins", async () => {
  const response = await onRequest({
    request: new Request("https://coach.pages.dev/api/health"),
    env: { BACKEND_API_ORIGIN: "http://localhost:8000/api" },
  });

  assert.equal(response.status, 500);
  assert.match((await response.json()).detail, /HTTPS origin/);
});
