import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listInterviews } from "../api/interviewApi.js";
import { listResumes } from "../api/resumeApi.js";
import DonutScore from "../components/ui/DonutScore.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";

function formatDate(value) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [resumes, setResumes] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [resumeData, interviewData] = await Promise.all([listResumes(), listInterviews()]);
        if (!active) {
          return;
        }
        setResumes(resumeData.resumes ?? []);
        setInterviews(interviewData.interviews ?? []);
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.detail ?? "Unable to load dashboard data.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const completed = interviews.filter((item) => item.status === "completed");
    const averageScore =
      completed.length > 0
        ? Math.round(completed.reduce((sum, item) => sum + (item.overall_score ?? 0), 0) / completed.length)
        : 0;
    const averageCommunication =
      completed.length > 0
        ? Math.round(
            completed.reduce((sum, item) => sum + (item.communication_score ?? 0), 0) /
              completed.length,
          )
        : 0;
        
    const averageWpm = completed.length > 0
        ? Math.round(completed.reduce((sum, item) => sum + (item.voice_summary?.average_wpm ?? 0), 0) / completed.length)
        : 0;
        
    const averageEyeContact = completed.length > 0
        ? Math.round(completed.reduce((sum, item) => sum + (item.webcam_summary?.average_eye_contact ?? 0), 0) / completed.length)
        : 0;

    const averageFillers = completed.length > 0
        ? Math.round(completed.reduce((sum, item) => sum + (item.voice_summary?.average_fillers ?? 0), 0) / completed.length)
        : 0;

    return {
      totalResumes: resumes.length,
      totalInterviews: interviews.length,
      completedInterviews: completed.length,
      averageScore,
      averageCommunication,
      averageWpm,
      averageEyeContact,
      averageFillers,
    };
  }, [interviews, resumes]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">
        Loading dashboard...
      </div>
    );
  }

  return (
    <section className="animate-rise">
      <PageHeader
        eyebrow="Dashboard"
        title="Interview coach overview"
        description="Track uploads, interviews, and scores from one place. Use the quick actions to move straight into the next workflow."
        action={
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
              to="/resumes/upload"
            >
              Upload resume
            </Link>
            <Link
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-800 transition hover:border-stone-950"
              to="/resume-optimizer"
            >
              Optimize resume
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Resumes</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.totalResumes}</p>
          <p className="mt-1 text-sm text-stone-600">Stored under the signed-in account.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Interviews</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.totalInterviews}</p>
          <p className="mt-1 text-sm text-stone-600">Generated from uploaded resumes.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Completed</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.completedInterviews}</p>
          <p className="mt-1 text-sm text-stone-600">Finished sessions with saved feedback.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Average score</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageScore}</p>
          <p className="mt-1 text-sm text-stone-600">Across completed interview sessions.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Communication</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageCommunication}</p>
          <p className="mt-1 text-sm text-stone-600">Average speaking pace and clarity score.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Average WPM</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageWpm}</p>
          <p className="mt-1 text-sm text-stone-600">Words per minute across sessions.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Average eye contact</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageEyeContact}%</p>
          <p className="mt-1 text-sm text-stone-600">Webcam engagement percentage.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Average fillers</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageFillers}</p>
          <p className="mt-1 text-sm text-stone-600">Filler words per session.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.92fr]">
        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-950">Recent interviews</h2>
              <p className="mt-1 text-sm text-stone-500">Open any session to review answers and scores.</p>
            </div>
            <Link
              className="text-sm font-semibold text-teal-700 hover:text-teal-900"
              to="/interviews/start"
            >
              Start a new interview
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {interviews.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 p-6 text-sm text-stone-600">
                No interviews yet. Start from the Interview page after uploading a resume.
              </div>
            ) : (
              interviews.map((interview) => (
                <Link
                  className="block rounded-lg border border-stone-200 bg-stone-50 p-4 transition hover:border-teal-300 hover:bg-teal-50"
                  key={interview.id}
                  to={
                    interview.status === "completed"
                      ? `/interviews/${interview.id}/results`
                      : `/interviews/${interview.id}`
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">
                        Resume {interview.resume_id.slice(0, 8)}...
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {interview.question_count} questions - {formatDate(interview.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-700">
                      {interview.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <ProgressBar
                      label="Score"
                      value={Math.round(interview.overall_score ?? 0)}
                      tone="teal"
                    />
                    <ProgressBar
                      label="Strengths"
                      value={Math.min(100, (interview.strengths?.length ?? 0) * 30)}
                      tone="indigo"
                    />
                    <ProgressBar
                      label="Weaknesses"
                      value={Math.min(100, (interview.weaknesses?.length ?? 0) * 30)}
                      tone="amber"
                    />
                    <ProgressBar
                      label="Communication"
                      value={Math.round(interview.communication_score ?? 0)}
                      tone="teal"
                    />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-stone-950">Resume snapshot</h2>
          <p className="mt-1 text-sm text-stone-500">Quick read on the latest uploads and extracted structure.</p>
          <div className="mt-5 space-y-4">
            {resumes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 p-6 text-sm text-stone-600">
                Upload a resume to unlock structured parsing, question generation, and optimization.
              </div>
            ) : (
              resumes.slice(0, 3).map((resume) => (
                <article className="rounded-lg border border-stone-200 bg-stone-50 p-4" key={resume.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-stone-950">{resume.filename}</h3>
                      <p className="mt-1 text-xs text-stone-500">{formatDate(resume.uploaded_at)}</p>
                    </div>
                    <Link className="text-xs font-semibold text-teal-700 hover:text-teal-900" to="/resumes/upload">
                      View
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(resume.extracted_skills ?? []).slice(0, 6).map((skill) => (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="mt-5 rounded-lg bg-stone-950 p-5 text-white">
            <DonutScore label="Average score" score={stats.averageScore || 0} />
          </div>
        </section>
      </div>
    </section>
  );
}
