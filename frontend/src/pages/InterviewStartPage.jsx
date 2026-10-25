import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { startInterview } from "../api/interviewApi.js";
import { listResumes } from "../api/resumeApi.js";
import PageHeader from "../components/ui/PageHeader.jsx";

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

export default function InterviewStartPage() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingResumeId, setStartingResumeId] = useState("");

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
          setIsLoading(false);
        }
      }
    }

    loadResumes();

    return () => {
      active = false;
    };
  }, []);

  async function handleStartInterview(resumeId, mode) {
    setError("");
    setStartingResumeId(resumeId);

    try {
      const data = await startInterview(resumeId);
      navigate(mode === "live" ? `/interviews/${data.interview.id}/live` : `/interviews/${data.interview.id}`);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ?? "Unable to start interview.",
      );
    } finally {
      setStartingResumeId("");
    }
  }

  return (
    <section className="animate-rise">
      <PageHeader
        eyebrow="Interview Start"
        title="Choose how you want to practice"
        description="Choose a resume, then use the question-by-question practice flow or join the spoken AI interview room."
      />

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">
          Loading resumes...
        </div>
      ) : resumes.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-lg font-semibold text-stone-950">No resumes yet</p>
          <p className="mt-2 text-sm text-stone-600">
            Upload a PDF resume first, then come back here to start an interview.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {resumes.map((resume) => (
            <article
              className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
              key={resume.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-stone-950">
                    {resume.filename}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {formatUploadedAt(resume.uploaded_at)}
                  </p>
                </div>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                  {resume.extracted_skills.length} skills
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {resume.extracted_skills.slice(0, 8).map((skill) => (
                  <span
                    className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700"
                    key={skill}
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <div className="mt-4 grid gap-2 text-xs text-stone-500 sm:grid-cols-4">
                <span>Projects {resume.structured_resume?.projects?.length ?? 0}</span>
                <span>Exp {resume.structured_resume?.experience?.length ?? 0}</span>
                <span>Edu {resume.structured_resume?.education?.length ?? 0}</span>
                <span>Tools {resume.structured_resume?.tools?.length ?? 0}</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                  disabled={Boolean(startingResumeId)}
                  type="button"
                  onClick={() => handleStartInterview(resume.id, "practice")}
                >
                  {startingResumeId === resume.id ? "Starting…" : "Practice mode"}
                </button>
                <button
                  className="rounded-full border border-teal-700 px-4 py-2 text-sm font-bold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={Boolean(startingResumeId)}
                  type="button"
                  onClick={() => handleStartInterview(resume.id, "live")}
                >
                  Join live interview
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
