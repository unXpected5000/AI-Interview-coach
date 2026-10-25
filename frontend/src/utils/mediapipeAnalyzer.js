import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export class MediaPipeAnalyzer {
  constructor() {
    this.faceLandmarker = null;
    this.isRunning = false;
    this.lastVideoTime = -1;
    this.lastProcessedAt = 0;
    this.frameRequestId = null;
    this.metrics = {
      face_visibility_pct: 0,
      centered_frame_pct: 0,
      head_movement_index: 0,
      sample_count: 0,
    };
    this.history = { faceVisible: [], centered: [], movement: [] };
    this.previousNose = null;
  }

  async initialize() {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      const modelAssetPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
      for (const delegate of ["GPU", "CPU"]) {
        try {
          this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: "VIDEO",
            numFaces: 1,
          });
          return true;
        } catch {
          // Fall back to CPU when GPU inference is unavailable.
        }
      }
      return false;
    } catch (error) {
      console.error("Failed to initialize MediaPipe:", error);
      return false;
    }
  }

  start(videoElement, onMetricsUpdate) {
    if (!this.faceLandmarker || !videoElement) return;
    this.isRunning = true;
    
    const processFrame = () => {
      if (!this.isRunning) return;
      
      let startTimeMs = performance.now();
      if (this.lastVideoTime !== videoElement.currentTime && startTimeMs - this.lastProcessedAt >= 80) {
        this.lastVideoTime = videoElement.currentTime;
        this.lastProcessedAt = startTimeMs;
        try {
          const results = this.faceLandmarker.detectForVideo(videoElement, startTimeMs);
          this.processResults(results);
          if (onMetricsUpdate) {
            onMetricsUpdate({ ...this.metrics });
          }
        } catch (err) {
          console.error("MediaPipe processing error:", err);
        }
      }
      
      this.frameRequestId = requestAnimationFrame(processFrame);
    };
    
    processFrame();
  }

  stop() {
    this.isRunning = false;
    if (this.frameRequestId !== null) window.cancelAnimationFrame(this.frameRequestId);
    this.frameRequestId = null;
    this.faceLandmarker?.close?.();
    this.faceLandmarker = null;
  }

  processResults(results) {
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      this.history.faceVisible.push(0);
      this.history.centered.push(0);
      this.history.movement.push(0);
      this.previousNose = null;
      this.trimHistory();
      this.updateMetrics();
      return;
    }
    const nose = results.faceLandmarks[0][1] ?? results.faceLandmarks[0][0];
    if (!nose) return;
    this.history.faceVisible.push(1);
    this.history.centered.push(nose.x >= 0.3 && nose.x <= 0.7 && nose.y >= 0.15 && nose.y <= 0.85 ? 1 : 0);
    const movement = this.previousNose
      ? Math.min(100, Math.hypot(nose.x - this.previousNose.x, nose.y - this.previousNose.y) * 500)
      : 0;
    this.history.movement.push(movement);
    this.previousNose = { x: nose.x, y: nose.y };
    this.trimHistory();
    this.updateMetrics();
  }

  trimHistory() {
    const maxHistory = 300;
    for (const samples of Object.values(this.history)) {
      if (samples.length > maxHistory) samples.shift();
    }
  }

  updateMetrics() {
    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const coachingSuggestions = [];
    const faceVisibility = Math.round(average(this.history.faceVisible) * 100);
    const centeredFrame = Math.round(average(this.history.centered) * 100);
    const movementIndex = Math.round(average(this.history.movement));
    if (this.history.faceVisible.length >= 30 && faceVisibility < 60) {
      coachingSuggestions.push({ type: "warning", text: "Face detection was interrupted; check camera framing or lighting." });
    }
    if (this.history.centered.length >= 30 && centeredFrame < 60) {
      coachingSuggestions.push({ type: "warning", text: "Your face was often near the edge of the frame." });
    }
    this.metrics = {
      face_visibility_pct: faceVisibility,
      centered_frame_pct: centeredFrame,
      head_movement_index: movementIndex,
      sample_count: this.history.faceVisible.length,
      coachingSuggestions: coachingSuggestions.slice(0, 2),
    };
  }
}
