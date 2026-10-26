import test from "node:test";
import assert from "node:assert/strict";

import {
  collectSpeechRecognitionResults,
  createSpeechRecognition,
  getSpeechRecognitionMode,
  getSpeechRecognitionRetryDelay,
  isCurrentSpeechRecognitionEvent,
  isSpeechRecognitionSecureContext,
  resetSpeechRecognitionModeForTests,
  resolveInterviewAnswer,
  scheduleSpeechRecognitionRestart,
} from "../src/utils/speechRecognition.js";

function setBrowserSpeechApi(SpeechRecognition) {
  globalThis.window = { SpeechRecognition, isSecureContext: true, location: { hostname: "localhost" } };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "en-US" },
  });
}

test("speech recognition installs and prefers an available on-device language pack", async () => {
  resetSpeechRecognitionModeForTests();
  let installCalls = 0;
  class LocalRecognition { processLocally = false; }
  LocalRecognition.available = async () => "downloadable";
  LocalRecognition.install = async () => { installCalls += 1; return true; };
  setBrowserSpeechApi(LocalRecognition);

  const { recognition, processLocally } = await createSpeechRecognition();
  assert.equal(installCalls, 1);
  assert.equal(processLocally, true);
  assert.equal(recognition.processLocally, true);
  assert.equal(recognition.lang, "en-US");
});

test("speech recognition gracefully falls back when a local language pack is unavailable", async () => {
  resetSpeechRecognitionModeForTests();
  class BrowserRecognition {}
  BrowserRecognition.available = async () => "unavailable";
  BrowserRecognition.install = async () => false;
  setBrowserSpeechApi(BrowserRecognition);

  const mode = await getSpeechRecognitionMode();
  assert.equal(mode.SpeechRecognition, BrowserRecognition);
  assert.equal(mode.processLocally, false);
});

test("on-device recognition tries common English packs when the browser locale is unavailable", async () => {
  resetSpeechRecognitionModeForTests();
  const attemptedLanguages = [];
  class LocalRecognition { processLocally = false; }
  LocalRecognition.available = async ({ langs }) => {
    attemptedLanguages.push(langs[0]);
    return langs[0] === "en-US" ? "available" : "unavailable";
  };
  LocalRecognition.install = async () => false;
  setBrowserSpeechApi(LocalRecognition);
  globalThis.navigator.language = "en-IN";

  const { recognition, processLocally } = await createSpeechRecognition();

  assert.deepEqual(attemptedLanguages, ["en-IN", "en-US"]);
  assert.equal(processLocally, true);
  assert.equal(recognition.lang, "en-US");
});

test("speech recognition reports unsupported browsers without throwing", async () => {
  resetSpeechRecognitionModeForTests();
  setBrowserSpeechApi(undefined);
  const mode = await getSpeechRecognitionMode();
  assert.equal(mode.SpeechRecognition, null);
  assert.equal(mode.processLocally, false);
});

test("remote insecure origins are blocked while localhost remains allowed", async () => {
  resetSpeechRecognitionModeForTests();
  class BrowserRecognition {}
  globalThis.window = { SpeechRecognition: BrowserRecognition, isSecureContext: false, location: { hostname: "coach.example" } };
  const mode = await getSpeechRecognitionMode();
  assert.equal(mode.SpeechRecognition, null);
  assert.equal(mode.unavailableReason, "secure_context");
  assert.equal(isSpeechRecognitionSecureContext({ isSecureContext: false, location: { hostname: "127.0.0.1" } }), true);
});

test("recognition result handler ignores duplicate final callbacks", () => {
  const seenIndexes = new Set();
  const event = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "final answer" } }] };
  assert.deepEqual(collectSpeechRecognitionResults(event, seenIndexes), {
    finalPhrases: ["final answer"],
    interimTranscript: "",
  });
  assert.deepEqual(collectSpeechRecognitionResults(event, seenIndexes), {
    finalPhrases: [],
    interimTranscript: "",
  });
});

test("recognition callbacks from stale sessions or questions are ignored", () => {
  const recognition = {};
  assert.equal(isCurrentSpeechRecognitionEvent(recognition, recognition, 2, 2, "q2", "q2"), true);
  assert.equal(isCurrentSpeechRecognitionEvent({}, recognition, 2, 2, "q2", "q2"), false);
  assert.equal(isCurrentSpeechRecognitionEvent(recognition, recognition, 1, 2, "q2", "q2"), false);
  assert.equal(isCurrentSpeechRecognitionEvent(recognition, recognition, 2, 2, "q1", "q2"), false);
});

test("recognition retries use bounded backoff and then stop", () => {
  assert.deepEqual([0, 1, 2, 3].map(getSpeechRecognitionRetryDelay), [500, 1200, 2500, null]);
});

test("recognition restart scheduling runs once per bounded retry and then stops", () => {
  const scheduled = [];
  const restarts = [];
  const schedule = (callback, delay) => {
    scheduled.push({ callback, delay });
    return scheduled.length;
  };
  let attemptCount = 0;
  while (true) {
    const scheduledAttempt = attemptCount + 1;
    const retry = scheduleSpeechRecognitionRestart(
      attemptCount,
      () => restarts.push(scheduledAttempt),
      schedule,
    );
    if (retry === null) break;
    attemptCount = retry.attempt;
    scheduled.at(-1).callback();
  }
  assert.deepEqual(scheduled.map((timer) => timer.delay), [500, 1200, 2500]);
  assert.deepEqual(restarts, [1, 2, 3]);
  assert.equal(scheduleSpeechRecognitionRestart(attemptCount, () => {}, schedule), null);
});

test("typed answer remains usable when the speech service produced no final transcript", () => {
  assert.equal(resolveInterviewAnswer("My typed answer", "", true), "My typed answer");
  assert.equal(resolveInterviewAnswer("Unfinalized interim words", "", false), "");
  assert.equal(resolveInterviewAnswer("Final recognized words", "Final recognized words", false), "Final recognized words");
});
