import { SAMPLE_RATE, SpeechSegmenter, cleanTranscript, resampleTo16k } from "./speechSegmenter.js";

// Live, private speech-to-text that runs on this device (Moonshine). Unlike the
// browser's SpeechRecognition service it does not depend on an online speech
// provider, so it keeps working where that service is blocked or unavailable.

export const SPEECH_ENGINE_KEY = "ai-interview-coach-speech-engine";
export const SPEECH_ENGINES = { auto: "auto", local: "local" };

export function readSpeechEnginePreference(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(SPEECH_ENGINE_KEY) === "local" ? "local" : "auto";
  } catch {
    return "auto";
  }
}

export function saveSpeechEnginePreference(value, storage = globalThis.localStorage) {
  try { storage?.setItem(SPEECH_ENGINE_KEY, value === "local" ? "local" : "auto"); } catch { /* storage blocked */ }
}

let worker;
let nextId = 1;
const pending = new Map();
const progressListeners = new Set();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../workers/liveSpeech.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === "progress" || message.type === "status") {
        progressListeners.forEach((listener) => listener(message));
        return;
      }
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      if (message.type === "error") request.reject(new Error(message.message));
      else request.resolve(message);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The live speech worker stopped.");
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function request(type, payload = {}, transfer = []) {
  const requestId = nextId++;
  const active = getWorker();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    active.postMessage({ type, requestId, ...payload }, transfer);
  });
}

/** Download/initialise the live speech model; onProgress receives 0-100. */
export async function prepareLiveTranscription(onProgress) {
  const files = new Map();
  const listener = (message) => {
    const progress = message.progress;
    if (progress?.status === "progress" && progress.file) files.set(progress.file, progress.progress ?? 0);
    if (files.size) onProgress?.(Math.round([...files.values()].reduce((sum, value) => sum + value, 0) / files.size));
  };
  progressListeners.add(listener);
  try {
    await request("load");
  } finally {
    progressListeners.delete(listener);
  }
}

export function terminateLiveTranscription() {
  worker?.terminate();
  worker = null;
  pending.forEach(({ reject }) => reject(new Error("Live transcription stopped.")));
  pending.clear();
}

const WORKLET_SOURCE = `
class LiveCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("live-capture", LiveCaptureProcessor);
`;

/**
 * Start capturing the microphone. In standby (active: false) audio is captured
 * and segmented but not transcribed; activate() transcribes everything said so
 * far and continues live. Callbacks:
 *   onText({ text, final }) - full transcript so far (final phrases + live preview)
 *   onLevel(level)          - input loudness 0-1 for a meter
 *   onSpeech(isSpeaking)    - voice activity changes
 *   onError(error)          - transcription errors
 */
export async function startLiveTranscriber({ active = true, onText, onLevel, onSpeech, onError } = {}) {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (!mediaDevices?.getUserMedia) throw new Error("Microphone capture is not supported by this browser.");
  const stream = await mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    video: false,
  });
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextConstructor();
  await context.resume().catch(() => {});
  const source = context.createMediaStreamSource(stream);
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);

  // 8 s phrases keep live captions within a few seconds on CPU-only devices.
  const segmenter = new SpeechSegmenter({ maxPhraseMs: 8000 });
  const finals = [];
  const queue = [];
  let previewText = "";
  let previewStart = null;
  let transcribing = active;
  let busy = false;
  let stopped = false;
  let rawPending = [];
  let rawLength = 0;
  let previewTimer;
  let drainResolvers = [];
  const committedPhrases = [];

  const emit = () => {
    const text = [...finals, previewText].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    onText?.({ text, final: finals.join(" ").trim() });
  };

  const runQueue = async () => {
    if (busy || !transcribing) return;
    const job = queue.shift();
    if (!job) {
      drainResolvers.forEach((resolve) => resolve());
      drainResolvers = [];
      return;
    }
    busy = true;
    try {
      const audio = segmenter.slice(job.start, job.end);
      if (audio.length >= SAMPLE_RATE * 0.3) {
        const result = await request("transcribe", { audio }, [audio.buffer]);
        const text = cleanTranscript(result.text);
        if (job.final) {
          if (text) finals.push(text);
          if (previewStart === job.start) {
            previewText = "";
            previewStart = null;
          }
          emit();
        } else if (!stopped && previewStart === job.start) {
          previewText = text;
          emit();
        }
      } else if (job.final && previewStart === job.start) {
        previewText = "";
        previewStart = null;
      }
    } catch (error) {
      onError?.(error);
    } finally {
      busy = false;
      runQueue();
    }
  };

  const enqueueFinal = (phrase) => {
    committedPhrases.push(phrase);
    if (!transcribing) return;
    // A final for the phrase replaces any queued preview of it.
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (!queue[index].final) queue.splice(index, 1);
    }
    queue.push({ ...phrase, final: true });
    runQueue();
  };

  const handleSamples = (samples) => {
    if (stopped) return;
    rawPending.push(samples);
    rawLength += samples.length;
    if (rawLength < context.sampleRate * 0.1) return; // batch ~100 ms
    const joined = new Float32Array(rawLength);
    let position = 0;
    for (const part of rawPending) {
      joined.set(part, position);
      position += part.length;
    }
    rawPending = [];
    rawLength = 0;
    const wasSpeaking = segmenter.speaking;
    const events = segmenter.push(resampleTo16k(joined, context.sampleRate));
    onLevel?.(segmenter.lastLevel);
    for (const event of events) {
      if (event.type === "phrase-end") enqueueFinal({ start: event.start, end: event.end });
    }
    if (wasSpeaking !== segmenter.speaking) onSpeech?.(segmenter.speaking);
  };

  let node;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    node = new AudioWorkletNode(context, "live-capture");
    node.port.onmessage = (event) => handleSamples(event.data);
  } catch {
    // Older browsers: ScriptProcessorNode is deprecated but widely available.
    node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => handleSamples(event.inputBuffer.getChannelData(0).slice(0));
  }
  source.connect(node);
  node.connect(mute);

  // Refresh the preview of the phrase being spoken about once a second.
  previewTimer = setInterval(() => {
    if (!transcribing || busy || stopped) return;
    const phrase = segmenter.openPhrase();
    if (!phrase || phrase.end - phrase.start < SAMPLE_RATE * 0.6) return;
    previewStart = phrase.start;
    queue.push({ ...phrase, final: false });
    runQueue();
  }, 900);

  const release = () => {
    clearInterval(previewTimer);
    try { source.disconnect(); node.disconnect(); } catch { /* already disconnected */ }
    stream.getTracks().forEach((track) => track.stop());
    context.close().catch(() => {});
  };

  return {
    get active() {
      return transcribing;
    },
    /** Start transcribing, including everything captured since the answer began. */
    activate() {
      if (transcribing || stopped) return;
      transcribing = true;
      for (const phrase of committedPhrases) queue.push({ ...phrase, final: true });
      runQueue();
    },
    /** Finish: transcribe the last phrase and resolve with the full transcript. */
    async stop({ timeoutMs = 20000 } = {}) {
      if (stopped) return finals.join(" ").trim();
      stopped = true;
      const tail = segmenter.flush();
      if (tail) enqueueFinal(tail);
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (!queue[index].final) queue.splice(index, 1);
      }
      previewText = "";
      if (transcribing && (busy || queue.length)) {
        await Promise.race([
          new Promise((resolve) => { drainResolvers.push(resolve); runQueue(); }),
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      }
      release();
      return finals.join(" ").trim();
    },
    cancel() {
      stopped = true;
      queue.length = 0;
      release();
    },
  };
}
