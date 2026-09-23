export default function DonutScore({ score, label }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div
        className="grid size-32 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(#0f766e ${score * 3.6}deg, #e7e0d6 0deg)` }}
      >
        <div className="grid size-24 place-items-center rounded-full bg-white shadow-inner">
          <div className="text-center">
            <div className="text-3xl font-bold text-stone-950">{score}</div>
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
          Strong interview readiness
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-stone-600">
          Your strongest answers are structured clearly. Add more implementation
          tradeoffs to raise depth scores.
        </p>
      </div>
    </div>
  );
}
