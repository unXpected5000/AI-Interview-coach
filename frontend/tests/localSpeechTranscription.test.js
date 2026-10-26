import test from "node:test";
import assert from "node:assert/strict";

import { mergeSpeechTranscriptSegments, terminateLocalSpeechWorker, transcribeAudioBlob, transcribeAudioWindow, warmLocalSpeechModel } from "../src/utils/localSpeechTranscription.js";

test("local speech model warms and transcribes captured audio in a worker", async () => {
  const sent = [];
  const progress = [];
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; }
    postMessage(message, transfer = []) {
      sent.push({ message, transfer });
      setTimeout(() => this.onmessage({ data: { type: message.type === "warmup" ? "ready" : "transcript", requestId: message.requestId, text: "local answer" } }), 0);
    }
    terminate() {}
  }
  globalThis.Worker = FakeWorker;
  try {
    assert.equal(await warmLocalSpeechModel((value) => progress.push(value)), true);
    const samples = Float32Array.from([0.1, -0.1, 0.2]);
    const text = await transcribeAudioBlob(new Blob(["audio"]), { decode: async () => samples });

    assert.equal(text, "local answer");
    assert.equal(sent[0].message.type, "warmup");
    assert.equal(sent[1].message.type, "transcribe");
    assert.equal(sent[1].transfer.length, 1);
    assert.equal(sent[1].transfer[0].byteLength, samples.byteLength);

    const windowResult = await transcribeAudioWindow(new Blob(["audio"]), {
      startSample: 1,
      decode: async () => samples,
    });
    assert.equal(windowResult.text, "local answer");
    assert.equal(windowResult.sampleCount, samples.length);
    assert.equal(sent[2].transfer[0].byteLength, (samples.length - 1) * Float32Array.BYTES_PER_ELEMENT);
  } finally {
    terminateLocalSpeechWorker();
    delete globalThis.Worker;
  }
});

test("live Whisper transcript windows merge overlapped words without duplicating them", () => {
  assert.equal(mergeSpeechTranscriptSegments("I enjoy building useful tools", "useful tools that help people"), "I enjoy building useful tools that help people");
  assert.equal(mergeSpeechTranscriptSegments("hello there", "hello there"), "hello there");
  assert.equal(mergeSpeechTranscriptSegments("first part", "second part"), "first part second part");
});

test("a stalled local worker times out and is terminated instead of blocking answer submission", async () => {
  let terminated = false;
  globalThis.Worker = class StalledWorker {
    postMessage() {}
    terminate() { terminated = true; }
  };
  try {
    await assert.rejects(
      transcribeAudioBlob(new Blob(["audio"]), { decode: async () => Float32Array.from([0.1]), timeoutMs: 10 }),
      /timed out/i,
    );
    assert.equal(terminated, true);
  } finally {
    terminateLocalSpeechWorker();
    delete globalThis.Worker;
  }
});
