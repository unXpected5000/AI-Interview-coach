import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";
import LegalFooter from "../components/ui/LegalFooter.jsx";
import ErrorPage from "../components/ui/ErrorPage.jsx";
import { buildLegalPages } from "../legal/legalContent.js";
import { missingLegalSettings } from "../legal/legalConfig.js";

const pages = buildLegalPages();
const missing = missingLegalSettings();

export default function LegalPage() {
  const { kind = "privacy" } = useParams();
  const { isAuthenticated } = useAuth();
  const page = pages[kind];

  useEffect(() => {
    if (page) document.title = `${page.title} · AI Interview Coach`;
    return () => { document.title = "AI Interview Coach"; };
  }, [page]);

  if (!page) return <ErrorPage fullScreen kind="404" />;

  return (
    <main className="safe-bottom min-h-screen bg-[var(--app-background)] px-4 py-6 text-[var(--text-primary)] sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <Link className="text-sm font-semibold text-teal-800 underline" to={isAuthenticated ? "/dashboard" : "/login"}>
          ← {isAuthenticated ? "Back to dashboard" : "Back to sign in"}
        </Link>
        <ThemeToggle compact />
      </div>
      <article className="mx-auto mt-6 max-w-3xl rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold">{page.title}</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{page.summary}</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Effective {pages.effectiveDate}</p>

        {missing.length ? (
          <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950" role="note">
            Operator details are incomplete. Set {missing.join(", ")} in the frontend build environment and have these documents reviewed before public launch.
          </p>
        ) : null}

        {page.sections.length > 2 ? (
          <nav aria-label="Contents" className="mt-6 rounded-lg bg-stone-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Contents</p>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {page.sections.map((section) => (
                <li key={section.id}><a className="text-teal-800 underline" href={`#${section.id}`}>{section.heading}</a></li>
              ))}
            </ol>
          </nav>
        ) : null}

        {page.sections.map((section) => (
          <section className="mt-8 scroll-mt-20" id={section.id} key={section.id}>
            <h2 className="text-lg font-bold">{section.heading}</h2>
            {(section.paragraphs ?? []).map((text) => (
              <p className="mt-2 leading-7 text-[var(--text-secondary)]" key={text}>{text}</p>
            ))}
            {section.list ? (
              <ul className="mt-2 list-disc space-y-2 pl-5 leading-7 text-[var(--text-secondary)]">
                {section.list.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
      </article>
      <LegalFooter className="mx-auto mt-8 max-w-3xl justify-center" />
    </main>
  );
}
