export default function ProgressBar({ label, value, tone = "teal" }) {
  const toneClasses = {
    teal: "bg-teal-500",
    indigo: "bg-indigo-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    emerald: "bg-emerald-500",
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        <span className="text-sm font-semibold text-stone-950">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div
          className={`h-full rounded-full ${toneClasses[tone] ?? toneClasses.teal}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
