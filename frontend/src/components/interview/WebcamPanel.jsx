import React from "react";
import { useWebcam } from "../../hooks/useWebcam.js";
import { useMediaPipe } from "../../hooks/useMediaPipe.js";

export function WebcamPanel({ onMetricsUpdate }) {
  const [cameraOn, setCameraOn] = React.useState(false);
  const { videoRef, error } = useWebcam(cameraOn);
  const { metrics, isReady, error: analysisError } = useMediaPipe(videoRef, cameraOn);

  React.useEffect(() => {
    if (onMetricsUpdate) {
      onMetricsUpdate(cameraOn && isReady && metrics.sample_count > 0 ? metrics : {});
    }
  }, [cameraOn, isReady, metrics, onMetricsUpdate]);

  if (cameraOn && error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
        <p className="font-bold">Webcam Error</p>
        <p>{error}</p>
        <button className="mt-3 rounded-full border border-rose-300 px-3 py-1.5 text-xs font-bold" onClick={() => setCameraOn(false)} type="button">Turn camera off</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-stone-950">Optional camera</h2>
        <button className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-bold" onClick={() => setCameraOn((enabled) => !enabled)} type="button">{cameraOn ? "Turn camera off" : "Enable camera"}</button>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isReady ? 'bg-teal-100 text-teal-700' : 'bg-stone-200 text-stone-600'}`}>
          {!cameraOn ? "Off" : isReady ? "Local tracking active" : analysisError ? "Preview only" : "Loading local model…"}
        </span>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-lg bg-stone-900">
        {!cameraOn ? <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-stone-300">Camera is off. Enable it only if you want local framing feedback.</div> : null}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Local webcam preview"
          className={`h-full w-full object-cover transform -scale-x-100 ${cameraOn ? "" : "hidden"}`}
        />
        
        {metrics.coachingSuggestions && metrics.coachingSuggestions.length > 0 && (
          <div className="absolute top-4 left-4 right-4 flex flex-col gap-2 pointer-events-none z-10">
            {metrics.coachingSuggestions.map((suggestion, idx) => (
              <div 
                key={idx} 
                className={`self-start rounded-md px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur-md ${
                  suggestion.type === 'warning' 
                    ? 'bg-amber-500/80 text-amber-950' 
                    : 'bg-teal-500/80 text-teal-950'
                }`}
              >
                {suggestion.text}
              </div>
            ))}
          </div>
        )}

        {cameraOn && isReady ? <div className="absolute bottom-0 left-0 right-0 bg-stone-950/80 p-3 text-white backdrop-blur-sm flex flex-wrap gap-4">
          {[["Face visible", `${metrics.face_visibility_pct}%`], ["Centered", `${metrics.centered_frame_pct}%`], ["Movement index", metrics.head_movement_index]].map(([label, value]) => <div className="flex flex-col" key={label}><span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">{label}</span><span className="font-mono text-sm font-bold">{value}</span></div>)}
        </div> : null}
      </div>
      <p className="mt-3 text-xs text-stone-500">Camera frames stay on this device. These approximate tracking values describe framing only, not confidence, emotion, or performance.</p>
      {analysisError ? <p className="mt-1 text-xs text-amber-700">{analysisError}</p> : null}
    </div>
  );
}
