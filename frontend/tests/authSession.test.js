import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_EXPIRED_EVENT,
  SESSION_EXPIRED_MESSAGE,
  clearSessionMessage,
  consumeSessionMessage,
  handleUnauthorizedResponse,
  peekSessionMessage,
  isExpiredSessionError,
} from "../src/auth/session.js";
import { formatErrorDetail, getErrorCode, getErrorMessage } from "../src/utils/errorMessage.js";
import { navItemsForRole, profileRedirect } from "../src/auth/roleAccess.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const expired = (url = "/interviews/abc/answer") => ({
  response: { status: 401, data: { detail: "Your session has expired" } },
  config: { url, headers: { Authorization: "Bearer old-token" } },
});

test("401 on an authenticated request clears the session and leaves a sign-in message", () => {
  const storage = memoryStorage();
  const events = [];
  let cleared = false;
  const handled = handleUnauthorizedResponse(expired(), {
    clearToken: () => { cleared = true; },
    storage,
    dispatch: (name) => events.push(name),
  });
  assert.equal(handled, true);
  assert.equal(cleared, true);
  assert.deepEqual(events, [SESSION_EXPIRED_EVENT]);
  assert.equal(consumeSessionMessage(storage), SESSION_EXPIRED_MESSAGE);
  assert.equal(consumeSessionMessage(storage), "", "the message is shown once");
});

test("peeking the session message is safe to repeat until it is cleared", () => {
  const storage = memoryStorage();
  handleUnauthorizedResponse(expired(), { storage });
  // React StrictMode may run a state initializer twice; both reads must see it.
  assert.equal(peekSessionMessage(storage), SESSION_EXPIRED_MESSAGE);
  assert.equal(peekSessionMessage(storage), SESSION_EXPIRED_MESSAGE);
  clearSessionMessage(storage);
  assert.equal(peekSessionMessage(storage), "");
});

test("wrong-password 401s and anonymous requests do not sign the user out", () => {
  assert.equal(isExpiredSessionError(expired("/auth/login")), false);
  assert.equal(isExpiredSessionError(expired("/auth/verify-email")), false);
  assert.equal(isExpiredSessionError({ response: { status: 401 }, config: { url: "/interviews", headers: {} } }), false);
  assert.equal(isExpiredSessionError({ response: { status: 403 }, config: expired().config }), false);
  let cleared = false;
  assert.equal(handleUnauthorizedResponse(expired("/auth/login"), { clearToken: () => { cleared = true; } }), false);
  assert.equal(cleared, false);
});

test("error messages render strings, objects, and FastAPI validation arrays safely", () => {
  assert.equal(getErrorMessage({ response: { status: 409, data: { detail: "Already complete." } } }), "Already complete.");
  assert.equal(
    getErrorMessage({ response: { status: 422, data: { detail: [
      { loc: ["body", "year"], msg: "Input should be less than or equal to 10" },
      { loc: ["body", "department"], msg: "Field required" },
    ] } } }),
    "year: Input should be less than or equal to 10 department: Field required",
  );
  const verification = { response: { status: 403, data: { detail: { code: "email_verification_required", message: "Verify your email." } } } };
  assert.equal(getErrorMessage(verification), "Verify your email.");
  assert.equal(getErrorCode(verification), "email_verification_required");
  assert.equal(getErrorMessage({ response: { status: 429, data: {} } }), "Too many requests. Wait a moment and try again.");
  assert.equal(getErrorMessage({ request: {} }, "x"), "Could not reach the server. Check your connection and try again.");
  assert.equal(getErrorMessage({ response: { status: 500, data: "<html>" } }, "Save failed."), "Save failed. The server is unavailable right now.");
  assert.equal(typeof formatErrorDetail({ nested: { weird: true } }), "string");
});

test("incomplete profiles are routed to completion, and staff links follow roles", () => {
  assert.equal(profileRedirect({ profile_complete: false }, "/dashboard"), "/complete-profile");
  assert.equal(profileRedirect({ profile_complete: false }, "/complete-profile"), null);
  assert.equal(profileRedirect({ profile_complete: true }, "/dashboard"), null);
  const paths = (role) => navItemsForRole(role).map((item) => item.path);
  assert.equal(paths("student").includes("/department"), false);
  assert.equal(paths("student").includes("/admin/users"), false);
  assert.equal(paths("department_faculty").includes("/department"), true);
  assert.equal(paths("operator").includes("/admin/users"), true);
});
