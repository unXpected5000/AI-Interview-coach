import { splitIntoSentences } from "./kokoroText.js";
import { mouthShapeFromSpectrum } from "./lipSync.js";

// Interviewer voices: natural-sounding Kokoro voices (American and British).
export const NEURAL_VOICES = [
  { id: "af_heart", label: "Heart (US, female)" },
  { id: "af_bella", label: "Bella (US, female)" },
  { id: "am_michael", label: "Michael (US, male)" },
  { id: "am_fenrir", label: "Fenrir (US, male)" },
  { id: "bf_emma", label: "Emma (UK, female)" },
  { id: "bm_george", label: "George (UK, male)" },
];
export const DEFAULT_NEURAL_VOICE = "af_heart";

let worker;
let nextId = 1;
const pending = new Map();
const progressListeners = new Set();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../workers/tts.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === "progress") {
        progressListeners.forEach((listener) => listener(message.progress));
        return;
      }
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      if (message.type === "error") request.reject(new Error(message.message));
      else request.resolve(message);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The voice worker stopped.");
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function request(type, payload = {}) {
  const requestId = nextId++;
  const active = getWorker();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    active.postMessage({ type, requestId, ...payload });
  });
}

// Generated audio per sentence, so text can be synthesised ahead of time
// (for example the next question while the candidate is still answering).
const audioCache = new Map();
const MAX_CACHED_SENTENCES = 60;

function synthesizeSentence(text, voice, speed) {
  const key = `${voice}|${speed}|${text}`;
  if (audioCache.has(key)) {
    const cached = audioCache.get(key);
    audioCache.delete(key);
    audioCache.set(key, cached); // keep recently used entries
    return cached;
  }
  const promise = request("speak", { text, voice, speed });
  promise.catch(() => audioCache.delete(key));
  audioCache.set(key, promise);
  while (audioCache.size > MAX_CACHED_SENTENCES) audioCache.delete(audioCache.keys().next().value);
  return promise;
}

/** Start generating speech for text in the background so it plays instantly later. */
export function prefetchNeural(text, { voice = DEFAULT_NEURAL_VOICE, speed = 1 } = {}) {
  for (const sentence of splitIntoSentences(text)) synthesizeSentence(sentence, voice, speed).catch(() => {});
}

/** Download and initialise the voice model; reports download progress (0-100). */
export async function prepareNeuralVoice(voice = DEFAULT_NEURAL_VOICE, onProgress) {
  const files = new Map();
  const listener = (progress) => {
    if (progress?.status === "progress" && progress.file) files.set(progress.file, progress.progress ?? 0);
    if (files.size) onProgress?.(Math.round([...files.values()].reduce((sum, value) => sum + value, 0) / files.size));
  };
  progressListeners.add(listener);
  try {
    await request("load", { voice });
  } finally {
    progressListeners.delete(listener);
  }
}

export function terminateNeuralVoice() {
  worker?.terminate();
  worker = null;
  pending.forEach(({ reject }) => reject(new Error("Voice stopped.")));
  pending.clear();
}

/**
 * Speak text with the on-device model. Sentences are synthesised ahead while
 * earlier ones play. Returns a controller with cancel(). Callbacks:
 *   onStart() when audio begins, onMouth({ level, open, wide, round }) about
 *   60 times a second for lip-sync, onEnd() when finished or cancelled,
 *   onError(error) if synthesis fails before any audio played.
 */
export function speakNeural(text, { voice = DEFAULT_NEURAL_VOICE, speed = 1, onStart, onMouth, onEnd, onError } = {}) {
  const sentences = splitIntoSentences(text);
  let cancelled = false;
  let started = false;
  let context;
  let source;
  let frame;

  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    onMouth?.({ level: 0, open: 0, wide: 0, round: 0 });
    context?.close().catch(() => {});
    context = null;
    onEnd?.();
  };

  (async () => {
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      await context.resume().catch(() => {});
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      analyser.connect(context.destination);
      const spectrum = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(spectrum);
        onMouth?.(mouthShapeFromSpectrum(spectrum, context.sampleRate));
        frame = requestAnimationFrame(tick);
      };

      // Synthesise the next sentence while the current one plays.
      // Queue every sentence now; cached (prefetched) ones resolve immediately.
      const pendingAudio = sentences.map((sentence) => synthesizeSentence(sentence, voice, speed));
      for (let index = 0; index < sentences.length && !cancelled; index += 1) {
        const result = await pendingAudio[index];
        if (cancelled || !context) break;
        const buffer = context.createBuffer(1, result.audio.length, result.sampleRate);
        buffer.copyToChannel(result.audio, 0);
        source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        if (!started) {
          started = true;
          onStart?.();
          tick();
        }
        await new Promise((resolve) => {
          source.onended = resolve;
          source.start();
        });
        // A short breath between sentences sounds more natural.
        if (!cancelled && index + 1 < sentences.length) await new Promise((resolve) => setTimeout(resolve, 140));
      }
      finish();
    } catch (error) {
      cancelAnimationFrame(frame);
      context?.close().catch(() => {});
      context = null;
      if (cancelled || ended) return;
      ended = true;
      if (started) onEnd?.();
      else onError?.(error);
    }
  })();

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      try { source?.stop(); } catch { /* already stopped */ }
      finish();
    },
  };
}
