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
    const completed = interviews
      .filter((item) => item.status === "completed")
      .sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
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
        
    const sessionsWithVoice = completed.filter((item) => item.voice_summary?.average_wpm > 0);
    const averageWpm = sessionsWithVoice.length
      ? Math.round(sessionsWithVoice.reduce((sum, item) => sum + item.voice_summary.average_wpm, 0) / sessionsWithVoice.length)
      : null;
        
    const sessionsWithCamera = completed.filter((item) => item.webcam_summary?.answers_with_metrics > 0);
    const sessionsWithFaceCoverage = sessionsWithCamera.filter((item) => item.webcam_summary?.average_face_visibility_pct != null);
    const averageFaceCoverage = sessionsWithFaceCoverage.length
      ? Math.round(sessionsWithFaceCoverage.reduce((sum, item) => sum + item.webcam_summary.average_face_visibility_pct, 0) / sessionsWithFaceCoverage.length)
      : null;

    const sessionsWithFillers = completed.filter((item) => item.voice_summary?.answers_with_speech > 0);
    const averageFillers = sessionsWithFillers.length
      ? Math.round(sessionsWithFillers.reduce((sum, item) => sum + item.voice_summary.average_fillers, 0) / sessionsWithFillers.length)
      : null;

    const weaknessCounts = new Map();
    for (const session of completed) {
      for (const weakness of session.weaknesses ?? []) {
        weaknessCounts.set(weakness, (weaknessCounts.get(weakness) ?? 0) + 1);
      }
    }
    const topWeaknesses = [...weaknessCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const difficultyStats = ["low", "medium", "hard", "interview_ready"].map((difficulty) => {
      const rows = completed.flatMap((session) => session.question_scores ?? []).filter((row) => row.difficulty === difficulty);
      const evaluated = rows.filter((row) => ["answered", "partial", "interrupted"].includes(row.answer_status) && Number.isFinite(Number(row.score)));
      const attempted = rows.filter((row) => ["answered", "partial", "interrupted", "evaluation_failed"].includes(row.answer_status)).length;
      return { difficulty, total: rows.length, attempted, completion: rows.length ? Math.round(attempted / rows.length * 100) : 0, average: evaluated.length ? Math.round(evaluated.reduce((sum, row) => sum + Number(row.score), 0) / evaluated.length) : null };
    });
    const scoreDelta = completed.length > 1
      ? Math.round((completed.at(-1).overall_score ?? 0) - (completed.at(-2).overall_score ?? 0))
      : null;

    return {
      totalResumes: resumes.length,
      totalInterviews: interviews.length,
      completedInterviews: completed.length,
      averageScore,
      averageCommunication,
      averageWpm,
      averageFaceCoverage,
      averageFillers,
      completed,
      topWeaknesses,
      difficultyStats,
      scoreDelta,
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
          <p className="mt-1 text-sm text-stone-600">Average communication score from completed sessions.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Average WPM</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageWpm ?? "—"}</p>
          <p className="mt-1 text-sm text-stone-600">Average WPM when speech timing was captured.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Face visible in frame</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageFaceCoverage === null ? "—" : `${stats.averageFaceCoverage}%`}</p>
          <p className="mt-1 text-sm text-stone-600">Approximate local face-tracking coverage across camera-enabled sessions.</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">Average fillers</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{stats.averageFillers ?? "—"}</p>
          <p className="mt-1 text-sm text-stone-600">Average detected fillers when transcript data is available.</p>
        </div>
      </div>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-bold">Score trend</h2><p className="mt-1 text-sm text-stone-500">Your latest completed practice sessions</p></div>
            {stats.scoreDelta !== null ? <span className={`rounded-full px-3 py-1 text-sm font-bold ${stats.scoreDelta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{stats.scoreDelta >= 0 ? "+" : ""}{stats.scoreDelta} points since previous</span> : null}
          </div>
          {stats.completed.length ? (
            <div className="mt-6 flex h-48 items-end gap-3 border-b border-stone-200 pb-2">
              {stats.completed.slice(-8).map((session, index, series) => {
                const value = Math.max(5, Math.min(100, session.overall_score ?? 0));
                return <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" key={session.id} title={`${Math.round(value)} points · ${formatDate(session.created_at)}`}>
                  <span className="text-xs font-bold text-stone-600">{Math.round(value)}</span>
                  <div className={`w-full max-w-12 rounded-t-md ${index === series.length - 1 ? "bg-teal-600" : "bg-teal-200"}`} style={{ height: `${value}%` }} />
                  <span className="text-[10px] text-stone-500">{formatDate(session.created_at).split(",")[0]}</span>
                </div>;
              })}
            </div>
          ) : <p className="mt-6 rounded-lg border border-dashed border-stone-300 p-5 text-sm text-stone-600">Complete an interview to start tracking your progress.</p>}
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Coaching focus</h2>
          <p className="mt-1 text-sm text-stone-500">Topics appearing most often in your feedback</p>
          {stats.topWeaknesses.length ? <ol className="mt-5 space-y-3">{stats.topWeaknesses.map(([weakness, count]) => <li className="flex items-start justify-between gap-3 rounded-lg bg-amber-50 p-3" key={weakness}><span className="text-sm text-stone-800">{weakness}</span><span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-bold text-amber-800">{count}×</span></li>)}</ol> : <p className="mt-5 rounded-lg bg-teal-50 p-4 text-sm text-teal-900">Complete a session to get recurring improvement themes and practical next steps here.</p>}
          <Link className="mt-5 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800" to="/interviews/start">Start a practice session</Link>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="difficulty-progress-heading">
        <h2 id="difficulty-progress-heading" className="text-xl font-bold">Performance by question difficulty</h2>
        <p className="mt-1 text-sm text-stone-500">Actual question levels across completed interviews. A blank score means no evaluated answer at that level yet.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.difficultyStats.map((item) => <article className="rounded-lg bg-stone-50 p-4" key={item.difficulty}><h3 className="text-sm font-bold uppercase">{item.difficulty.replaceAll("_", " ")}</h3><p className="mt-2 text-sm text-stone-700">Average evaluated score: <strong>{item.average ?? "—"}{item.average === null ? "" : "/100"}</strong></p><p className="mt-1 text-xs text-stone-500">Attempted {item.attempted}/{item.total} ({item.completion}%) · {item.total} question(s)</p></article>)}</div>
      </section>

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
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <ProgressBar
                      label="Score"
                      value={Math.round(interview.overall_score ?? 0)}
                      tone="teal"
                    />
                    <ProgressBar
                      label="Communication"
                      value={Math.round(interview.communication_score ?? 0)}
                      tone="teal"
                    />
                  </div>
                  {(interview.strengths?.length || interview.weaknesses?.length) ? <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {(interview.strengths ?? []).slice(0, 2).map((item) => <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800" key={`strength-${item}`}>Strength · {item}</span>)}
                    {(interview.weaknesses ?? []).slice(0, 2).map((item) => <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800" key={`weakness-${item}`}>Work on · {item}</span>)}
                  </div> : null}
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
