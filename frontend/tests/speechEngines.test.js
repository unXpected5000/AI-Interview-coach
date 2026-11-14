import test from "node:test";
import assert from "node:assert/strict";

import { SpeechSegmenter, SAMPLE_RATE, cleanTranscript, resampleTo16k } from "../src/speech/speechSegmenter.js";
import { normalizeForSpeech, postProcessPhonemes, splitIntoSentences, splitOnPunctuation, styleOffset } from "../src/speech/kokoroText.js";
import { mouthShapeFromSpectrum, smoothMouth } from "../src/speech/lipSync.js";
import { blendshapeWeights, blinkAmount, gazeAt, headMotion } from "../src/components/interview/avatarBehavior.js";
import { readSpeechEnginePreference } from "../src/speech/liveTranscriber.js";
import { spokenQuestion } from "../src/utils/liveCall.js";

function tone(seconds, amplitude) {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin(index / 8) * amplitude;
  return samples;
}

function feed(segmenter, audio) {
  const events = [];
  for (let offset = 0; offset < audio.length; offset += 1600) events.push(...segmenter.push(audio.subarray(offset, offset + 1600)));
  return events;
}

test("segmenter finds a phrase between pauses and keeps its audio", () => {
  const segmenter = new SpeechSegmenter();
  const events = feed(segmenter, tone(0.5, 0.001));
  assert.equal(events.length, 0, "background noise is not speech");
  const speech = feed(segmenter, tone(1.2, 0.3));
  assert.ok(speech.some((event) => event.type === "speech-start"));
  assert.ok(segmenter.openPhrase(), "an open phrase is available for live preview");
  const ended = feed(segmenter, tone(1.0, 0.001));
  const phrase = ended.find((event) => event.type === "phrase-end");
  assert.ok(phrase);
  const seconds = (phrase.end - phrase.start) / SAMPLE_RATE;
  assert.ok(seconds > 1.1 && seconds < 2.2, `phrase length ${seconds}s`);
  assert.equal(segmenter.slice(phrase.start, phrase.end).length, phrase.end - phrase.start);
  assert.equal(segmenter.openPhrase(), null);
});

test("long monologues are cut into bounded phrases and flush closes the tail", () => {
  const segmenter = new SpeechSegmenter({ maxPhraseMs: 3000 });
  const events = feed(segmenter, tone(7, 0.3));
  assert.ok(events.filter((event) => event.type === "phrase-end").length >= 2);
  assert.ok(segmenter.flush());
  assert.equal(segmenter.flush(), null);
});

test("resampling and transcript cleanup", () => {
  assert.equal(resampleTo16k(new Float32Array(48000), 48000).length, 16000);
  assert.equal(cleanTranscript("You"), "", "known silence hallucination is dropped");
  assert.equal(cleanTranscript(" [Music] I led the team "), "I led the team");
});

test("Kokoro text preparation", () => {
  assert.match(normalizeForSpeech("It cost $5.50 in 2024."), /5 dollars and 50 cents in 20 24/);
  assert.match(normalizeForSpeech("Dr. Smith"), /Doctor Smith/);
  assert.deepEqual(splitOnPunctuation("Hi, there.").map((part) => part.match), [false, true, false, true]);
  assert.equal(postProcessPhonemes("rˈɛd"), "ɹˈɛd");
  assert.equal(styleOffset(1), 0);
  assert.equal(styleOffset(5000), 256 * 509);
  const sentences = splitIntoSentences("Let's start with you. Could you walk me through your background? Great!");
  assert.equal(sentences.length, 3);
  assert.ok(splitIntoSentences("word, ".repeat(100)).every((sentence) => sentence.length <= 220));
});

test("lip-sync shapes respond to loudness and spectrum", () => {
  const silent = mouthShapeFromSpectrum(new Uint8Array(512));
  assert.equal(silent.open, 0);
  const loudLow = new Uint8Array(512);
  for (let index = 0; index < 20; index += 1) loudLow[index] = 250;
  const vowel = mouthShapeFromSpectrum(loudLow, 24000);
  assert.ok(vowel.open > 0 && vowel.round > vowel.wide, "dark sounds round the lips");
  const bright = new Uint8Array(512);
  for (let index = 100; index < 250; index += 1) bright[index] = 230;
  assert.ok(mouthShapeFromSpectrum(bright, 24000).wide > 0.3, "bright sounds widen the lips");
  const smoothed = smoothMouth({ open: 0 }, { level: 1, open: 1, wide: 0, round: 0 });
  assert.ok(smoothed.open > 0 && smoothed.open < 1);
});

test("avatar behaviour: blinks are brief, gaze and head follow state", () => {
  let closedFrames = 0;
  for (let t = 0; t < 60; t += 0.033) if (blinkAmount(t) > 0.5) closedFrames += 1;
  const closedSeconds = closedFrames * 0.033;
  assert.ok(closedSeconds > 0.5 && closedSeconds < 4, `eyes closed ${closedSeconds}s per minute`);
  assert.ok(gazeAt(10, "thinking").y > 0.2, "thinking looks up and away");
  assert.ok(Math.abs(gazeAt(10, "listening").x) < 0.2, "listening keeps eye contact");
  assert.ok(headMotion(5, "listening").roll > 0.03, "listening tilts the head");
  assert.deepEqual(headMotion(5, "speaking", 1, true), { pitch: 0, yaw: 0, roll: 0 });
  const weights = blendshapeWeights({ mouth: { open: 1, wide: 0, round: 0 }, blink: 1, gaze: { x: 0, y: 0 }, expression: { smile: 0.5 } });
  assert.ok(weights.jawOpen > 0.5 && weights.eyeBlinkLeft === 1 && weights.viseme_aa > 0.5 && weights.mouthSmileLeft > 0.2);
});

test("spoken questions use the transition and greet on the first question", () => {
  const first = spokenQuestion({ question: "Could you walk me through your background?", transition: "To begin," }, { first: true, turn: 1 });
  assert.match(first, /^Hi, thanks for joining\..* To begin, could you walk me through/);
  const later = spokenQuestion({ question: "Tell me about AeroBrick.", transition: "Let's talk about your work." }, { first: false, turn: 2 });
  assert.equal(later, "Let's talk about your work. Tell me about AeroBrick.");
  const skipped = spokenQuestion({ question: "Q?", transition: "Next," }, { previousStatus: "skipped", turn: 3 });
  assert.match(skipped, /^No problem\. Next, q\?/);
  assert.match(spokenQuestion({ question: "Plain?" }, { turn: 2 }), /Plain\?$/);
});

test("speech engine preference defaults to auto", () => {
  assert.equal(readSpeechEnginePreference({ getItem: () => null }), "auto");
  assert.equal(readSpeechEnginePreference({ getItem: () => "local" }), "local");
  assert.equal(readSpeechEnginePreference({ getItem: () => { throw new Error("blocked"); } }), "auto");
});
