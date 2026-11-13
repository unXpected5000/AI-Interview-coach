import test from "node:test";
import assert from "node:assert/strict";

import { bridgeBeforeQuestion, formatClock, shouldAutoFinish, speechWatchdogMs, turnLabel } from "../src/utils/liveCall.js";

test("hands-free finish needs speech, enough words, and a sustained pause", () => {
  const base = { enabled: true, listening: true, busy: false, lastSpeechAt: 1000, now: 6000, wordCount: 12 };
  assert.equal(shouldAutoFinish(base), true);
  assert.equal(shouldAutoFinish({ ...base, enabled: false }), false);
  assert.equal(shouldAutoFinish({ ...base, now: 3000 }), false);
  assert.equal(shouldAutoFinish({ ...base, wordCount: 3 }), false);
  assert.equal(shouldAutoFinish({ ...base, lastSpeechAt: 0 }), false);
  assert.equal(shouldAutoFinish({ ...base, busy: true }), false);
});

test("spoken bridges vary and acknowledge skips and follow-ups", () => {
  assert.match(bridgeBeforeQuestion({ first: true }), /thanks for joining/i);
  assert.match(bridgeBeforeQuestion({ previousStatus: "skipped" }), /move on/);
  assert.match(bridgeBeforeQuestion({ isFollowUp: true, turn: 2 }), /follow up/);
  assert.notEqual(bridgeBeforeQuestion({ turn: 1 }), bridgeBeforeQuestion({ turn: 2 }));
});

test("speech watchdog scales with text length and always allows a margin", () => {
  assert.ok(speechWatchdogMs("") >= 4000);
  assert.ok(speechWatchdogMs("word ".repeat(100)) > speechWatchdogMs("word ".repeat(10)));
});

test("turn label states whose turn it is", () => {
  assert.equal(turnLabel({ callActive: false }).text, "Ready to join");
  assert.equal(turnLabel({ callActive: true, isSpeaking: true }).tone, "interviewer");
  assert.equal(turnLabel({ callActive: true, isListening: true, interactionMode: "voice" }).tone, "you");
  assert.equal(turnLabel({ callActive: true, isSaving: true }).tone, "thinking");
  assert.equal(formatClock(125), "2:05");
});
