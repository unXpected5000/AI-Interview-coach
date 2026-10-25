import { useState, useEffect, useRef } from "react";

export function useWebcam(enabled = true) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let active = true;
    let activeStream = null;

    if (!enabled) {
      setStream(null);
      setError(null);
      return undefined;
    }

    async function setupCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires a secure page and browser camera support.");
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError(err.message || "Failed to access webcam");
      }
    }

    setupCamera();

    return () => {
      active = false;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled]);

  return { videoRef, stream, error };
}
