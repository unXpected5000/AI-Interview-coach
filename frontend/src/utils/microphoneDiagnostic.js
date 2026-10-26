import { createSpeechRecognition } from "./speechRecognition.js";
import { startLocalSpeechCapture } from "./localSpeechCapture.js";
import { transcribeAudioBlob } from "./localSpeechTranscription.js";

export class MicrophoneDiagnosticError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MicrophoneDiagnosticError";
    this.code = code;
  }
}

export function microphoneDiagnosticMessage(error) {
  const code = error?.name ?? error?.code;
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError", "permission_denied"].includes(code)) {
    return "Microphone access was blocked. Allow microphone access for this site in your browser settings, then try again.";
  }
  if (["NotFoundError", "DevicesNotFoundError", "device_missing"].includes(code)) {
    return "No microphone was found. Connect a microphone or check that your selected input device is available.";
  }
  if (["NotReadableError", "TrackStartError", "device_busy"].includes(code)) {
    return "The microphone is busy or unavailable. Close other apps using it, then try again.";
  }
  if (["insecure_context", "unsupported"].includes(code)) {
    return "Microphone testing needs a supported browser on HTTPS or localhost.";
  }
  if (["audio_context", "NotSupportedError"].includes(code)) {
    return "Your browser granted microphone access but cannot measure its input level. You can still try browser speech recognition.";
  }
  return "Microphone test failed. Check browser permissions and your input device, then try again.";
}

export function speechRecognitionErrorMessage(errorCode) {
  const messages = {
    "not-allowed": "Microphone access was blocked. Allow microphone access for this site in your browser settings, or type your answer.",
    "service-not-allowed": "The browser's speech service is unavailable or blocked. Try another supported browser or type your answer.",
    "audio-capture": "The browser could not find or open a microphone. Connect an input device or type your answer.",
    network: "The browser speech service lost its network connection. This app can use its local transcription backup; if that is unavailable, type your answer.",
    "no-speech": "No speech was detected. Check the microphone and speak clearly, or type your answer.",
    aborted: "Speech recognition stopped.",
  };
  return messages[errorCode] ?? `Speech recognition failed (${errorCode || "unknown error"}). Check your microphone or type your answer.`;
}

export async function testSpeechRecognition({
  createRecognition = createSpeechRecognition,
  timeoutMs = 8000,
  schedule = globalThis.setTimeout,
  cancel = globalThis.clearTimeout,
  useLocalFallback = false,
  onStatus = () => {},
  captureAudio = startLocalSpeechCapture,
  transcribeAudio = transcribeAudioBlob,
} = {}) {
  let localCapture = null;
  let localCaptureError = null;
  if (useLocalFallback) {
    try {
      localCapture = await captureAudio();
    } catch (error) {
      localCaptureError = error;
    }
  }
  const transcribeLocally = async () => {
    if (!localCapture) throw localCaptureError ?? new MicrophoneDiagnosticError("unsupported", "Local speech capture is unavailable.");
    onStatus("Browser recognition did not return a transcript. Preparing on-device Whisper…");
    const audio = await localCapture.stop();
    localCapture = null;
    const transcript = await transcribeAudio(audio, {
      onProgress: (progress) => {
        if (progress?.status === "progress") onStatus(`Preparing offline speech model (${Math.round(progress.progress ?? 0)}%)…`);
      },
    });
    if (!transcript) throw new MicrophoneDiagnosticError("no-speech", "On-device speech recognition heard no clear words.");
    return { transcript, processLocally: true, engine: "Whisper on this device" };
  };

  let recognition;
  let processLocally;
  try {
    ({ recognition, processLocally } = await createRecognition());
  } catch (error) {
    if (useLocalFallback && localCapture) return transcribeLocally();
    localCapture?.cancel();
    throw error;
  }
  if (!recognition) {
    if (useLocalFallback && localCapture) return transcribeLocally();
    throw new MicrophoneDiagnosticError("unsupported", "Speech recognition is not supported in this browser.");
  }

  try {
    const result = await new Promise((resolve, reject) => {
    let transcript = "";
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cancel(timer);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* It may already have stopped. */ }
      if (error) reject(error);
      else resolve({ transcript, processLocally });
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) transcript = `${transcript} ${event.results[index][0]?.transcript ?? ""}`.trim();
      }
      if (transcript) finish();
    };
    recognition.onerror = (event) => finish(new MicrophoneDiagnosticError(event.error, speechRecognitionErrorMessage(event.error)));
    recognition.onend = () => {
      if (transcript) finish();
      else finish(new MicrophoneDiagnosticError("no-speech", speechRecognitionErrorMessage("no-speech")));
    };
    timer = schedule(() => {
      if (transcript) finish();
      else finish(new MicrophoneDiagnosticError("timeout", "Speech recognition heard no words. Check the selected microphone, browser speech service, and permissions."));
    }, timeoutMs);
    try {
      recognition.start();
    } catch (error) {
      finish(new MicrophoneDiagnosticError("start-failed", error?.message || "Speech recognition could not start."));
    }
    });
    localCapture?.cancel();
    return { ...result, processLocally };
  } catch (error) {
    if (useLocalFallback && localCapture && ["network", "service-not-allowed", "no-speech", "timeout", "start-failed"].includes(error?.code)) {
      return transcribeLocally();
    }
    localCapture?.cancel();
    throw error;
  }
}

export async function testMicrophoneInput({
  mediaDevices = globalThis.navigator?.mediaDevices,
  AudioContextConstructor = globalThis.window?.AudioContext ?? globalThis.window?.webkitAudioContext,
  sampleDurationMs = 1400,
  sampleIntervalMs = 50,
  onLevel = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  if (!mediaDevices?.getUserMedia) {
    throw new MicrophoneDiagnosticError("unsupported", "Media capture is unavailable.");
  }

  let stream;
  let context;
  let source;
  try {
    stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    const audioTracks = stream.getAudioTracks?.() ?? [];
    if (!audioTracks.length || audioTracks.every((track) => track.readyState === "ended" || track.muted)) {
      throw new MicrophoneDiagnosticError("device_missing", "No active microphone track was supplied.");
    }
    if (!AudioContextConstructor) {
      throw new MicrophoneDiagnosticError("audio_context", "Audio level measurement is unavailable.");
    }

    context = new AudioContextConstructor();
    if (context.state === "suspended") await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = now();
    let peakLevel = 0;
    while (now() - startedAt < sampleDurationMs) {
      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const level = Math.max(0, Math.min(100, Math.round(rms * 400)));
      peakLevel = Math.max(peakLevel, level);
      onLevel(level);
      await sleep(sampleIntervalMs);
    }
    onLevel(0);
    return { peakLevel, signalDetected: peakLevel >= 3, durationMs: sampleDurationMs };
  } catch (error) {
    onLevel(0);
    if (error instanceof MicrophoneDiagnosticError) throw error;
    if (["NotAllowedError", "PermissionDeniedError", "SecurityError", "NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError"].includes(error?.name)) {
      throw error;
    }
    throw new MicrophoneDiagnosticError("audio_context", error?.message ?? "Microphone test failed.");
  } finally {
    source?.disconnect?.();
    stream?.getTracks?.().forEach((track) => track.stop());
    if (context && context.state !== "closed") await context.close().catch(() => {});
  }
}
