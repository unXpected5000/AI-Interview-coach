import test from "node:test";
import assert from "node:assert/strict";

import { createSpeechRecognition, getSpeechRecognitionMode, resetSpeechRecognitionModeForTests } from "../src/utils/speechRecognition.js";

function setBrowserSpeechApi(SpeechRecognition) {
  globalThis.window = { SpeechRecognition };
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

test("speech recognition reports unsupported browsers without throwing", async () => {
  resetSpeechRecognitionModeForTests();
  setBrowserSpeechApi(undefined);
  const mode = await getSpeechRecognitionMode();
  assert.equal(mode.SpeechRecognition, null);
  assert.equal(mode.processLocally, false);
});
