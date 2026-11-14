import { pipeline } from "@huggingface/transformers";

// Moonshine is a small speech model built for live transcription; it handles
// short phrases quickly on CPU (WASM) and faster still with WebGPU.
const MODEL_ID = "onnx-community/moonshine-base-ONNX";
let transcriberPromise;

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const progress_callback = (progress) => self.postMessage({ type: "progress", progress });
      let hasGpu = false;
      try {
        hasGpu = Boolean(self.navigator?.gpu && await self.navigator.gpu.requestAdapter());
      } catch {
        hasGpu = false;
      }
      if (hasGpu) {
        try {
          return await pipeline("automatic-speech-recognition", MODEL_ID, {
            device: "webgpu",
            dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
            progress_callback,
          });
        } catch {
          self.postMessage({ type: "status", message: "GPU speech setup failed; using CPU." });
        }
      }
      return pipeline("automatic-speech-recognition", MODEL_ID, { device: "wasm", dtype: "q8", progress_callback });
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

self.onmessage = async (event) => {
  const { type, requestId, audio } = event.data ?? {};
  try {
    if (type === "load") {
      await getTranscriber();
      self.postMessage({ type: "ready", requestId });
      return;
    }
    if (type === "transcribe") {
      const transcriber = await getTranscriber();
      const started = performance.now();
      const result = await transcriber(audio);
      self.postMessage({
        type: "transcript",
        requestId,
        text: String(result?.text ?? "").trim(),
        ms: Math.round(performance.now() - started),
      });
    }
  } catch (error) {
    self.postMessage({ type: "error", requestId, message: error?.message ?? "Live transcription failed." });
  }
};
