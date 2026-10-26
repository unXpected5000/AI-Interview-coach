import { decodeSpeechBlob } from "./localSpeechCapture.js";

let worker;
let nextRequestId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../workers/localSpeech.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === "model-progress") {
        pending.forEach(({ onProgress }) => onProgress?.(message.progress));
        return;
      }
      if (message.type === "status") {
        pending.forEach(({ onProgress }) => onProgress?.({ status: "status", message: message.message }));
        return;
      }
      const request = pending.get(message.requestId);
      if (!request) return;
      if (message.type === "ready") {
        pending.delete(message.requestId);
        request.resolve(true);
      } else if (message.type === "transcript") {
        pending.delete(message.requestId);
        request.resolve(message.text);
      } else if (message.type === "error") {
        pending.delete(message.requestId);
        request.reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The local speech worker failed.");
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}
function requestWorker(type, onProgress, audio) {
  const id = nextRequestId++;
  const activeWorker = getWorker();
  const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject, onProgress }));
  activeWorker.postMessage({ type, requestId: id, audio }, audio ? [audio] : []);
  return result;
}

export function warmLocalSpeechModel(onProgress) {
  return requestWorker("warmup", onProgress);
}

export async function transcribeAudioBlob(blob, { onProgress, decode = decodeSpeechBlob } = {}) {
  const samples = await decode(blob);
  if (!samples.length) throw new Error("The captured microphone audio was empty.");
  return requestWorker("transcribe", onProgress, samples.buffer);
}

export function terminateLocalSpeechWorker() {
  worker?.terminate();
  worker = null;
  pending.forEach(({ reject }) => reject(new Error("Local speech transcription was stopped.")));
  pending.clear();
}
