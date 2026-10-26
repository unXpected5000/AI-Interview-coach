import test from "node:test";
import assert from "node:assert/strict";
import { microphoneDiagnosticMessage, speechRecognitionErrorMessage, testMicrophoneInput } from "../src/utils/microphoneDiagnostic.js";

function createAudioHarness(byteLevel = 160) {
  const stopped = { value: false };
  const disconnected = { value: false };
  const closed = { value: false };
  class AudioContextMock {
    state = "running";
    createAnalyser() {
      return { fftSize: 8, getByteTimeDomainData: (samples) => samples.fill(byteLevel) };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() { disconnected.value = true; } };
    }
    async close() { closed.value = true; this.state = "closed"; }
  }
  return {
    AudioContextMock,
    stopped,
    disconnected,
    closed,
    mediaDevices: { async getUserMedia() { return { getAudioTracks: () => [{ readyState: "live", muted: false }], getTracks: () => [{ stop() { stopped.value = true; } }] }; } },
  };
}

test("microphone diagnostic detects input and always releases its temporary stream", async () => {
  const harness = createAudioHarness(160);
  const levels = [];
  let time = 0;
  const result = await testMicrophoneInput({
    ...harness,
    mediaDevices: harness.mediaDevices,
    AudioContextConstructor: harness.AudioContextMock,
    sampleDurationMs: 100,
    sampleIntervalMs: 50,
    now: () => time,
    sleep: async (ms) => { time += ms; },
    onLevel: (level) => levels.push(level),
  });
  assert.equal(result.signalDetected, true);
  assert.ok(result.peakLevel > 0);
  assert.ok(levels.some((level) => level > 0));
  assert.equal(levels.at(-1), 0);
  assert.equal(harness.stopped.value, true);
  assert.equal(harness.disconnected.value, true);
  assert.equal(harness.closed.value, true);
});

test("microphone diagnostic reports denied permission without leaking the stream", async () => {
  const error = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  await assert.rejects(testMicrophoneInput({ mediaDevices: { getUserMedia: async () => { throw error; } }, AudioContextConstructor: class {} }), error);
  assert.match(microphoneDiagnosticMessage(error), /Allow microphone access/);
});

test("microphone diagnostic distinguishes silence from device failure", async () => {
  const harness = createAudioHarness(128);
  let time = 0;
  const result = await testMicrophoneInput({
    ...harness,
    mediaDevices: harness.mediaDevices,
    AudioContextConstructor: harness.AudioContextMock,
    sampleDurationMs: 100,
    sampleIntervalMs: 50,
    now: () => time,
    sleep: async (ms) => { time += ms; },
  });
  assert.equal(result.signalDetected, false);
  assert.equal(result.peakLevel, 0);
  assert.match(microphoneDiagnosticMessage({ name: "NotFoundError" }), /No microphone was found/);
});

test("speech recognition failures have distinct actionable messages", () => {
  assert.match(speechRecognitionErrorMessage("audio-capture"), /microphone/);
  assert.match(speechRecognitionErrorMessage("network"), /network connection/);
  assert.match(speechRecognitionErrorMessage("not-allowed"), /Allow microphone access/);
});
