import test from "node:test";
import assert from "node:assert/strict";
import { microphoneDiagnosticMessage, speechRecognitionErrorMessage, testMicrophoneInput, testSpeechRecognition } from "../src/utils/microphoneDiagnostic.js";

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
  assert.match(speechRecognitionErrorMessage("service-not-allowed"), /browser's speech service is unavailable or blocked/);
  assert.match(speechRecognitionErrorMessage("no-speech"), /No speech was detected/);
});

test("speech recognition diagnostic returns a final transcript and stops the browser recognizer", async () => {
  let stopped = false;
  const recognition = {
    start() {
      Promise.resolve().then(() => this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "hello world" } }] }));
    },
    stop() { stopped = true; },
  };
  const result = await testSpeechRecognition({ createRecognition: async () => ({ recognition, processLocally: true }) });
  assert.deepEqual(result, { transcript: "hello world", processLocally: true });
  assert.equal(stopped, true);
});

test("speech recognition diagnostic exposes network failures", async () => {
  const recognition = {
    start() { Promise.resolve().then(() => this.onerror({ error: "network" })); },
    stop() {},
  };
  await assert.rejects(
    testSpeechRecognition({ createRecognition: async () => ({ recognition, processLocally: false }) }),
    /network connection/,
  );
});

test("speech recognition diagnostic falls back to a local transcript after a browser network error", async () => {
  let audioStopped = false;
  class NetworkFailingRecognition {
    start() { this.onerror?.({ error: "network" }); }
    stop() {}
  }
  const result = await testSpeechRecognition({
    useLocalFallback: true,
    createRecognition: async () => ({ recognition: new NetworkFailingRecognition(), processLocally: false }),
    captureAudio: async () => ({ stop: async () => { audioStopped = true; return new Blob(["audio"]); }, cancel() {} }),
    transcribeAudio: async () => "recognized on device",
  });

  assert.equal(audioStopped, true);
  assert.equal(result.transcript, "recognized on device");
  assert.equal(result.engine, "Whisper on this device");
});
