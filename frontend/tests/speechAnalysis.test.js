import assert from "node:assert/strict";
import test from "node:test";

import { buildSpeechAnalysis } from "../src/utils/speechAnalysis.js";

test("speech analysis counts words and filler phrases from the transcript", () => {
  const result = buildSpeechAnalysis("Um, this is basically a clear answer.", 10, [1, 5, 9]);
  assert.equal(result.word_count, 7);
  assert.equal(result.filler_count, 2);
  assert.equal(result.words_per_minute, 42);
  assert.equal(result.pause_count, 2);
  assert.deepEqual(result.result_timestamps, [1, 5, 9]);
});

test("speech analysis safely handles empty or missing input", () => {
  const result = buildSpeechAnalysis("");
  assert.equal(result.word_count, 0);
  assert.equal(result.words_per_minute, 0);
  assert.equal(result.pause_count, 0);
});
