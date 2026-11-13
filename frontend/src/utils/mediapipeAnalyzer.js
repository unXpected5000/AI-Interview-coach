import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// All inference runs in this browser tab. Only derived numbers ever leave this
// module; frames are never copied, stored, or uploaded.

// Runtime files are self-hosted from the installed package version (see
// build/mediapipeWasmPlugin.js), so the JS API and WASM always match.
export const MEDIAPIPE_WASM_PATH = "mediapipe/wasm";
// Google-hosted, Apache-2.0 model files (downloaded once, then browser-cached).
export const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
export const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export const SAMPLE_INTERVAL_MS = 200; // ~5 samples/second keeps CPU use modest
const POSE_EVERY_N_SAMPLES = 3; // pose is costlier; ~1.7 samples/second
const MAX_SEGMENT_SAMPLES = 9000; // 30 minutes at 5 Hz
const MAX_TIMELINE_POINTS = 60;
const MIN_SAMPLES_FOR_ESTIMATE = 15;
const HEAD_FACING_DEGREES = 15;
const GAZE_CENTER_THRESHOLD = 0.3;

const RAD_TO_DEG = 180 / Math.PI;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pct(values) {
  const average = mean(values);
  return average === null ? null : Math.round(average * 100);
}

/** Yaw/pitch/roll (degrees) from MediaPipe's column-major 4x4 facial transform. */
export function headPoseFromMatrix(data) {
  if (!data || data.length < 16) return null;
  const m = (row, column) => data[column * 4 + row];
  const yaw = Math.asin(Math.max(-1, Math.min(1, -m(2, 0)))) * RAD_TO_DEG;
  const pitch = Math.atan2(m(2, 1), m(2, 2)) * RAD_TO_DEG;
  const roll = Math.atan2(m(1, 0), m(0, 0)) * RAD_TO_DEG;
  if (![yaw, pitch, roll].every(Number.isFinite)) return null;
  return { yaw: yaw + 0, pitch: pitch + 0, roll: roll + 0 }; // normalize -0
}

/**
 * Approximate gaze direction from eye blendshapes. Returns null when the eyes
 * are closed or the blendshapes are missing. This is an estimate of whether the
 * eyes point roughly toward the camera, not reliable eye-contact measurement.
 */
export function gazeFromBlendshapes(categories) {
  if (!Array.isArray(categories) || !categories.length) return null;
  const score = Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
  const get = (name) => (Number.isFinite(score[name]) ? score[name] : null);
  const names = ["eyeLookInLeft", "eyeLookOutLeft", "eyeLookInRight", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight"];
  if (names.some((name) => get(name) === null)) return null;
  const blink = mean([get("eyeBlinkLeft") ?? 0, get("eyeBlinkRight") ?? 0]);
  if (blink > 0.5) return null;
  const horizontal = ((get("eyeLookOutLeft") - get("eyeLookInLeft")) + (get("eyeLookInRight") - get("eyeLookOutRight"))) / 2;
  const vertical = mean([get("eyeLookUpLeft"), get("eyeLookUpRight")]) - mean([get("eyeLookDownLeft"), get("eyeLookDownRight")]);
  return { horizontal, vertical };
}

/** Rough upright-shoulders estimate; null unless both shoulders are clearly visible. */
export function postureFromPose(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 13) return null;
  const nose = landmarks[0];
  const left = landmarks[11];
  const right = landmarks[12];
  const visible = (point) => point && (point.visibility ?? 1) >= 0.6 && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
  if (!visible(left) || !visible(right) || !nose) return null;
  const dx = Math.abs(left.x - right.x);
  if (dx < 0.12) return null; // shoulders too small/turned to judge
  const tiltDegrees = Math.atan2(Math.abs(left.y - right.y), dx) * RAD_TO_DEG;
  const shoulderMidY = (left.y + right.y) / 2;
  const headClearance = (shoulderMidY - nose.y) / dx; // relative to shoulder width
  return { upright: tiltDegrees <= 8 && headClearance >= 0.45, tiltDegrees };
}

/** Bucket samples into at most `maxPoints` timeline points of averaged 0-100 values. */
export function buildTimeline(samples, maxPoints = MAX_TIMELINE_POINTS) {
  if (!samples.length) return [];
  const duration = Math.max(samples[samples.length - 1].t, 1);
  const bucketSeconds = Math.max(2, Math.ceil(duration / maxPoints));
  const buckets = new Map();
  for (const sample of samples) {
    const key = Math.min(maxPoints - 1, Math.floor(sample.t / bucketSeconds));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(sample);
  }
  const field = (rows, name) => {
    const values = rows.map((row) => row[name]).filter((value) => value !== null && value !== undefined);
    const average = mean(values);
    if (average === null) return null;
    return name === "movement" ? Math.round(average) : Math.round(average * 100);
  };
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, rows]) => ({
      t: key * bucketSeconds,
      face: field(rows, "face"),
      centered: field(rows, "centered"),
      movement: field(rows, "movement"),
      gaze: field(rows, "gaze"),
      upright: field(rows, "upright"),
    }));
}

/** Coverage label for a signal: how many of the face samples support it. */
export function signalQuality(supported, total) {
  if (!supported || supported < MIN_SAMPLES_FOR_ESTIMATE) return "not_enough_data";
  if (total && supported / total < 0.5) return "low";
  return "ok";
}

export class MediaPipeAnalyzer {
  constructor({ sampleIntervalMs = SAMPLE_INTERVAL_MS, now = () => performance.now() } = {}) {
    this.faceLandmarker = null;
    this.poseLandmarker = null;
    this.sampleIntervalMs = sampleIntervalMs;
    this.now = now;
    this.isRunning = false;
    this.frameRequestId = null;
    this.lastVideoTime = -1;
    this.lastProcessedAt = 0;
    this.sampleCounter = 0;
    this.resetSegment();
  }

  async initialize({ withPose = true } = {}) {
    try {
      const base = `${import.meta.env?.BASE_URL ?? "/"}${MEDIAPIPE_WASM_PATH}`;
      const fileset = await FilesetResolver.forVisionTasks(base);
      for (const delegate of ["GPU", "CPU"]) {
        try {
          this.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          });
          break;
        } catch {
          // Fall back to CPU when GPU inference is unavailable.
        }
      }
      if (!this.faceLandmarker) return false;
      if (withPose) {
        try {
          this.poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        } catch {
          this.poseLandmarker = null; // Posture is reported as unavailable.
        }
      }
      return true;
    } catch (error) {
      console.error("Failed to initialize MediaPipe:", error);
      return false;
    }
  }

  get postureAvailable() {
    return Boolean(this.poseLandmarker);
  }

  start(videoElement, onMetricsUpdate) {
    if (!this.faceLandmarker || !videoElement || this.isRunning) return;
    this.isRunning = true;
    const processFrame = () => {
      if (!this.isRunning) return;
      const nowMs = this.now();
      const hidden = typeof document !== "undefined" && document.hidden;
      if (!hidden && videoElement.readyState >= 2 && this.lastVideoTime !== videoElement.currentTime && nowMs - this.lastProcessedAt >= this.sampleIntervalMs) {
        this.lastVideoTime = videoElement.currentTime;
        this.lastProcessedAt = nowMs;
        try {
          const face = this.faceLandmarker.detectForVideo(videoElement, nowMs);
          this.sampleCounter += 1;
          const pose = this.poseLandmarker && this.sampleCounter % POSE_EVERY_N_SAMPLES === 0
            ? this.poseLandmarker.detectForVideo(videoElement, nowMs)
            : undefined;
          this.processResults(face, pose, nowMs);
          onMetricsUpdate?.(this.metrics);
        } catch (err) {
          console.error("MediaPipe processing error:", err);
        }
      }
      this.frameRequestId = requestAnimationFrame(processFrame);
    };
    processFrame();
  }

  /** Stop sampling immediately but keep models loaded. */
  pause() {
    this.isRunning = false;
    if (this.frameRequestId !== null) cancelAnimationFrame(this.frameRequestId);
    this.frameRequestId = null;
  }

  /** Stop sampling and release model memory. */
  stop() {
    this.pause();
    this.faceLandmarker?.close?.();
    this.poseLandmarker?.close?.();
    this.faceLandmarker = null;
    this.poseLandmarker = null;
  }

  /** Start a new measurement window (one per interview answer). */
  resetSegment() {
    this.samples = [];
    this.segmentStart = null;
    this.previousNose = null;
    this.metrics = this.summarize();
  }

  processResults(faceResults, poseResults, nowMs = this.now()) {
    if (this.segmentStart === null) this.segmentStart = nowMs;
    const t = Math.max(0, (nowMs - this.segmentStart) / 1000);
    const landmarks = faceResults?.faceLandmarks?.[0];
    const sample = { t, face: 0, centered: 0, movement: null, gaze: null, upright: null, yaw: null, pitch: null };
    const nose = landmarks ? landmarks[1] ?? landmarks[0] : null;
    if (nose) {
      sample.face = 1;
      sample.centered = nose.x >= 0.3 && nose.x <= 0.7 && nose.y >= 0.15 && nose.y <= 0.85 ? 1 : 0;
      sample.movement = this.previousNose
        ? Math.min(100, Math.hypot(nose.x - this.previousNose.x, nose.y - this.previousNose.y) * 500)
        : 0;
      this.previousNose = { x: nose.x, y: nose.y };
      const pose = headPoseFromMatrix(faceResults?.facialTransformationMatrixes?.[0]?.data);
      if (pose) {
        sample.yaw = pose.yaw;
        sample.pitch = pose.pitch;
      }
      const gaze = gazeFromBlendshapes(faceResults?.faceBlendshapes?.[0]?.categories);
      if (gaze && pose) {
        const headFacing = Math.abs(pose.yaw) <= HEAD_FACING_DEGREES && Math.abs(pose.pitch) <= HEAD_FACING_DEGREES;
        const eyesCentered = Math.abs(gaze.horizontal) <= GAZE_CENTER_THRESHOLD && Math.abs(gaze.vertical) <= GAZE_CENTER_THRESHOLD;
        sample.gaze = headFacing && eyesCentered ? 1 : 0;
      }
    } else {
      this.previousNose = null;
    }
    const posture = poseResults ? postureFromPose(poseResults.landmarks?.[0]) : null;
    if (posture) sample.upright = posture.upright ? 1 : 0;
    this.samples.push(sample);
    if (this.samples.length > MAX_SEGMENT_SAMPLES) this.samples.shift();
    this.metrics = this.summarize();
    return this.metrics;
  }

  // Kept for compatibility with earlier callers/tests.
  updateMetrics() {
    this.metrics = this.summarize();
  }

  summarize() {
    const samples = this.samples ?? [];
    const faceSamples = samples.filter((sample) => sample.face === 1);
    const poseSamples = faceSamples.filter((sample) => sample.yaw !== null);
    const gazeSamples = samples.filter((sample) => sample.gaze !== null);
    const postureSamples = samples.filter((sample) => sample.upright !== null);
    const movementValues = faceSamples.map((sample) => sample.movement).filter((value) => value !== null);
    const faceVisibility = pct(samples.map((sample) => sample.face));
    const centered = pct(samples.map((sample) => sample.centered));
    const coachingSuggestions = [];
    if (samples.length >= 30 && faceVisibility !== null && faceVisibility < 60) {
      coachingSuggestions.push({ type: "warning", text: "Face detection was interrupted; check camera framing or lighting." });
    }
    if (samples.length >= 30 && centered !== null && centered < 60) {
      coachingSuggestions.push({ type: "warning", text: "Your face was often near the edge of the frame." });
    }
    const metrics = {
      face_visibility_pct: faceVisibility ?? 0,
      centered_frame_pct: centered ?? 0,
      head_movement_index: movementValues.length ? Math.round(mean(movementValues)) : 0,
      sample_count: samples.length,
      duration_seconds: samples.length ? Math.round(samples[samples.length - 1].t * 10) / 10 : 0,
      head_pose_samples: poseSamples.length,
      head_yaw_mean_deg: poseSamples.length ? Math.round(mean(poseSamples.map((sample) => sample.yaw)) * 10) / 10 : null,
      head_pitch_mean_deg: poseSamples.length ? Math.round(mean(poseSamples.map((sample) => sample.pitch)) * 10) / 10 : null,
      gaze_samples: gazeSamples.length,
      gaze_toward_camera_pct: pct(gazeSamples.map((sample) => sample.gaze)),
      posture_samples: postureSamples.length,
      posture_upright_pct: pct(postureSamples.map((sample) => sample.upright)),
      quality: {
        gaze: signalQuality(gazeSamples.length, faceSamples.length),
        head_pose: signalQuality(poseSamples.length, faceSamples.length),
        posture: signalQuality(postureSamples.length, samples.length),
      },
      timeline: buildTimeline(samples),
      coachingSuggestions: coachingSuggestions.slice(0, 2),
    };
    return metrics;
  }
}

/** Shape the derived metrics for the API; returns {} unless the user consented to saving. */
export function cameraMetricsPayload(metrics, { consent }) {
  if (!consent || !metrics || !(metrics.sample_count > 0)) return {};
  const keep = [
    "face_visibility_pct", "centered_frame_pct", "head_movement_index", "sample_count", "duration_seconds",
    "head_pose_samples", "head_yaw_mean_deg", "head_pitch_mean_deg", "gaze_samples", "gaze_toward_camera_pct",
    "posture_samples", "posture_upright_pct", "timeline",
  ];
  const payload = { consent: true };
  for (const key of keep) {
    if (metrics[key] !== null && metrics[key] !== undefined) payload[key] = metrics[key];
  }
  // Do not save estimates that lack enough supporting samples.
  if (metrics.quality?.gaze === "not_enough_data") delete payload.gaze_toward_camera_pct;
  if (metrics.quality?.posture === "not_enough_data") delete payload.posture_upright_pct;
  return payload;
}
