import { useEffect, useMemo, useState } from "react";

import { listResumes } from "../api/resumeApi.js";
import { analyzeResume } from "../api/resumeOptimizerApi.js";
import DonutScore from "../components/ui/DonutScore.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { recordConsent } from "../api/accountApi.js";

export default function ResumeOptimizerPage() {
  const [resumes, setResumes] = useState([]);
  const [form, setForm] = useState({
    resume_id: "",
    target_role: "",
    company_name: "",
    job_description: "",
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiDisclosureAccepted, setAiDisclosureAccepted] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadResumes() {
      try {
        const data = await listResumes();
        if (!active) {
          return;
        }
        const items = data.resumes ?? [];
        setResumes(items);
        setForm((current) => ({
          ...current,
          resume_id: current.resume_id || items[0]?.id || "",
        }));
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.detail ?? "Unable to load resumes.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadResumes();

    return () => {
      active = false;
    };
  }, []);

  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === form.resume_id),
    [form.resume_id, resumes],
  );

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data = await analyzeResume({
        resume_id: form.resume_id,
        target_role: form.target_role,
        company_name: form.company_name || undefined,
        job_description: form.job_description || undefined,
      });
      setResult(data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail ?? "Resume optimization failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="animate-rise">
      <PageHeader
        eyebrow="Resume Optimizer"
        title="Tailor a resume for a target role"
        description="Compare an existing resume against a role or job description. The optimizer only rephrases verified experience and keeps the output ATS-friendly."
      />

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><input checked={aiDisclosureAccepted} className="mt-1" onChange={(event) => { setAiDisclosureAccepted(event.target.checked); recordConsent("ai_processing", event.target.checked ? "accepted" : "withdrawn").catch(() => {}); }} type="checkbox" /><span>Resume text and the role details you enter will be sent to the configured AI provider for optimization. Review the <a className="underline" href="/legal/privacy">Privacy Policy</a> before continuing.</span></label>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Resume</span>
              <select
                className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-teal-600 focus:bg-white"
                name="resume_id"
                value={form.resume_id}
                onChange={updateField}
              >
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.filename}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Target role</span>
              <input
                className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-teal-600 focus:bg-white"
                name="target_role"
                placeholder="Frontend Engineer"
                value={form.target_role}
                onChange={updateField}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Company name</span>
              <input
                className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-teal-600 focus:bg-white"
                name="company_name"
                placeholder="Optional"
                value={form.company_name}
                onChange={updateField}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Job description</span>
              <textarea
                className="mt-2 min-h-44 w-full rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-teal-600 focus:bg-white"
                name="job_description"
                placeholder="Optional job description"
                value={form.job_description}
                onChange={updateField}
              />
            </label>

            <button
              className="w-full rounded-full bg-stone-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={isSubmitting || isLoading || !form.resume_id || !form.target_role || !aiDisclosureAccepted}
              type="submit"
            >
              {isSubmitting ? "Optimizing..." : "Analyze resume"}
            </button>
          </form>

          {selectedResume ? (
            <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-bold text-stone-950">{selectedResume.filename}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(selectedResume.extracted_skills ?? []).slice(0, 8).map((skill) => (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700" key={skill}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          {!result ? (
            <div className="rounded-lg border border-dashed border-stone-300 p-8 text-sm text-stone-600">
              Run the optimizer to see ATS score, keyword gaps, rewritten bullets, and a tailored summary.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-lg bg-stone-950 p-5 text-white">
                  <DonutScore label="ATS score" score={Math.round(result.result.score_breakdown?.ats_score?.score || 0)} />
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-5">
                  <p className="text-sm font-bold uppercase tracking-wide text-teal-700">Optimized summary</p>
                  <p className="mt-3 text-sm leading-7 text-stone-700">{result.result.optimized_summary}</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-teal-700">Strengths</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                    {result.result.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Gaps</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                    {result.result.gaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>

              <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm font-bold uppercase tracking-wide text-stone-700">Suggested keywords</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.result.suggested_keywords.map((keyword) => (
                    <span
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700"
                      key={keyword}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                {Object.entries(result.result.rewritten_sections).map(([sectionName, items]) => (
                  <article className="rounded-lg border border-stone-200 bg-stone-50 p-4" key={sectionName}>
                    <p className="text-sm font-bold uppercase tracking-wide text-stone-700">{sectionName}</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </section>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
