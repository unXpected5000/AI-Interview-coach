import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteInterview, getInterview } from "../api/interviewApi.js";
import DonutScore from "../components/ui/DonutScore.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import ReportSection from "../components/ui/ReportSection.jsx";
import ExportButtons from "../components/interview/ExportButtons.jsx";

export default function ResultsPage() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [interviewState, setInterviewState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function removeInterview() {
    if (!window.confirm("Permanently delete this interview, its answers, scores and report? This cannot be undone.")) return;
    setIsDeleting(true); setError("");
    try { await deleteInterview(interviewId); navigate("/dashboard", { replace: true }); }
    catch (requestError) { setError(requestError.response?.data?.detail ?? "Unable to delete this interview."); setIsDeleting(false); }
  }

  useEffect(() => {
    let active = true;

    async function loadResults() {
      try {
        const data = await getInterview(interviewId);
        if (active) {
          setInterviewState(data);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.detail ?? "Unable to load results.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadResults();

    return () => {
      active = false;
    };
  }, [interviewId]);

  const interview = interviewState?.interview;
  const score = interviewState?.score;
  const answers = interviewState?.answers ?? [];
  const questionScores = score?.question_scores ?? [];
  const answeredScores = questionScores.filter((item) => item.answer_status !== "evaluation_failed" && item.answer_status !== "skipped" && String(item.answer_text ?? "").trim());
  const averageMetric = (key, rows = answeredScores) => {
    const values = rows
      .map((item) => item[key] === null || item[key] === undefined ? NaN : Number(item[key]))
      .filter((value) => Number.isFinite(value));
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const technicalDepth = averageMetric("technical_depth_score", answeredScores.filter((item) => !["behavioral", "situational"].includes(item.question_type)));
  const answerStructure = averageMetric("structure_score");

  if (isLoading) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">
        Loading results...
      </div>
    );
  }

  return (
    <section className="animate-rise">
      <PageHeader
        eyebrow="Results"
        title="Interview feedback"
        description="Overall score, strengths, weaknesses, suggestions, and learning roadmap are saved with the interview so the result screen can be reopened later."
      />

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {!score ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold text-stone-950">
            This interview has not been completed yet.
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Finish the interview to generate the final feedback report.
          </p>
          <Link
            className="mt-5 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
            to={`/interviews/${interviewId}`}
          >
            Back to interview
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
              <DonutScore label="Performance score" score={score.performance_score ?? score.overall_score} readinessCategory={score.readiness_category} assessmentNote={score.assessment_note} />
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Completion", `${score.completion_percentage ?? 0}%`],
                  ["Answered", `${score.answered_questions ?? 0}/${score.total_questions ?? questionScores.length}`],
                  ["Assessment", score.assessment_reliability ?? "Limited sample"],
                  ["Failed analysis", score.evaluation_failed_questions ?? 0],
                ].map(([title, value]) => <div className="rounded-xl bg-stone-50 p-3" key={title}><p className="text-xs text-stone-500">{title}</p><p className="mt-1 font-bold text-stone-900">{value}</p></div>)}
              </div>
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{score.assessment_note ?? "Assessment reflects saved answers and is not a prediction of hiring outcomes."}</p>
              <details className="mt-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-700"><summary className="cursor-pointer font-bold">How the score is calculated</summary><p className="mt-2 leading-6">{score.scoring_rubric ?? "The score averages evaluated answers with unanswered questions contributing zero."}</p></details>
              <div className="mt-8 space-y-4">
                <ProgressBar
                  label="Answer quality"
                  value={Math.round(score.overall_score)}
                  tone="teal"
                />
                {answerStructure !== null ? (
                  <ProgressBar label="Answer structure" value={answerStructure} tone="amber" />
                ) : null}
                {technicalDepth !== null ? (
                  <ProgressBar label="Technical depth" value={technicalDepth} tone="indigo" />
                ) : null}
                <ProgressBar
                  label="Communication"
                  value={Math.round(score.communication_score ?? 0)}
                  tone="teal"
                />
              </div>
            </section>

            <section className="flex flex-col space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-stone-950">Final Report</h2>
                <div className="flex flex-wrap gap-2"><ExportButtons interviewId={interviewId} /><button aria-label="Delete this interview and report" className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 focus-visible:outline" disabled={isDeleting} onClick={removeInterview} type="button">{isDeleting ? "Deleting…" : "Delete report"}</button></div>
              </div>

              {score.webcam_summary?.answers_with_metrics > 0 ? (
                <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-stone-950">Webcam estimates</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    Approximate face-tracking and framing signals from {score.webcam_summary.answers_with_metrics} answers. Not a measure of confidence or emotion.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Face visible in frame", score.webcam_summary.average_face_visibility_pct, "%"],
                      ["Centered in frame", score.webcam_summary.average_centered_frame_pct, "%"],
                      ["Relative movement index", score.webcam_summary.average_head_movement_index, ""],
                    ].filter(([, value]) => value !== null && value !== undefined).map(([label, value, suffix]) => (
                      <div className="rounded-lg bg-stone-50 p-3" key={label}>
                        <p className="text-xs text-stone-500">{label}</p>
                        <p className="mt-1 text-lg font-bold text-stone-900">{Number(value).toFixed(1)}{suffix}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {score.report && Object.entries(score.report).filter(([key]) => !["Performance", "Completion", "Scoring Rubric"].includes(key)).map(([key, value]) => (
                <ReportSection key={key} title={key} content={value} />
              ))}

              {!score.report && (
                <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
                  Report data is not available for this session.
                </div>
              )}
            </section>
          </div>

          <section className="mt-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-stone-950">Question breakdown</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Scores are stored per question and can be revisited later
                </p>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-bold text-teal-700">
                {score.answered_questions ?? answeredScores.length}/{score.total_questions ?? questionScores.length} answered
              </span>
            </div>

            <div className="mt-6 grid gap-4">
              {questionScores.map((item) => (
                <article
                  className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                  key={item.question_id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">
                        {item.skill} - {item.difficulty}
                      </p>
                      {item.answer_status === "unanswered" || !String(item.answer_text ?? "").trim() ? (
                        <p className="mt-1 text-sm font-semibold text-amber-700">No answer recorded. This contributes 0 to the score, unless analysis failed.</p>
                      ) : <p className="mt-1 text-sm text-stone-600">{item.answer_text}</p>}
                      {item.answer_status === "evaluation_failed" ? <p className="mt-1 text-sm font-semibold text-rose-700">Evaluation unavailable. This question was excluded from the score denominator.</p> : null}
                      {item.answer_status === "skipped" ? <p className="mt-1 text-sm font-semibold text-amber-700">Skipped. This question contributes 0 to the score.</p> : null}
                      {item.transcript && item.transcript !== item.answer_text ? (
                        <p className="mt-2 text-xs leading-5 text-stone-500">
                          Transcript: {item.transcript}
                        </p>
                      ) : null}
                      {item.answer_status !== "evaluation_failed" && item.answer_status !== "unanswered" && item.answer_status !== "skipped" ? <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                        <span className="rounded-full bg-white px-3 py-1">Semantic {Math.round(item.semantic_score)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Completeness {Math.round(item.completeness_score)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Relevance {Math.round(item.relevance_score)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Communication {Math.round(item.communication_score ?? 0)}</span>
                      </div> : null}
                      {item.speech_analysis?.word_count ? (
                        <div className="mt-3 text-xs text-stone-500">
                          {item.speech_analysis.word_count} words, {Math.round(item.speech_analysis.words_per_minute || 0)} WPM, {item.speech_analysis.filler_count} filler words
                        </div>
                      ) : null}
                      {item.answer_status !== "unanswered" && item.matched_points?.length ? (
                        <div className="mt-3 text-sm text-emerald-700">
                          Matched: {item.matched_points.join(", ")}
                        </div>
                      ) : null}
                      {item.answer_status !== "unanswered" && item.missing_points?.length ? (
                        <div className="mt-2 text-sm text-amber-700">
                          Missing: {item.missing_points.join(", ")}
                        </div>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-teal-700">
                      {item.answer_status === "evaluation_failed" ? "N/A" : `${Math.round(item.score)}/100`}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
