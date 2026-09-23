import React from "react";
import { useWebcam } from "../../hooks/useWebcam.js";
import { useMediaPipe } from "../../hooks/useMediaPipe.js";

export function WebcamPanel({ onMetricsUpdate }) {
  const { videoRef, error } = useWebcam();
  const { metrics, isReady } = useMediaPipe(videoRef);

  React.useEffect(() => {
    if (onMetricsUpdate) {
      onMetricsUpdate(metrics);
    }
  }, [metrics, onMetricsUpdate]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
        <p className="font-bold">Webcam Error</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-stone-950">Live Camera</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isReady ? 'bg-teal-100 text-teal-700' : 'bg-stone-200 text-stone-600'}`}>
          {isReady ? "Analysis Active" : "Loading Model..."}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-stone-900 aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover transform -scale-x-100"
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

        <div className="absolute bottom-0 left-0 right-0 bg-stone-950/80 p-3 text-white backdrop-blur-sm flex flex-wrap gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Eye Contact</span>
            <span className="font-mono text-sm font-bold">{metrics.eyeContactPercentage}%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Smile</span>
            <span className="font-mono text-sm font-bold">{metrics.smileFrequency}%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Head Mvmt</span>
            <span className="font-mono text-sm font-bold">{metrics.headMovementScore}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
