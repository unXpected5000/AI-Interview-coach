import test from "node:test";
import assert from "node:assert/strict";

import { terminateLocalSpeechWorker, transcribeAudioBlob, warmLocalSpeechModel } from "../src/utils/localSpeechTranscription.js";

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
  } finally {
    terminateLocalSpeechWorker();
    delete globalThis.Worker;
  }
});
