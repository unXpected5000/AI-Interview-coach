import { useEffect, useRef, useState } from "react";
import { MediaPipeAnalyzer } from "../utils/mediapipeAnalyzer.js";

const UI_UPDATE_INTERVAL_MS = 500;

/**
 * Runs local face/pose analysis while `isActive`. `segmentKey` (for example the
 * current question id) starts a fresh measurement window when it changes.
 * Inference stops as soon as `isActive` turns false or the component unmounts.
 */
export function useMediaPipe(videoRef, isActive = true, { segmentKey = null, withPose = true } = {}) {
  const [metrics, setMetrics] = useState(() => new MediaPipeAnalyzer().metrics);
  const [isReady, setIsReady] = useState(false);
  const [postureAvailable, setPostureAvailable] = useState(false);
  const [error, setError] = useState("");
  const analyzerRef = useRef(null);
  const lastUiUpdateRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      setIsReady(false);
      setError("");
      return undefined;
    }
    let isMounted = true;
    const analyzer = new MediaPipeAnalyzer();
    analyzerRef.current = analyzer;
    setError("");
    analyzer.initialize({ withPose }).then((success) => {
      if (!isMounted) {
        analyzer.stop();
        return;
      }
      if (success) {
        setIsReady(true);
        setPostureAvailable(analyzer.postureAvailable);
      } else {
        setError("Local face tracking could not load. Camera preview remains available.");
      }
    });

    return () => {
      isMounted = false;
      analyzer.stop();
      if (analyzerRef.current === analyzer) analyzerRef.current = null;
      setIsReady(false);
    };
  }, [isActive, withPose]);

  useEffect(() => {
    const analyzer = analyzerRef.current;
    const video = videoRef.current;
    if (!isReady || !isActive || !video || !analyzer) return undefined;
    const handlePlay = () => {
      analyzer.start(video, (next) => {
        const now = performance.now();
        if (now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
          lastUiUpdateRef.current = now;
          setMetrics(next);
        }
      });
    };
    video.addEventListener("loadeddata", handlePlay);
    if (video.readyState >= 2) handlePlay();
    return () => {
      analyzer.pause();
      video.removeEventListener("loadeddata", handlePlay);
    };
  }, [isReady, isActive, videoRef]);

  useEffect(() => {
    const analyzer = analyzerRef.current;
    if (!analyzer) return;
    analyzer.resetSegment();
    setMetrics(analyzer.metrics);
  }, [segmentKey, isReady]);

  // Latest full-resolution snapshot (UI state is throttled).
  const snapshot = () => analyzerRef.current?.metrics ?? metrics;

  return { metrics, isReady, error, postureAvailable, snapshot };
}
