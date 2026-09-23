import { useEffect, useState } from "react";

import { listResumes, uploadResume } from "../api/resumeApi.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";

function formatUploadedAt(value) {
  if (!value) {
    return "Recently uploaded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently uploaded";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function countItems(section) {
  return Array.isArray(section) ? section.length : 0;
}

export default function ResumeUploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedResume, setUploadedResume] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadResumes() {
      try {
        const data = await listResumes();
        if (active) {
          setResumes(data.resumes ?? []);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.detail ?? "Unable to load resumes.",
          );
        }
      } finally {
        if (active) {
          setIsLoadingResumes(false);
        }
      }
    }

    loadResumes();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Choose a PDF resume to upload.");
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      const uploaded = await uploadResume(selectedFile);
      setUploadedResume(uploaded);
      setResumes((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
      setSelectedFile(null);
      event.target.reset();
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ?? "Resume upload failed.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="animate-rise">
      <PageHeader
        eyebrow="Resume Upload"
        title="Upload a PDF resume"
        description="The file is parsed locally with PyMuPDF, skills are extracted without an LLM call, and the stored skills drive interview generation."
      />

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">PDF file</span>
              <input
                accept="application/pdf"
                className="mt-2 block w-full cursor-pointer rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-stone-950 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:bg-white"
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="rounded-lg bg-stone-950 p-5 text-white">
              <p className="text-sm font-bold uppercase tracking-wide text-teal-200">
                Upload pipeline
              </p>
              <div className="mt-4 space-y-4">
                <ProgressBar label="File validation" value={100} tone="teal" />
                <ProgressBar label="PDF text extraction" value={100} tone="amber" />
                <ProgressBar label="Skill extraction" value={100} tone="indigo" />
              </div>
            </div>

            <button
              className="w-full rounded-full bg-teal-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={isUploading}
              type="submit"
            >
              {isUploading ? "Uploading..." : "Upload PDF"}
            </button>
          </form>

          {uploadedResume ? (
            <div className="mt-6 rounded-lg border border-teal-200 bg-teal-50 p-5">
              <p className="text-sm font-bold text-teal-900">Latest upload</p>
              <p className="mt-1 text-sm text-teal-800">{uploadedResume.filename}</p>
              <p className="mt-4 text-sm font-semibold text-teal-900">Extracted skills</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {uploadedResume.extracted_skills.map((skill) => (
                  <span
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-teal-800"
                    key={skill}
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Education", countItems(uploadedResume.structured_resume?.education)],
                  ["Projects", countItems(uploadedResume.structured_resume?.projects)],
                  ["Internships", countItems(uploadedResume.structured_resume?.internships)],
                  ["Tools", countItems(uploadedResume.structured_resume?.tools)],
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-white px-4 py-3" key={label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
                    <p className="mt-1 text-lg font-bold text-stone-950">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-teal-900">Projects</p>
                  <div className="mt-2 space-y-2">
                    {(uploadedResume.structured_resume?.projects ?? []).slice(0, 3).map((project) => (
                      <div className="rounded-lg border border-teal-100 bg-white px-4 py-3" key={project.name}>
                        <p className="text-sm font-semibold text-stone-950">{project.name}</p>
                        <p className="mt-1 text-xs leading-5 text-stone-600">{project.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-teal-900">Education</p>
                  <div className="mt-2 space-y-2">
                    {(uploadedResume.structured_resume?.education ?? []).slice(0, 3).map((entry) => (
                      <div className="rounded-lg border border-teal-100 bg-white px-4 py-3" key={entry.text}>
                        <p className="text-sm font-semibold text-stone-950">
                          {entry.degree || entry.institution || "Education"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-stone-600">{entry.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-950">Uploaded resumes</h2>
              <p className="mt-1 text-sm text-stone-500">
                Resume history stays tied to the signed-in user
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
              {resumes.length}
            </span>
          </div>

          {isLoadingResumes ? (
            <div className="mt-6 text-sm text-stone-600">Loading resumes...</div>
          ) : resumes.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-stone-300 p-6 text-sm text-stone-600">
              No resumes uploaded yet.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {resumes.map((resume) => (
                <article
                  className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                  key={resume.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-stone-950">{resume.filename}</h3>
                      <p className="mt-1 text-xs text-stone-500">
                        {formatUploadedAt(resume.uploaded_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-700">
                      {resume.extracted_skills.length} skills
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {resume.extracted_skills.slice(0, 8).map((skill) => (
                      <span
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700"
                        key={skill}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-stone-500 sm:grid-cols-4">
                    <span>Projects {countItems(resume.structured_resume?.projects)}</span>
                    <span>Exp {countItems(resume.structured_resume?.experience)}</span>
                    <span>Edu {countItems(resume.structured_resume?.education)}</span>
                    <span>Tools {countItems(resume.structured_resume?.tools)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
