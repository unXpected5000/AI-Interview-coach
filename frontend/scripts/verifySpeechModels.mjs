// Round-trip check for the on-device speech models used by the live interview:
// Kokoro speaks a sentence, Moonshine transcribes it back, and the words are
// compared. Usage: node scripts/verifySpeechModels.mjs [cacheDir]
// The first run downloads both models from Hugging Face (about 150 MB).
import { AutoTokenizer, StyleTextToSpeech2Model, Tensor, env, pipeline } from "@huggingface/transformers";
import { phonemize } from "phonemizer";

import { normalizeForSpeech, postProcessPhonemes, splitOnPunctuation, styleOffset } from "../src/speech/kokoroText.js";

if (process.argv[2]) env.cacheDir = process.argv[2];
const KOKORO = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MOONSHINE = "onnx-community/moonshine-base-ONNX";
const TEXT = "Tell me about your time as a team lead. What were you responsible for?";

function resample(audio, from, to) {
  const ratio = from / to;
  const output = new Float32Array(Math.floor(audio.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const source = index * ratio;
    const left = Math.floor(source);
    const right = Math.min(left + 1, audio.length - 1);
    output[index] = audio[left] * (1 - (source - left)) + audio[right] * (source - left);
  }
  return output;
}

const words = (text) => text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

let started = performance.now();
const [model, tokenizer] = await Promise.all([
  StyleTextToSpeech2Model.from_pretrained(KOKORO, { dtype: "q8", device: "cpu" }),
  AutoTokenizer.from_pretrained(KOKORO),
]);
const voiceResponse = await fetch(`https://huggingface.co/${KOKORO}/resolve/main/voices/af_heart.bin`);
const voice = new Float32Array(await voiceResponse.arrayBuffer());
console.log(`Kokoro loaded in ${Math.round(performance.now() - started)} ms`);

started = performance.now();
const parts = await Promise.all(splitOnPunctuation(normalizeForSpeech(TEXT)).map(async ({ match, text }) => (match ? text : (await phonemize(text, "en-us")).join(" "))));
const phonemes = postProcessPhonemes(parts.join(""));
const { input_ids: inputIds } = tokenizer(phonemes, { truncation: true });
const offset = styleOffset(inputIds.dims.at(-1));
const { waveform } = await model({
  input_ids: inputIds,
  style: new Tensor("float32", voice.slice(offset, offset + 256), [1, 256]),
  speed: new Tensor("float32", [1], [1]),
});
const audio = waveform.data;
const seconds = audio.length / 24000;
console.log(`Kokoro: ${seconds.toFixed(2)} s of audio in ${Math.round(performance.now() - started)} ms; phonemes: ${phonemes.slice(0, 60)}...`);
if (seconds < 2 || seconds > 12) throw new Error("Unexpected speech length.");

started = performance.now();
const transcriber = await pipeline("automatic-speech-recognition", MOONSHINE, { dtype: "q8", device: "cpu" });
console.log(`Moonshine loaded in ${Math.round(performance.now() - started)} ms`);
started = performance.now();
const result = await transcriber(resample(audio, 24000, 16000));
console.log(`Moonshine transcribed in ${Math.round(performance.now() - started)} ms: "${result.text.trim()}"`);

const expected = words(TEXT);
const heard = new Set(words(result.text));
const recall = expected.filter((word) => heard.has(word)).length / expected.length;
console.log(`Word recall: ${(recall * 100).toFixed(0)}%`);
if (recall < 0.7) throw new Error("Round trip recognised too few words.");
console.log("OK: speech synthesis and live transcription models work.");
