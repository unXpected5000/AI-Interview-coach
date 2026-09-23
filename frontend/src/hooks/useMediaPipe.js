import { useState, useEffect, useRef } from "react";
import { MediaPipeAnalyzer } from "../utils/mediapipeAnalyzer.js";

export function useMediaPipe(videoRef, isActive = true) {
  const [metrics, setMetrics] = useState({
    eyeContactPercentage: 0,
    headMovementScore: 0,
    smileFrequency: 0,
    coachingSuggestions: [],
  });
  const [isReady, setIsReady] = useState(false);
  const analyzerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      const analyzer = new MediaPipeAnalyzer();
      analyzerRef.current = analyzer;
      const success = await analyzer.initialize();
      if (success && isMounted) {
        setIsReady(true);
      }
    };
    
    init();

    return () => {
      isMounted = false;
      if (analyzerRef.current) {
        analyzerRef.current.stop();
      }
    };
  }, []);

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

  return { metrics, isReady };
}
