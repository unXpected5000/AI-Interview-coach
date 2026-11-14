import { useEffect, useMemo, useRef, useState } from "react";

import { listResumes } from "../api/resumeApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import ResumePreview from "../components/resume/ResumePreview.jsx";
import { getErrorMessage } from "../utils/errorMessage.js";
import { DRAFT_KEY, RESUME_TYPES, SECTION_LABELS, TEMPLATES, orderedSections, resumeToForm } from "../utils/resumeContent.js";

const EMPTY = {
  fullName: "", email: "", phone: "", location: "", links: "", summary: "", skills: "", experience: "", internships: "",
  projects: "", education: "", achievements: "", certifications: "", activities: "",
};
const ENTRY_HINT = "One entry per block, separated by a blank line.\nFirst line: Title | Organisation | Dates | Place\n- Start each bullet with a dash";

function readDraft(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${DRAFT_KEY}:${userId}`) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

export default function ResumeBuilderPage() {
  const { user } = useAuth();
  const draft = useMemo(() => (user?.id ? readDraft(user.id) : null), [user?.id]);
  const [resumes, setResumes] = useState([]);
  const [sourceId, setSourceId] = useState(draft?.sourceId ?? "");
  const [templateId, setTemplateId] = useState(draft?.templateId ?? "modern");
  const [typeId, setTypeId] = useState(draft?.typeId ?? (user?.year && user.year <= 3 ? "fresher" : "technical"));
  const [form, setForm] = useState(draft?.form ?? { ...EMPTY, fullName: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "" });
  const [savedAt, setSavedAt] = useState(draft ? "Draft restored" : "");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const firstSave = useRef(true);
  const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
  const sections = orderedSections(form, typeId);

  useEffect(() => {
    let active = true;
    listResumes()
      .then((data) => {
        if (!active) return;
        const items = data.resumes ?? [];
        setResumes(items);
        if (!draft && items[0]) applySource(items[0]);
      })
      .catch((requestError) => setError(getErrorMessage(requestError, "Unable to load resume data.")))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  // Autosave the draft in this browser (it is not uploaded).
  useEffect(() => {
    if (!user?.id) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`${DRAFT_KEY}:${user.id}`, JSON.stringify({ form, templateId, typeId, sourceId }));
        setSavedAt(`Draft saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      } catch {
        setSavedAt("Draft can't be saved in this browser");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form, templateId, typeId, sourceId, user?.id]);

  function applySource(resume) {
    const filled = resumeToForm(resume);
    setSourceId(resume?.id ?? "");
    setForm({
      ...EMPTY,
      ...filled,
      fullName: filled.fullName || user?.name || "",
      email: filled.email || user?.email || "",
      phone: filled.phone || user?.phone || "",
    });
  }

  function changeSource(event) {
    const resume = resumes.find((item) => item.id === event.target.value);
    if (resume) applySource(resume);
    else {
      setSourceId("");
      setForm({ ...EMPTY, fullName: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "" });
    }
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function resetDraft() {
    try { localStorage.removeItem(`${DRAFT_KEY}:${user?.id}`); } catch { /* storage blocked */ }
    const resume = resumes.find((item) => item.id === sourceId) ?? resumes[0];
    if (resume) applySource(resume);
    else setForm({ ...EMPTY, fullName: user?.name ?? "", email: user?.email ?? "" });
    setSavedAt("Draft cleared");
  }

  const fieldClass = "mt-1 w-full rounded-md border border-stone-300 p-2 text-sm";
  const textSections = RESUME_TYPES.find((item) => item.id === typeId)?.order ?? [];

  return (
    <section className="animate-rise">
      <PageHeader eyebrow="Resume Studio · Builder" title="Build a resume from a template" description="Choose a resume type and a design, edit the prefilled content, then print or save as PDF. Your draft is saved in this browser only." />
      {error ? <p className="mb-5 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
      {isLoading ? <div className="rounded-lg bg-white p-6 text-sm text-stone-600">Loading your resume data…</div> : (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-5 print:hidden">
            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">1. Starting point</h2>
              <select aria-label="Prefill from an uploaded resume" className="mt-3 w-full rounded-lg border border-stone-300 bg-white p-3 text-sm" onChange={changeSource} value={sourceId}>
                <option value="">Start with a blank resume</option>
                {resumes.map((resume) => <option key={resume.id} value={resume.id}>Prefill from {resume.filename}</option>)}
              </select>
              {!resumes.length ? <p className="mt-2 text-xs text-stone-500">Upload a resume in Resume Studio to prefill this builder.</p> : null}
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">2. Resume type</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {RESUME_TYPES.map((item) => (
                  <button aria-pressed={typeId === item.id} className={`rounded-lg border p-3 text-left ${typeId === item.id ? "border-teal-600 bg-teal-50" : "border-stone-200 hover:bg-stone-50"}`} key={item.id} onClick={() => setTypeId(item.id)} type="button">
                    <span className="block text-sm font-bold">{item.name}</span><span className="mt-1 block text-xs text-stone-500">{item.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">3. Design</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TEMPLATES.map((item) => (
                  <button aria-pressed={templateId === item.id} className={`rounded-lg border p-2 text-left ${templateId === item.id ? "border-teal-600 bg-teal-50" : "border-stone-200 hover:bg-stone-50"}`} key={item.id} onClick={() => setTemplateId(item.id)} title={item.description} type="button">
                    <span aria-hidden="true" className="mb-2 block h-10 rounded border border-stone-200 bg-white p-1">
                      <span className="block h-1.5 w-3/4 rounded" style={{ background: item.accent }} />
                      <span className={`mt-1 grid gap-0.5 ${item.columns === 2 ? "grid-cols-[1fr_2fr]" : ""}`}>
                        <span className="block h-1 rounded bg-stone-300" /><span className="block h-1 rounded bg-stone-200" />
                      </span>
                    </span>
                    <span className="block text-xs font-bold">{item.name}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-stone-500">{template.description}. For online job portals, "ATS plain" is the safest choice.</p>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">4. Your details</h2>
                <span className="text-xs text-stone-500" role="status">{savedAt}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[["fullName", "Full name"], ["email", "Email"], ["phone", "Phone"], ["location", "City"]].map(([name, label]) => (
                  <label className="text-xs font-semibold text-stone-600" key={name}>{label}<input className={fieldClass} name={name} onChange={updateField} value={form[name]} /></label>
                ))}
                <label className="text-xs font-semibold text-stone-600 sm:col-span-2">Links (LinkedIn, GitHub, portfolio)<input className={fieldClass} name="links" onChange={updateField} placeholder="linkedin.com/in/you, github.com/you" value={form.links} /></label>
                {textSections.map((name) => (
                  <label className="text-xs font-semibold text-stone-600 sm:col-span-2" key={name}>
                    {SECTION_LABELS[name]}
                    <textarea
                      className={`${fieldClass} ${["summary", "skills"].includes(name) ? "min-h-16" : "min-h-28"} font-mono text-[12.5px]`}
                      name={name}
                      onChange={updateField}
                      placeholder={name === "summary" ? "2-3 lines: who you are, your strongest skills, and the role you want." : name === "skills" ? "Comma-separated: SolidWorks, MATLAB, Python" : ["achievements", "certifications", "activities"].includes(name) ? "- One item per line" : ENTRY_HINT}
                      value={form[name]}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="rounded-full bg-stone-950 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800" onClick={() => window.print()} type="button">Print / Save as PDF</button>
                <button className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700 hover:border-stone-950" onClick={resetDraft} type="button">Reset to uploaded resume</button>
              </div>
              <p className="mt-2 text-xs text-stone-500">In the print dialog choose "Save as PDF", A4, and turn off headers and footers.</p>
            </section>
          </div>

          <div className="min-w-0 overflow-x-auto">
            <ResumePreview form={form} sections={sections} template={template} />
            {sourceId ? <p className="mt-3 text-xs text-stone-500 print:hidden">Prefilled from your upload. Check every detail before sending.</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}
