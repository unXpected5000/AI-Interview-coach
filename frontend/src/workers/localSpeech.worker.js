import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-tiny.en";
let transcriberPromise;

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      let device = "wasm";
      try {
        if (self.navigator?.gpu && await self.navigator.gpu.requestAdapter()) device = "webgpu";
      } catch {
        // CPU/WASM remains the supported fallback when WebGPU is unavailable.
      }
      const options = {
        device,
        dtype: "q8",
        progress_callback: (progress) => self.postMessage({ type: "model-progress", progress }),
      };
      try {
        return await pipeline("automatic-speech-recognition", MODEL_ID, options);
      } catch (error) {
        if (device === "wasm") throw error;
        self.postMessage({ type: "status", message: "GPU setup failed; switching to CPU speech recognitionâ€¦" });
        return pipeline("automatic-speech-recognition", MODEL_ID, { ...options, device: "wasm" });
      }
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

self.onmessage = async (event) => {
  const { type, requestId, audio } = event.data ?? {};
  if (type === "warmup") {
    try {
      await getTranscriber();
      self.postMessage({ type: "ready", requestId });
    } catch (error) {
      self.postMessage({ type: "error", requestId, message: error?.message ?? "Could not load the local speech model." });
    }
    return;
  }
  if (type !== "transcribe") return;
  try {
    const transcriber = await getTranscriber();
    const result = await transcriber(new Float32Array(audio), { chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ type: "transcript", requestId, text: result?.text?.trim() ?? "" });
  } catch (error) {
    self.postMessage({ type: "error", requestId, message: error?.message ?? "Local speech transcription failed." });
  }
};
