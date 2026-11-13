import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MediaPipeAnalyzer,
  buildTimeline,
  cameraMetricsPayload,
  gazeFromBlendshapes,
  headPoseFromMatrix,
  postureFromPose,
  signalQuality,
} from "../src/utils/mediapipeAnalyzer.js";
import { seriesSegments } from "../src/utils/cameraChart.js";
import { createMediaPipeWasmPlugin, MEDIAPIPE_WASM_FILES } from "../build/mediapipeWasmPlugin.js";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function yawMatrix(degrees) {
  const r = (degrees * Math.PI) / 180;
  // Column-major rotation about the y axis.
  return [Math.cos(r), 0, -Math.sin(r), 0, 0, 1, 0, 0, Math.sin(r), 0, Math.cos(r), 0, 0, 0, 0, 1];
}

const lookingAhead = [
  "eyeLookInLeft", "eyeLookOutLeft", "eyeLookInRight", "eyeLookOutRight",
  "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight",
].map((categoryName) => ({ categoryName, score: 0.05 }));

function faceResult({ x = 0.5, yaw = 0, blendshapes = lookingAhead } = {}) {
  return {
    faceLandmarks: [[{ x, y: 0.5 }, { x, y: 0.5 }]],
    facialTransformationMatrixes: [{ data: yaw ? yawMatrix(yaw) : IDENTITY }],
    faceBlendshapes: [{ categories: blendshapes }],
  };
}

test("head pose is derived from the facial transformation matrix", () => {
  assert.deepEqual(headPoseFromMatrix(IDENTITY), { yaw: 0, pitch: 0, roll: 0 });
  assert.ok(Math.abs(headPoseFromMatrix(yawMatrix(30)).yaw - 30) < 0.01);
  assert.equal(headPoseFromMatrix([1, 2]), null);
});

test("gaze is unavailable for closed eyes or missing blendshapes", () => {
  assert.equal(gazeFromBlendshapes([]), null);
  assert.equal(gazeFromBlendshapes([...lookingAhead, { categoryName: "eyeBlinkLeft", score: 0.9 }, { categoryName: "eyeBlinkRight", score: 0.9 }]), null);
  const sideways = lookingAhead.map((item) => (item.categoryName === "eyeLookOutLeft" || item.categoryName === "eyeLookInRight" ? { ...item, score: 0.9 } : item));
  assert.ok(gazeFromBlendshapes(sideways).horizontal > 0.5);
});

test("posture needs both shoulders clearly visible", () => {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  landmarks[0] = { x: 0.5, y: 0.3, visibility: 0.9 };
  landmarks[11] = { x: 0.65, y: 0.6, visibility: 0.9 };
  landmarks[12] = { x: 0.35, y: 0.6, visibility: 0.9 };
  assert.equal(postureFromPose(landmarks).upright, true);
  landmarks[12] = { ...landmarks[12], visibility: 0.2 };
  assert.equal(postureFromPose(landmarks), null);
  assert.equal(postureFromPose(undefined), null);
});

test("analyzer reports gaze/posture as not enough data rather than inventing values", () => {
  const analyzer = new MediaPipeAnalyzer({ now: () => 0 });
  for (let index = 0; index < 5; index += 1) analyzer.processResults(faceResult(), undefined, index * 200);
  assert.equal(analyzer.metrics.face_visibility_pct, 100);
  assert.equal(analyzer.metrics.quality.gaze, "not_enough_data");
  assert.equal(analyzer.metrics.posture_samples, 0);
  assert.equal(analyzer.metrics.posture_upright_pct, null);
  const payload = cameraMetricsPayload(analyzer.metrics, { consent: true });
  assert.equal("gaze_toward_camera_pct" in payload, false);
  assert.equal("posture_upright_pct" in payload, false);
  assert.equal("eyeContactPercentage" in analyzer.metrics, false);
});

test("analyzer estimates gaze toward camera only when head and eyes face forward", () => {
  const analyzer = new MediaPipeAnalyzer();
  for (let index = 0; index < 20; index += 1) analyzer.processResults(faceResult(), undefined, index * 200);
  for (let index = 20; index < 40; index += 1) analyzer.processResults(faceResult({ yaw: 35 }), undefined, index * 200);
  assert.equal(analyzer.metrics.gaze_samples, 40);
  assert.equal(analyzer.metrics.gaze_toward_camera_pct, 50);
  assert.equal(analyzer.metrics.quality.gaze, "ok");
  assert.ok(analyzer.metrics.timeline.length >= 2);
  assert.ok(analyzer.metrics.timeline.every((point) => point.upright === null));
});

test("each answer starts a fresh measurement window", () => {
  const analyzer = new MediaPipeAnalyzer();
  analyzer.processResults({ faceLandmarks: [] }, undefined, 0);
  analyzer.resetSegment();
  assert.equal(analyzer.metrics.sample_count, 0);
  analyzer.processResults(faceResult(), undefined, 1000);
  assert.equal(analyzer.metrics.face_visibility_pct, 100);
});

test("nothing is saved without consent and payload contains only derived numbers", () => {
  const analyzer = new MediaPipeAnalyzer();
  analyzer.processResults(faceResult(), undefined, 0);
  assert.deepEqual(cameraMetricsPayload(analyzer.metrics, { consent: false }), {});
  const payload = cameraMetricsPayload(analyzer.metrics, { consent: true });
  assert.equal(payload.consent, true);
  assert.equal("coachingSuggestions" in payload, false);
  assert.equal("quality" in payload, false);
});

test("timeline is bounded and keeps missing values as gaps", () => {
  const samples = Array.from({ length: 2000 }, (_, index) => ({ t: index * 0.2, face: 1, centered: 1, movement: 3, gaze: index % 2 ? null : 1, upright: null }));
  const timeline = buildTimeline(samples);
  assert.ok(timeline.length <= 60);
  assert.ok(timeline.every((point) => point.upright === null));
  const segments = seriesSegments([{ t: 0, gaze: 10 }, { t: 1, gaze: null }, { t: 2, gaze: 20 }, { t: 3, gaze: 30 }], "gaze", { width: 100, height: 100, maxT: 3 });
  assert.equal(segments.length, 2);
  assert.equal(signalQuality(3, 100), "not_enough_data");
  assert.equal(signalQuality(20, 100), "low");
});

test("MediaPipe WASM is emitted from the installed package, not a CDN", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mp-wasm-"));
  for (const name of MEDIAPIPE_WASM_FILES) writeFileSync(path.join(directory, name), name);
  const emitted = [];
  createMediaPipeWasmPlugin(directory).generateBundle.call({ emitFile: (file) => emitted.push(file.fileName) });
  assert.deepEqual(emitted.sort(), MEDIAPIPE_WASM_FILES.map((name) => `mediapipe/wasm/${name}`).sort());
});
