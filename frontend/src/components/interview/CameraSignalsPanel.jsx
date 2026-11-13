import CameraSignalsChart from "./CameraSignalsChart.jsx";

export const CAMERA_LIMITS_TEXT =
  "Estimates from an on-device face and pose model. Lighting, camera angle, glasses, and screen position all affect them. " +
  "Gaze is an approximation of eye direction, not reliable eye contact. None of these measure confidence, honesty, emotion, or interview quality.";

const QUALITY_TEXT = {
  ok: "",
  low: "low coverage",
  not_enough_data: "not enough data",
};

function readout(value, quality, suffix = "%") {
  if (quality === "not_enough_data" || value === null || value === undefined) return "—";
  return `${Math.round(value)}${suffix}`;
}

/** Live readouts for the current answer plus a timeline chart. */
export default function CameraSignalsPanel({ metrics, postureAvailable, consent }) {
  const quality = metrics?.quality ?? {};
  const rows = [
    ["Face detected", readout(metrics?.face_visibility_pct, metrics?.sample_count >= 5 ? "ok" : "not_enough_data"), ""],
    ["Centered in frame", readout(metrics?.centered_frame_pct, metrics?.sample_count >= 5 ? "ok" : "not_enough_data"), ""],
    ["Head movement index", readout(metrics?.head_movement_index, metrics?.sample_count >= 5 ? "ok" : "not_enough_data", ""), ""],
    ["Head turn (yaw / pitch)", quality.head_pose === "not_enough_data" || metrics?.head_yaw_mean_deg == null ? "—" : `${Math.round(metrics.head_yaw_mean_deg)}° / ${Math.round(metrics.head_pitch_mean_deg)}°`, QUALITY_TEXT[quality.head_pose]],
    ["Est. gaze toward camera", readout(metrics?.gaze_toward_camera_pct, quality.gaze), QUALITY_TEXT[quality.gaze]],
    ["Upright shoulders (est.)", postureAvailable ? readout(metrics?.posture_upright_pct, quality.posture) : "—", postureAvailable ? QUALITY_TEXT[quality.posture] || "" : "pose model unavailable"],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {rows.map(([label, value, note]) => (
          <div className="rounded-lg bg-stone-50 p-2" key={label}>
            <dt className="text-[10px] text-stone-500">{label}</dt>
            <dd className="mt-1 text-sm font-bold text-stone-900">{value}</dd>
            {note ? <dd className="text-[10px] text-amber-700">{note}</dd> : null}
          </div>
        ))}
      </dl>
      {quality.posture === "not_enough_data" && postureAvailable ? <p className="text-[10px] text-stone-500">Posture needs both shoulders visible in frame; sit back slightly if you want it measured.</p> : null}
      <CameraSignalsChart compact timeline={metrics?.timeline} title="This answer" />
      <p className="text-[10px] leading-4 text-stone-500">{CAMERA_LIMITS_TEXT} {consent ? "Only these derived numbers are saved with your answer; video never leaves this device." : "Preview only: nothing from the camera is saved."}</p>
    </div>
  );
}

/** Explicit consent choice shown before the camera is requested. */
export function CameraConsentPrompt({ onChoose, onCancel, dark = false }) {
  const tone = dark ? "border-white/20 bg-black/70 text-slate-100" : "border-stone-200 bg-white text-stone-800";
  return (
    <div className={`rounded-xl border p-4 text-xs leading-5 shadow-lg ${tone}`} role="dialog" aria-label="Camera consent">
      <p className="text-sm font-bold">Use your camera?</p>
      <p className="mt-1">Your browser will ask for camera permission. Video is analyzed on this device only and is never recorded or uploaded. {CAMERA_LIMITS_TEXT}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded-full bg-teal-500 px-3 py-1.5 font-bold text-stone-950" onClick={() => onChoose(true)} type="button">Enable and save derived measurements</button>
        <button className="rounded-full border border-current px-3 py-1.5 font-bold" onClick={() => onChoose(false)} type="button">Preview only (save nothing)</button>
        <button className="px-2 py-1.5 underline" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  );
}
