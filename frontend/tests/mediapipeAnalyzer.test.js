import test from "node:test";
import assert from "node:assert/strict";

import { MediaPipeAnalyzer } from "../src/utils/mediapipeAnalyzer.js";

test("camera signals describe face visibility and framing without emotion labels", () => {
  const analyzer = new MediaPipeAnalyzer();
  const centeredFace = [{ x: 0.5, y: 0.5 }];
  const edgeFace = [{ x: 0.95, y: 0.5 }];
  analyzer.processResults({ faceLandmarks: [centeredFace] });
  analyzer.processResults({ faceLandmarks: [edgeFace] });
  analyzer.processResults({ faceLandmarks: [] });

  assert.equal(analyzer.metrics.face_visibility_pct, 67);
  assert.equal(analyzer.metrics.centered_frame_pct, 33);
  assert.equal(analyzer.metrics.sample_count, 3);
  assert.equal("smileFrequency" in analyzer.metrics, false);
  assert.equal("eyeContactPercentage" in analyzer.metrics, false);
});
