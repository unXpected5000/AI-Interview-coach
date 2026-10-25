import { useState, useEffect, useRef } from "react";
import { MediaPipeAnalyzer } from "../utils/mediapipeAnalyzer.js";

export function useMediaPipe(videoRef, isActive = true) {
  const [metrics, setMetrics] = useState({
    face_visibility_pct: 0,
    centered_frame_pct: 0,
    head_movement_index: 0,
    sample_count: 0,
    coachingSuggestions: [],
  });
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const analyzerRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      setIsReady(false);
      setError("");
      return undefined;
    }
    let isMounted = true;
    const init = async () => {
      setError("");
      const analyzer = new MediaPipeAnalyzer();
      analyzerRef.current = analyzer;
      const success = await analyzer.initialize();
      if (success && isMounted) {
        setIsReady(true);
      } else if (isMounted) {
        setError("Local face tracking could not load. Camera preview remains available.");
      } else if (!isMounted) {
        analyzer.stop();
      }
    };
    
    init();

    return () => {
      isMounted = false;
      if (analyzerRef.current) {
        analyzerRef.current.stop();
      }
      analyzerRef.current = null;
      setIsReady(false);
    };
  }, [isActive]);

  useEffect(() => {
    if (isReady && isActive && videoRef.current && analyzerRef.current) {
      const video = videoRef.current;
      const handlePlay = () => {
        analyzerRef.current.start(video, (newMetrics) => {
          setMetrics(newMetrics);
        });
      };
      
      video.addEventListener('loadeddata', handlePlay);
      if (video.readyState >= 2) {
        handlePlay();
      }

      return () => {
        if (analyzerRef.current) analyzerRef.current.stop();
        video.removeEventListener('loadeddata', handlePlay);
      };
    } else if (!isActive && analyzerRef.current) {
      analyzerRef.current.stop();
    }
  }, [isReady, isActive, videoRef]);

  return { metrics, isReady, error };
}
