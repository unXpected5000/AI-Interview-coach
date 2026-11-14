// Energy-based voice activity detection and phrase segmentation for live
// on-device transcription. Pure logic (no browser APIs) so it is unit-tested.
//
// Audio arrives as 16 kHz mono Float32 chunks. The segmenter keeps the whole
// answer's audio (bounded), tracks an adaptive noise floor, and reports:
//   - when speech starts and stops,
//   - which part of the buffer is the current open phrase (for live previews),
//   - when a phrase is complete (after a pause) so it can be finalised.

export const SAMPLE_RATE = 16000;
const FRAME = 480; // 30 ms

export class SpeechSegmenter {
  constructor({
    sampleRate = SAMPLE_RATE,
    endSilenceMs = 650,
    minSpeechMs = 180,
    maxPhraseMs = 12000,
    preRollMs = 250,
    maxBufferSeconds = 240,
  } = {}) {
    this.sampleRate = sampleRate;
    this.endSilenceFrames = Math.ceil(endSilenceMs / 30);
    this.minSpeechFrames = Math.ceil(minSpeechMs / 30);
    this.maxPhraseSamples = Math.round((maxPhraseMs / 1000) * sampleRate);
    this.preRollSamples = Math.round((preRollMs / 1000) * sampleRate);
    this.maxBufferSamples = maxBufferSeconds * sampleRate;
    this.reset();
  }

  reset() {
    this.buffer = new Float32Array(Math.min(this.maxBufferSamples, this.sampleRate * 30));
    this.length = 0;
    this.offset = 0; // samples dropped from the front when the buffer is full
    this.pending = new Float32Array(0);
    this.noiseFloor = 0.004;
    this.speaking = false;
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.phraseStart = null; // absolute sample index
    this.lastLevel = 0;
  }

  /** Absolute index of the end of the buffered audio. */
  get end() {
    return this.offset + this.length;
  }

  _append(chunk) {
    if (this.length + chunk.length > this.buffer.length) {
      const capacity = Math.min(this.maxBufferSamples, Math.max(this.buffer.length * 2, this.length + chunk.length));
      if (capacity > this.buffer.length) {
        const grown = new Float32Array(capacity);
        grown.set(this.buffer.subarray(0, this.length));
        this.buffer = grown;
      }
      const overflow = this.length + chunk.length - this.buffer.length;
      if (overflow > 0) {
        this.buffer.copyWithin(0, overflow, this.length);
        this.length -= overflow;
        this.offset += overflow;
      }
    }
    this.buffer.set(chunk, this.length);
    this.length += chunk.length;
  }

  /** Audio between two absolute sample indexes (clamped to what is buffered). */
  slice(start, end = this.end) {
    const from = Math.max(0, start - this.offset);
    const to = Math.max(from, Math.min(this.length, end - this.offset));
    return this.buffer.slice(from, to);
  }

  /**
   * Feed audio. Returns events: { type: "speech-start" }, { type: "phrase-end",
   * start, end } (absolute sample range to finalise). `level` is 0-1 loudness.
   */
  push(chunk) {
    this._append(chunk);
    const events = [];
    const combined = new Float32Array(this.pending.length + chunk.length);
    combined.set(this.pending);
    combined.set(chunk, this.pending.length);
    let position = 0;
    const firstIndex = this.end - combined.length;
    for (; position + FRAME <= combined.length; position += FRAME) {
      let energy = 0;
      for (let index = position; index < position + FRAME; index += 1) energy += combined[index] * combined[index];
      const rms = Math.sqrt(energy / FRAME);
      this.lastLevel = Math.min(1, rms * 12);
      const threshold = Math.max(this.noiseFloor * 3.2, 0.012);
      const voiced = rms > threshold;
      if (!voiced) this.noiseFloor = this.noiseFloor * 0.97 + rms * 0.03; // adapt to background noise
      const frameStart = firstIndex + position;

      if (voiced) {
        this.speechFrames += 1;
        this.silenceFrames = 0;
        if (!this.speaking && this.speechFrames >= this.minSpeechFrames) {
          this.speaking = true;
          this.phraseStart = Math.max(this.offset, frameStart - this.speechFrames * FRAME - this.preRollSamples);
          events.push({ type: "speech-start" });
        }
      } else {
        this.speechFrames = this.speaking ? this.speechFrames : 0;
        if (this.speaking) {
          this.silenceFrames += 1;
          if (this.silenceFrames >= this.endSilenceFrames) {
            events.push({ type: "phrase-end", start: this.phraseStart, end: frameStart + FRAME });
            this.speaking = false;
            this.speechFrames = 0;
            this.silenceFrames = 0;
            this.phraseStart = null;
          }
        }
      }
      // Very long phrases are cut so previews and finals stay fast.
      if (this.speaking && frameStart + FRAME - this.phraseStart >= this.maxPhraseSamples) {
        events.push({ type: "phrase-end", start: this.phraseStart, end: frameStart + FRAME });
        this.phraseStart = frameStart + FRAME;
      }
    }
    this.pending = combined.slice(position);
    return events;
  }

  /** The open phrase so far (for a live preview), or null when silent. */
  openPhrase() {
    if (!this.speaking || this.phraseStart === null) return null;
    return { start: this.phraseStart, end: this.end };
  }

  /** Close any open phrase (when the answer is finished). */
  flush() {
    if (this.phraseStart === null || !this.speaking) return null;
    const phrase = { start: this.phraseStart, end: this.end };
    this.speaking = false;
    this.phraseStart = null;
    this.speechFrames = 0;
    this.silenceFrames = 0;
    return phrase;
  }
}

/** Linear-interpolation resampler from the capture rate to 16 kHz. */
export function resampleTo16k(input, inputRate) {
  if (inputRate === SAMPLE_RATE) return Float32Array.from(input);
  const ratio = inputRate / SAMPLE_RATE;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const source = index * ratio;
    const left = Math.floor(source);
    const right = Math.min(left + 1, input.length - 1);
    output[index] = input[left] * (1 - (source - left)) + input[right] * (source - left);
  }
  return output;
}

/** Whisper-family models hallucinate short filler on silence; drop it. */
export function cleanTranscript(text) {
  const cleaned = String(text ?? "").replace(/\[(?:[^\]]*)\]|\((?:[^)]*)\)/g, " ").replace(/\s+/g, " ").trim();
  if (/^(you|thank you\.?|thanks for watching\.?|\.+|bye\.?)$/i.test(cleaned)) return "";
  return cleaned;
}
