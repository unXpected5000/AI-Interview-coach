import { Link } from "react-router-dom";

import { ERROR_PAGES } from "../../utils/errorPages.js";

const ACCENTS = {
  "404": "from-teal-500 to-sky-500",
  "403": "from-amber-500 to-orange-500",
  "401": "from-sky-500 to-indigo-500",
  "500": "from-rose-500 to-orange-500",
  "503": "from-amber-500 to-rose-500",
  offline: "from-stone-500 to-stone-700",
  crash: "from-rose-500 to-fuchsia-500",
};

/**
 * Full-page explanation of an error with clear next steps.
 * `kind` is a key of ERROR_PAGES; `detail` is an optional extra sentence.
 */
export default function ErrorPage({ kind = "404", detail = "", onRetry, fullScreen = false, reference = "" }) {
  const page = ERROR_PAGES[kind] ?? ERROR_PAGES[500];
  const accent = ACCENTS[kind] ?? ACCENTS[500];
  return (
    <section
      aria-labelledby="error-title"
      className={`grid place-items-center px-4 ${fullScreen ? "min-h-screen bg-[var(--app-background)] py-10" : "py-12"}`}
      role="alert"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div aria-hidden="true" className={`h-2 bg-gradient-to-r ${accent}`} />
        <div className="p-6 sm:p-8">
          <p className={`bg-gradient-to-r ${accent} bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl`}>
            {page.code}
          </p>
          <h1 className="mt-3 text-2xl font-bold text-stone-950" id="error-title">{page.title}</h1>
          <p className="mt-3 leading-7 text-stone-600">{page.explanation}</p>
          {detail ? <p className="mt-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">{detail}</p> : null}
          <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-stone-500">What you can do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-700">
            {page.steps.map((step) => <li key={step}>{step}</li>)}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            {onRetry ? (
              <button className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-800" onClick={onRetry} type="button">
                Try again
              </button>
            ) : null}
            {kind === "401" ? (
              <Link className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-800" to="/login">Sign in</Link>
            ) : (
              <Link className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-800 hover:border-stone-950" to="/dashboard">Go to dashboard</Link>
            )}
            <button className="rounded-full px-3 py-2.5 text-sm font-semibold text-stone-600 underline" onClick={() => window.history.back()} type="button">
              Go back
            </button>
          </div>
          {reference ? <p className="mt-6 text-xs text-stone-400">Reference: {reference}</p> : null}
        </div>
      </div>
    </section>
  );
}
