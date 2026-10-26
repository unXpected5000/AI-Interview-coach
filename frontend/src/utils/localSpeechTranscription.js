import { decodeSpeechBlob } from "./localSpeechCapture.js";

let worker;
let nextRequestId = 1;
const pending = new Map();
const LOCAL_TRANSCRIPTION_TIMEOUT_MS = 90_000;

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
      globalThis.clearTimeout(request.timer);
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
      pending.forEach(({ reject, timer }) => {
        globalThis.clearTimeout(timer);
        reject(error);
      });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}
function requestWorker(type, onProgress, audio, timeoutMs = LOCAL_TRANSCRIPTION_TIMEOUT_MS) {
  const id = nextRequestId++;
  const activeWorker = getWorker();
  const result = new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      pending.delete(id);
      const error = new Error("Local speech recognition timed out. Check the model download or try typing your answer.");
      reject(error);
      activeWorker.terminate();
      if (worker === activeWorker) worker = null;
      pending.forEach(({ reject: rejectOther, timer: otherTimer }) => {
        globalThis.clearTimeout(otherTimer);
        rejectOther(error);
      });
      pending.clear();
    }, timeoutMs);
    pending.set(id, { resolve, reject, onProgress, timer });
  });
  activeWorker.postMessage({ type, requestId: id, audio }, audio ? [audio] : []);
  return result;
}

export function warmLocalSpeechModel(onProgress, { timeoutMs = LOCAL_TRANSCRIPTION_TIMEOUT_MS } = {}) {
  return requestWorker("warmup", onProgress, undefined, timeoutMs);
}

export async function transcribeAudioBlob(blob, { onProgress, decode = decodeSpeechBlob, timeoutMs } = {}) {
  const samples = await decode(blob);
  if (!samples.length) throw new Error("The captured microphone audio was empty.");
  return requestWorker("transcribe", onProgress, samples.buffer, timeoutMs);
}

export async function transcribeAudioWindow(blob, {
  startSample = 0,
  decode = decodeSpeechBlob,
  onProgress,
  timeoutMs,
} = {}) {
  const samples = await decode(blob);
  if (!samples.length) throw new Error("The captured microphone audio was empty.");
  const offset = Math.max(0, Math.min(Math.floor(startSample), samples.length));
  const windowSamples = samples.slice(offset);
  if (!windowSamples.length) return { text: "", sampleCount: samples.length };
  const text = await requestWorker("transcribe", onProgress, windowSamples.buffer, timeoutMs);
  return { text, sampleCount: samples.length };
}

export function mergeSpeechTranscriptSegments(previousText, nextText, maxOverlapWords = 12) {
  const previous = String(previousText ?? "").trim();
  const next = String(nextText ?? "").trim();
  if (!previous) return next;
  if (!next) return previous;
  const previousWords = previous.match(/[\p{L}\p{N}']+/gu) ?? [];
  const nextWords = next.match(/[\p{L}\p{N}']+/gu) ?? [];
  const normalize = (word) => word.toLocaleLowerCase().replace(/^'+|'+$/g, "");
  const previousNormalized = previousWords.map(normalize);
  const nextNormalized = nextWords.map(normalize);
  if (nextNormalized.length && previousNormalized.join(" ").endsWith(nextNormalized.join(" "))) return previous;
  const maxOverlap = Math.min(maxOverlapWords, previousWords.length, nextWords.length);
  let overlap = 0;
  for (let size = maxOverlap; size > 0; size -= 1) {
    const previousTail = previousNormalized.slice(-size);
    const nextHead = nextNormalized.slice(0, size);
    if (previousTail.every((word, index) => word === nextHead[index])) {
      overlap = size;
      break;
    }
  }
  const suffix = nextWords.slice(overlap).join(" ");
  return suffix ? `${previous} ${suffix}` : previous;
}

export function terminateLocalSpeechWorker() {
  worker?.terminate();
  worker = null;
  pending.forEach(({ reject, timer }) => {
    globalThis.clearTimeout(timer);
    reject(new Error("Local speech transcription was stopped."));
  });
  pending.clear();
}
