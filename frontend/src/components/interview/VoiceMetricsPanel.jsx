import React from "react";

function formatSeconds(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VoiceMetricsPanel({ analysis, isRecording, liveDuration }) {
  if (!analysis && !isRecording) {
    return null;
  }

  const wpm = analysis ? Math.round(analysis.words_per_minute || 0) : 0;
  const fillers = analysis ? analysis.filler_count : 0;
  const duration = isRecording && liveDuration !== undefined ? liveDuration : (analysis ? analysis.duration_seconds : 0);

  let wpmColor = "text-stone-700";
  if (wpm > 160) wpmColor = "text-amber-600";
  else if (wpm >= 110) wpmColor = "text-teal-600";

  return (
    <div className="mt-4 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-bold text-stone-950">Voice Metrics</h3>
        {isRecording && (
          <span className="animate-pulse rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
            Live
          </span>
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-stone-100 bg-stone-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Speaking Time</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatSeconds(duration)}</p>
        </div>
        
        <div className="rounded-lg border border-stone-100 bg-stone-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Pace (WPM)</p>
          <p className={`mt-2 text-2xl font-bold ${wpmColor}`}>{wpm}</p>
        </div>

        <div className="rounded-lg border border-stone-100 bg-stone-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Fillers</p>
          <p className={`mt-2 text-2xl font-bold ${fillers > 5 ? "text-amber-600" : "text-stone-900"}`}>{fillers}</p>
        </div>
      </div>
      
      {analysis && analysis.filler_breakdown && Object.keys(analysis.filler_breakdown).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-stone-500">Filler Breakdown</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analysis.filler_breakdown).map(([phrase, count]) => (
              <span key={phrase} className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">
                "{phrase}": {count}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {analysis && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-stone-100 pt-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Pauses</p>
            <p className="mt-1 text-sm font-semibold text-stone-800">{analysis.pause_count || 0}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Avg Pause Time</p>
            <p className="mt-1 text-sm font-semibold text-stone-800">{analysis.avg_pause_duration ? `${analysis.avg_pause_duration}s` : "0s"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
