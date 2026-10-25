import test from "node:test";
import assert from "node:assert/strict";

import { getInterviewerState } from "../src/utils/interviewState.js";

test("interviewer state follows call, connection, interruption, and audio lifecycle", () => {
  assert.equal(getInterviewerState({ callActive: false, isSpeaking: true }), "idle");
  assert.equal(getInterviewerState({ callActive: true, isListening: true }), "listening");
  assert.equal(getInterviewerState({ callActive: true, isSpeaking: true }), "speaking");
  assert.equal(getInterviewerState({ callActive: true, wasInterrupted: true, isListening: true }), "interrupted");
  assert.equal(getInterviewerState({ callActive: true, error: "Speech service network issue" }), "disconnected");
  assert.equal(getInterviewerState({ callActive: true }), "thinking");
});
