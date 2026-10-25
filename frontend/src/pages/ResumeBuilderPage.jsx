import { useEffect, useMemo, useState } from "react";

import { listResumes } from "../api/resumeApi.js";
import PageHeader from "../components/ui/PageHeader.jsx";

const layouts = [
  { id: "classic", name: "Classic", description: "Traditional single-column layout" },
  { id: "modern", name: "Modern", description: "Clean teal accent and clear sections" },
  { id: "compact", name: "Compact", description: "Space-efficient layout for a longer history" },
];

const emptyResume = {
  fullName: "", email: "", phone: "", location: "", summary: "", skills: "", experience: "", projects: "", education: "",
};

function resumeToForm(resume) {
  const data = resume?.structured_resume ?? {};
  const lines = (items, map) => (items ?? []).map(map).filter(Boolean).join("\n");
  return {
    ...emptyResume,
    fullName: data.name ?? data.full_name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    location: data.location ?? "",
    summary: (data.summary_lines ?? []).join(" "),
    skills: [...(resume?.extracted_skills ?? []), ...(data.tools ?? [])].filter((item, index, all) => all.indexOf(item) === index).join(", "),
    experience: lines([...(data.experience ?? []), ...(data.internships ?? [])], (item) => `${item.title ?? item.role ?? "Role"} | ${item.company ?? ""}\n${item.description ?? item.raw_text ?? ""}`),
    projects: lines(data.projects, (item) => `${item.name ?? "Project"}\n${item.description ?? item.raw_text ?? ""}${item.technologies?.length ? ` (${item.technologies.join(", ")})` : ""}`),
    education: lines(data.education, (item) => `${item.degree ?? item.qualification ?? "Education"} | ${item.institution ?? ""}${item.year ? ` | ${item.year}` : ""}`),
  };
}

export default function ResumeBuilderPage() {
  const [resumes, setResumes] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [layout, setLayout] = useState("modern");
  const [form, setForm] = useState(emptyResume);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const selectedResume = useMemo(() => resumes.find((resume) => resume.id === sourceId), [resumes, sourceId]);

  useEffect(() => {
    let active = true;
    listResumes()
      .then((data) => {
        if (!active) return;
        const items = data.resumes ?? [];
        setResumes(items);
        if (items[0]) {
          setSourceId(items[0].id);
          setForm(resumeToForm(items[0]));
        }
      })
      .catch((requestError) => setError(requestError.response?.data?.detail ?? "Unable to load resume data."))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function changeSource(event) {
    const id = event.target.value;
    setSourceId(id);
    setForm(resumeToForm(resumes.find((resume) => resume.id === id)));
  }

  const sections = [
    ["Professional summary", form.summary],
    ["Experience", form.experience],
    ["Projects", form.projects],
    ["Education", form.education],
    ["Skills", form.skills],
  ].filter(([, value]) => value.trim());

  return (
    <section className="animate-rise">
      <PageHeader eyebrow="Resume Studio · Builder" title="Build a resume from a template" description="Start from an uploaded resume or enter your details, choose a layout, then print or save the preview as PDF." />
      {error ? <p className="mb-5 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
      {isLoading ? <div className="rounded-lg bg-white p-6 text-sm text-stone-600">Loading your resume data…</div> : (
        <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-5 print:hidden">
            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Choose a starting point</h2>
              <label className="mt-4 block text-sm font-semibold text-stone-600">Use extracted content</label>
              <select className="mt-2 w-full rounded-lg border border-stone-300 bg-white p-3 text-sm" onChange={changeSource} value={sourceId}>
                <option value="">Start with a blank resume</option>
                {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.filename}</option>)}
              </select>
              {!resumes.length ? <p className="mt-2 text-xs text-stone-500">Upload a resume in Resume Studio to prefill this builder.</p> : null}
            </section>
            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Select a layout</h2>
              <div className="mt-3 grid gap-2">
                {layouts.map((item) => (
                  <button className={`rounded-lg border p-3 text-left ${layout === item.id ? "border-teal-600 bg-teal-50" : "border-stone-200 hover:bg-stone-50"}`} key={item.id} onClick={() => setLayout(item.id)} type="button">
                    <span className="block text-sm font-bold">{item.name}</span><span className="mt-1 block text-xs text-stone-500">{item.description}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Your details</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[["fullName", "Full name"], ["email", "Email"], ["phone", "Phone"], ["location", "Location"]].map(([name, label]) => (
                  <label className="text-xs font-semibold text-stone-600" key={name}>{label}<input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm" name={name} onChange={updateField} value={form[name]} /></label>
                ))}
                {[["summary", "Professional summary"], ["experience", "Experience"], ["projects", "Projects"], ["education", "Education"], ["skills", "Skills"]].map(([name, label]) => (
                  <label className="text-xs font-semibold text-stone-600 sm:col-span-2" key={name}>{label}<textarea className="mt-1 min-h-20 w-full rounded-md border border-stone-300 p-2 text-sm" name={name} onChange={updateField} value={form[name]} /></label>
                ))}
              </div>
              <button className="mt-4 rounded-full bg-stone-950 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800" onClick={() => window.print()} type="button">Print / Save as PDF</button>
            </section>
          </div>

          <article className={`resume-print min-h-[900px] bg-white p-8 shadow-lg sm:p-12 ${layout === "classic" ? "resume-classic" : layout === "compact" ? "resume-compact" : "resume-modern"}`}>
            <header className="border-b-2 border-teal-700 pb-5">
              <p className="text-3xl font-black tracking-tight text-stone-950">{form.fullName || "Your Name"}</p>
              <p className="mt-2 text-sm text-stone-600">{[form.email, form.phone, form.location].filter(Boolean).join(" · ") || "Email · Phone · Location"}</p>
            </header>
            {sections.length ? sections.map(([title, content]) => (
              <section className="mt-6 break-inside-avoid" key={title}>
                <h2 className="mb-2 border-b border-stone-200 pb-1 text-sm font-black uppercase tracking-widest text-teal-800">{title}</h2>
                <div className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{content}</div>
              </section>
            )) : <p className="mt-8 text-sm text-stone-400">Your resume preview will appear here as you add details.</p>}
            {selectedResume ? <p className="mt-8 text-[10px] text-stone-400">Prefilled from {selectedResume.filename}; review every detail before exporting.</p> : null}
          </article>
        </div>
      )}
    </section>
  );
}
