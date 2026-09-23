import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export class MediaPipeAnalyzer {
  constructor() {
    this.faceLandmarker = null;
    this.isRunning = false;
    this.lastVideoTime = -1;
    this.metrics = {
      eyeContactPercentage: 0,
      headMovementScore: 0,
      smileFrequency: 0
    };
    this.history = {
      eyeContact: [],
      smile: [],
      noseX: [],
      noseY: []
    };
  }

  async initialize() {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      return true;
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
      if (this.lastVideoTime !== videoElement.currentTime) {
        this.lastVideoTime = videoElement.currentTime;
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
      
      requestAnimationFrame(processFrame);
    };
    
    processFrame();
  }

  stop() {
    this.isRunning = false;
  }

  processResults(results) {
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      this.history.eyeContact.push(-1); // Use -1 for no face detected
      return;
    }
    
    const blendshapes = results.faceBlendshapes[0]?.categories;
    if (blendshapes) {
      const findScore = (name) => {
        const shape = blendshapes.find(b => b.categoryName === name);
        return shape ? shape.score : 0;
      };

      const smileLeft = findScore('mouthSmileLeft');
      const smileRight = findScore('mouthSmileRight');
      const smileScore = (smileLeft + smileRight) / 2;
      this.history.smile.push(smileScore > 0.5 ? 1 : 0);

      const lookUp = findScore('eyeLookUpLeft') + findScore('eyeLookUpRight');
      const lookDown = findScore('eyeLookDownLeft') + findScore('eyeLookDownRight');
      const lookLeft = findScore('eyeLookOutLeft') + findScore('eyeLookInRight');
      const lookRight = findScore('eyeLookInLeft') + findScore('eyeLookOutRight');
      
      const isLookingAway = lookUp > 0.6 || lookDown > 0.6 || lookLeft > 0.6 || lookRight > 0.6;
      this.history.eyeContact.push(isLookingAway ? 0 : 1);
    }
    
    const nose = results.faceLandmarks[0][1]; // Tip of the nose
    this.history.noseX.push(nose.x);
    this.history.noseY.push(nose.y);

    const MAX_HISTORY = 300; 
    if (this.history.eyeContact.length > MAX_HISTORY) this.history.eyeContact.shift();
    if (this.history.smile.length > MAX_HISTORY) this.history.smile.shift();
    if (this.history.noseX.length > MAX_HISTORY) this.history.noseX.shift();
    if (this.history.noseY.length > MAX_HISTORY) this.history.noseY.shift();
    
    this.updateMetrics();
  }

  updateMetrics() {
    const arrAverage = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    let headMovementScore = 0;
    let avgX = 0;
    let avgY = 0;
    if (this.history.noseX.length > 10) {
      avgX = arrAverage(this.history.noseX);
      avgY = arrAverage(this.history.noseY);
      const varX = this.history.noseX.reduce((acc, val) => acc + Math.pow(val - avgX, 2), 0) / this.history.noseX.length;
      const varY = this.history.noseY.reduce((acc, val) => acc + Math.pow(val - avgY, 2), 0) / this.history.noseY.length;
      headMovementScore = Math.round(Math.sqrt(varX + varY) * 10000); 
    }
    
    const validEyeContact = this.history.eyeContact.filter(v => v !== -1);
    const eyeContactPercentage = Math.round(arrAverage(validEyeContact) * 100);
    const smileFrequency = Math.round(arrAverage(this.history.smile) * 100);

    const coachingSuggestions = [];
    const faceVisible = this.history.eyeContact.length > 0 && this.history.eyeContact[this.history.eyeContact.length - 1] !== -1;
    
    if (!faceVisible && this.history.eyeContact.length > 0) {
      coachingSuggestions.push({ type: 'warning', text: "Face not visible in camera" });
    } else {
      // Prioritize suggestions
      if (eyeContactPercentage < 50) {
        coachingSuggestions.push({ type: 'warning', text: "Maintain eye contact with camera" });
      } else if (eyeContactPercentage > 85) {
        coachingSuggestions.push({ type: 'positive', text: "Great eye contact" });
      }

      if (headMovementScore > 500) {
        coachingSuggestions.push({ type: 'warning', text: "Reduce excessive head movement" });
      }

      const isOffCenter = Math.abs(avgX - 0.5) > 0.15 || Math.abs(avgY - 0.5) > 0.15;
      if (isOffCenter) {
        coachingSuggestions.push({ type: 'warning', text: "Center yourself in the frame" });
      } else if (headMovementScore <= 200 && headMovementScore > 0 && coachingSuggestions.length < 2) {
        coachingSuggestions.push({ type: 'positive', text: "Good stable posture" });
      }
    }

    this.metrics = {
      eyeContactPercentage: eyeContactPercentage,
      headMovementScore: headMovementScore,
      smileFrequency: smileFrequency,
      coachingSuggestions: coachingSuggestions.slice(0, 2)
    };
  }
}
