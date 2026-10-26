const TARGET_SAMPLE_RATE = 16_000;

function getAudioContextConstructor(browserWindow = globalThis.window) {
  return browserWindow?.AudioContext ?? browserWindow?.webkitAudioContext ?? null;
}
export async function startLocalSpeechCapture({
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorderConstructor = globalThis.MediaRecorder,
} = {}) {
  if (!mediaDevices?.getUserMedia || !MediaRecorderConstructor) {
    throw new Error("Local audio capture is not supported by this browser.");
  }
  const stream = await mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  const audioTracks = stream.getAudioTracks?.() ?? [];
  if (!audioTracks.length || audioTracks.every((track) => track.readyState === "ended" || track.muted)) {
    stream.getTracks?.().forEach((track) => track.stop());
    throw new Error("The browser did not provide an active microphone input.");
  }

  const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]
    .find((type) => MediaRecorderConstructor.isTypeSupported?.(type));
  const recorder = mimeType ? new MediaRecorderConstructor(stream, { mimeType }) : new MediaRecorderConstructor(stream);
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  try {
    recorder.start(1000);
  } catch (error) {
    stream.getTracks?.().forEach((track) => track.stop());
    throw error;
  }

  let stoppedBlob;
  let stopping;
  const release = () => stream.getTracks?.().forEach((track) => track.stop());
  return {
    snapshot() {
      return new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
    },
    async stop() {
      if (stoppedBlob) return stoppedBlob;
      if (stopping) return stopping;
      stopping = new Promise((resolve, reject) => {
        recorder.onstop = () => {
          release();
          stoppedBlob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          resolve(stoppedBlob);
        };
        recorder.onerror = (event) => {
          release();
          reject(event.error ?? new Error("Could not finish the local audio capture."));
        };
        try {
          if (recorder.state === "inactive") {
            release();
            stoppedBlob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
            resolve(stoppedBlob);
          } else recorder.stop();
        } catch (error) {
          release();
          reject(error);
        }
      });
      return stopping;
    },
    cancel() {
      recorder.ondataavailable = null;
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* The recording may already be stopped. */ }
      }
      release();
    },
  };
}

export async function decodeSpeechBlob(blob, {
  AudioContextConstructor = getAudioContextConstructor(),
  targetSampleRate = TARGET_SAMPLE_RATE,
} = {}) {
  if (!blob?.size) throw new Error("No microphone audio was captured for local transcription.");
  if (!AudioContextConstructor) throw new Error("Audio decoding is not supported by this browser.");

  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const samples = decoded.getChannelData(channel);
      for (let index = 0; index < samples.length; index += 1) mono[index] += samples[index] / decoded.numberOfChannels;
    }
    if (decoded.sampleRate === targetSampleRate) return mono;

    const outputLength = Math.ceil(mono.length * targetSampleRate / decoded.sampleRate);
    const resampled = new Float32Array(outputLength);
    const ratio = decoded.sampleRate / targetSampleRate;
    for (let index = 0; index < outputLength; index += 1) {
      const sourceIndex = index * ratio;
      const left = Math.floor(sourceIndex);
      const right = Math.min(left + 1, mono.length - 1);
      const fraction = sourceIndex - left;
      resampled[index] = mono[left] * (1 - fraction) + mono[right] * fraction;
    }
    return resampled;
  } finally {
    if (context.state !== "closed") await context.close().catch(() => {});
  }
}
