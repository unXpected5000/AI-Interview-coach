import test from "node:test";
import assert from "node:assert/strict";

import { decodeSpeechBlob, startLocalSpeechCapture } from "../src/utils/localSpeechCapture.js";

test("local speech capture records in memory and releases its microphone track on stop", async () => {
  const track = { readyState: "live", muted: false, stopped: false, stop() { this.stopped = true; } };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  let recorder;
  class FakeRecorder {
    static isTypeSupported(type) { return type === "audio/webm;codecs=opus"; }
    constructor(receivedStream, options) { recorder = this; this.stream = receivedStream; this.mimeType = options.mimeType; this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio-bytes"], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  const capture = await startLocalSpeechCapture({
    mediaDevices: { getUserMedia: async () => stream },
    MediaRecorderConstructor: FakeRecorder,
  });
  recorder.ondataavailable({ data: new Blob(["first-chunk"], { type: recorder.mimeType }) });
  assert.equal(await capture.snapshot().text(), "first-chunk");
  const blob = await capture.stop();

  assert.equal(recorder.stream, stream);
  assert.match(blob.type, /audio\/webm/);
  assert.equal(await blob.text(), "first-chunkaudio-bytes");
  assert.equal(track.stopped, true);
});
test("local speech audio decoder mixes channels and resamples to 16 kHz", async () => {
  let closed = false;
  class FakeAudioContext {
    state = "running";
    async decodeAudioData() {
      return {
        length: 4,
        numberOfChannels: 2,
        sampleRate: 8000,
        getChannelData(channel) { return channel === 0 ? Float32Array.from([0, 1, 0, -1]) : Float32Array.from([1, 0, -1, 0]); },
      };
    }
    async close() { closed = true; this.state = "closed"; }
  }
  const output = await decodeSpeechBlob(new Blob(["test"]), { AudioContextConstructor: FakeAudioContext });

  assert.equal(output.length, 8);
  assert.deepEqual([...output], [0.5, 0.5, 0.5, 0, -0.5, -0.5, -0.5, -0.5]);
  assert.equal(closed, true);
});
