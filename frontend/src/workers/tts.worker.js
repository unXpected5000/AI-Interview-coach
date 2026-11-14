import { AutoTokenizer, StyleTextToSpeech2Model, Tensor } from "@huggingface/transformers";
import { phonemize } from "phonemizer";

import { normalizeForSpeech, postProcessPhonemes, splitOnPunctuation, styleOffset } from "../speech/kokoroText.js";

// On-device Kokoro-82M (Apache-2.0 weights). Runs entirely in this worker; the
// model (~90 MB, 8-bit) and voice file download once and are browser-cached.
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE_URL = (voice) => `https://huggingface.co/${MODEL_ID}/resolve/main/voices/${voice}.bin`;
const SAMPLE_RATE = 24000;

let loadPromise;
const voices = new Map();

async function loadVoice(voice) {
  if (voices.has(voice)) return voices.get(voice);
  const url = VOICE_URL(voice);
  let buffer;
  try {
    const cache = await caches.open("kokoro-voices");
    const cached = await cache.match(url);
    if (cached) buffer = await cached.arrayBuffer();
    if (!buffer) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Voice download failed (${response.status}).`);
      buffer = await response.arrayBuffer();
      await cache.put(url, new Response(buffer.slice(0))).catch(() => {});
    }
  } catch (error) {
    if (!buffer) throw error;
  }
  const data = new Float32Array(buffer);
  voices.set(voice, data);
  return data;
}

function load(voice) {
  if (!loadPromise) {
    loadPromise = (async () => {
      const progress_callback = (progress) => self.postMessage({ type: "progress", progress });
      const [model, tokenizer] = await Promise.all([
        StyleTextToSpeech2Model.from_pretrained(MODEL_ID, { dtype: "q8", device: "wasm", progress_callback }),
        AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback }),
      ]);
      return { model, tokenizer };
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return Promise.all([loadPromise, loadVoice(voice)]);
}

async function toPhonemes(text, american) {
  const language = american ? "en-us" : "en";
  const parts = await Promise.all(
    splitOnPunctuation(normalizeForSpeech(text)).map(async ({ match, text: part }) => (match ? part : (await phonemize(part, language)).join(" "))),
  );
  return postProcessPhonemes(parts.join(""), american);
}

async function synthesize(text, voice, speed) {
  const [{ model, tokenizer }, voiceData] = await load(voice);
  const phonemes = await toPhonemes(text, voice.startsWith("a"));
  const { input_ids: inputIds } = tokenizer(phonemes, { truncation: true });
  const offset = styleOffset(inputIds.dims.at(-1));
  const { waveform } = await model({
    input_ids: inputIds,
    style: new Tensor("float32", voiceData.slice(offset, offset + 256), [1, 256]),
    speed: new Tensor("float32", [speed], [1]),
  });
  return waveform.data;
}

self.onmessage = async (event) => {
  const { type, requestId, text, voice = "af_heart", speed = 1 } = event.data ?? {};
  try {
    if (type === "load") {
      await load(voice);
      self.postMessage({ type: "ready", requestId });
    } else if (type === "speak") {
      const audio = await synthesize(text, voice, speed);
      self.postMessage({ type: "audio", requestId, audio, sampleRate: SAMPLE_RATE }, [audio.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: "error", requestId, message: error?.message ?? "Speech synthesis failed." });
  }
};
