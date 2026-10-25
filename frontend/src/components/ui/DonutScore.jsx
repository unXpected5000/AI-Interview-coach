export default function DonutScore({ score, label, readinessCategory, assessmentNote }) {
  const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0;
  const helper = readinessCategory
    ? assessmentNote
    : label?.toLowerCase().includes("ats")
      ? "Resume alignment estimate based on the information available."
      : "Practice performance score based on saved interview answers.";
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div
        className="grid size-32 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(#0f766e ${safeScore * 3.6}deg, var(--score-track, #e7e0d6) 0deg)` }}
      >
        <div className="grid size-24 place-items-center rounded-full bg-white shadow-inner">
          <div className="text-center">
            <div className="text-3xl font-bold text-stone-950">{safeScore.toFixed(0)}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
              score
            </div>
          </div>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-teal-700">
          {label}
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-950">
          {readinessCategory ?? (label?.toLowerCase().includes("ats") ? "Resume match" : "Practice score")}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-stone-600">{helper}</p>
      </div>
    </div>
  );
}
