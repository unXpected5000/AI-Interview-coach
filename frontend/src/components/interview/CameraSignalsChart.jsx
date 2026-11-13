// Dependency-free SVG line chart of timestamped camera estimates (0-100).
// Missing samples are drawn as gaps; values are never interpolated or invented.
import { seriesSegments } from "../../utils/cameraChart.js";

export const CAMERA_SERIES = [
  { key: "face", label: "Face detected", color: "#0f766e", dash: "" },
  { key: "centered", label: "Centered in frame", color: "#2563eb", dash: "6 3" },
  { key: "gaze", label: "Est. gaze toward camera", color: "#b45309", dash: "2 3" },
  { key: "upright", label: "Upright shoulders (est.)", color: "#7c3aed", dash: "8 3 2 3" },
];

export default function CameraSignalsChart({ timeline = [], title = "Camera signals over time", compact = false }) {
  const width = 320;
  const height = compact ? 90 : 140;
  const points = Array.isArray(timeline) ? timeline.filter((point) => Number.isFinite(point?.t)) : [];
  if (points.length < 2) {
    return <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">Not enough camera samples yet to draw a timeline.</p>;
  }
  const maxT = Math.max(...points.map((point) => point.t), 1);
  const present = CAMERA_SERIES.filter((series) => points.some((point) => Number.isFinite(point[series.key])));
  const summary = present
    .map((series) => {
      const values = points.map((point) => point[series.key]).filter(Number.isFinite);
      return `${series.label}: average ${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}%`;
    })
    .join("; ");
  return (
    <figure className="rounded-lg border border-stone-200 bg-white p-3">
      <figcaption className="text-xs font-bold text-stone-700">{title}</figcaption>
      <svg aria-label={`${title}. ${summary}. Time span ${Math.round(maxT)} seconds.`} className="mt-2 h-auto w-full" role="img" viewBox={`-28 -6 ${width + 34} ${height + 24}`}>
        {[0, 50, 100].map((tick) => {
          const y = height - (tick / 100) * height;
          return (
            <g key={tick}>
              <line stroke="#e7e5e4" strokeWidth="1" x1="0" x2={width} y1={y} y2={y} />
              <text fill="#78716c" fontSize="9" textAnchor="end" x="-4" y={y + 3}>{tick}%</text>
            </g>
          );
        })}
        <text fill="#78716c" fontSize="9" x="0" y={height + 14}>0 s</text>
        <text fill="#78716c" fontSize="9" textAnchor="end" x={width} y={height + 14}>{Math.round(maxT)} s</text>
        {present.map((series) => seriesSegments(points, series.key, { width, height, maxT }).map((segment, index) => (
          segment.length === 1
            ? <circle cx={segment[0].split(",")[0]} cy={segment[0].split(",")[1]} fill={series.color} key={`${series.key}-${index}`} r="2" />
            : <polyline fill="none" key={`${series.key}-${index}`} points={segment.join(" ")} stroke={series.color} strokeDasharray={series.dash} strokeWidth="2" />
        )))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-600">
        {present.map((series) => (
          <li className="inline-flex items-center gap-1" key={series.key}>
            <svg aria-hidden="true" height="6" width="18"><line stroke={series.color} strokeDasharray={series.dash} strokeWidth="2" x1="0" x2="18" y1="3" y2="3" /></svg>
            {series.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
