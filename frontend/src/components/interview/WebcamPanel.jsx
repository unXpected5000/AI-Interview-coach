import { useEffect, useState } from "react";
import { useWebcam } from "../../hooks/useWebcam.js";
import { useMediaPipe } from "../../hooks/useMediaPipe.js";
import { cameraMetricsPayload } from "../../utils/mediapipeAnalyzer.js";
import { recordConsent } from "../../api/accountApi.js";
import CameraSignalsPanel, { CameraConsentPrompt } from "./CameraSignalsPanel.jsx";

/**
 * Optional practice-mode camera. `segmentKey` starts a new measurement window
 * per question; `payloadRef.current()` returns the consented metrics to save.
 */
export function WebcamPanel({ segmentKey, payloadRef }) {
  const [cameraOn, setCameraOn] = useState(false);
  const [askingConsent, setAskingConsent] = useState(false);
  const [saveConsent, setSaveConsent] = useState(false);
  const { videoRef, error } = useWebcam(cameraOn);
  const { metrics, isReady, error: analysisError, postureAvailable, snapshot } = useMediaPipe(videoRef, cameraOn, { segmentKey });

  useEffect(() => {
    if (!payloadRef) return undefined;
    payloadRef.current = () => (cameraOn && isReady && !error ? cameraMetricsPayload(snapshot(), { consent: saveConsent }) : {});
    return () => { payloadRef.current = () => ({}); };
  });

  function chooseConsent(save) {
    setSaveConsent(save);
    setAskingConsent(false);
    setCameraOn(true);
    recordConsent("camera_processing", save ? "accepted" : "rejected").catch(() => {});
  }

  function turnOff() {
    setCameraOn(false);
    setSaveConsent(false);
  }

  if (cameraOn && error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
        <p className="font-bold">Camera unavailable</p>
        <p>{error}</p>
        <button className="mt-3 rounded-full border border-rose-300 px-3 py-1.5 text-xs font-bold" onClick={turnOff} type="button">Turn camera off</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-stone-950">Optional camera</h2>
        <button className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-bold" onClick={() => (cameraOn ? turnOff() : setAskingConsent(true))} type="button">{cameraOn ? "Turn camera off" : "Enable camera"}</button>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isReady ? "bg-teal-100 text-teal-700" : "bg-stone-200 text-stone-600"}`}>
          {!cameraOn ? "Off" : isReady ? (saveConsent ? "Local tracking · saving numbers" : "Local tracking · preview only") : analysisError ? "Preview only" : "Loading local model…"}
        </span>
      </div>
      {askingConsent ? <div className="mb-4"><CameraConsentPrompt onCancel={() => setAskingConsent(false)} onChoose={chooseConsent} /></div> : null}

      <div className="relative aspect-video overflow-hidden rounded-lg bg-stone-900">
        {!cameraOn ? <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-stone-300">Camera is off. Enable it only if you want local framing feedback.</div> : null}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Local webcam preview"
          className={`h-full w-full -scale-x-100 transform object-cover ${cameraOn ? "" : "hidden"}`}
        />
        {metrics.coachingSuggestions?.length ? (
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex flex-col gap-2">
            {metrics.coachingSuggestions.map((suggestion) => (
              <div className="self-start rounded-md bg-amber-500/80 px-3 py-1.5 text-xs font-bold text-amber-950 shadow-sm" key={suggestion.text}>{suggestion.text}</div>
            ))}
          </div>
        ) : null}
      </div>
      {cameraOn && isReady ? <div className="mt-4"><CameraSignalsPanel consent={saveConsent} metrics={metrics} postureAvailable={postureAvailable} /></div> : null}
      {analysisError ? <p className="mt-1 text-xs text-amber-700">{analysisError}</p> : null}
    </div>
  );
}
