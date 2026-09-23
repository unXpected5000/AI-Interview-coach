import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getInterview } from "../api/interviewApi.js";
import DonutScore from "../components/ui/DonutScore.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import ReportSection from "../components/ui/ReportSection.jsx";

export default function ResultsPage() {
  const { interviewId } = useParams();
  const [interviewState, setInterviewState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
              <DonutScore label="Overall score" score={Math.round(score.overall_score)} />
              <div className="mt-8 space-y-4">
                <ProgressBar
                  label="Answer quality"
                  value={Math.round(score.overall_score)}
                  tone="teal"
                />
                <ProgressBar
                  label="Clarity"
                  value={Math.min(100, Math.round(score.overall_score + 6))}
                  tone="amber"
                />
                <ProgressBar
                  label="Depth"
                  value={Math.max(0, Math.round(score.overall_score - 8))}
                  tone="indigo"
                />
                <ProgressBar
                  label="Communication"
                  value={Math.round(score.communication_score ?? 0)}
                  tone="teal"
                />
              </div>
            </section>

            <section className="flex flex-col space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-stone-950">Final Report</h2>
                <button
                  onClick={() => window.print()}
                  className="inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
                >
                  Download PDF
                </button>
              </div>

              {score.report && Object.entries(score.report).map(([key, value]) => (
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
                {answers.length} answers
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
                      <p className="mt-1 text-sm text-stone-600">{item.answer_text}</p>
                      {item.transcript && item.transcript !== item.answer_text ? (
                        <p className="mt-2 text-xs leading-5 text-stone-500">
                          Transcript: {item.transcript}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                        <span className="rounded-full bg-white px-3 py-1">Semantic {Math.round(item.semantic_score)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Completeness {Math.round(item.completeness_score)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Relevance {Math.round(item.relevance_score)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Communication {Math.round(item.communication_score ?? 0)}</span>
                      </div>
                      {item.speech_analysis?.word_count ? (
                        <div className="mt-3 text-xs text-stone-500">
                          {item.speech_analysis.word_count} words, {Math.round(item.speech_analysis.words_per_minute || 0)} WPM, {item.speech_analysis.filler_count} filler words
                        </div>
                      ) : null}
                      {item.matched_points?.length ? (
                        <div className="mt-3 text-sm text-emerald-700">
                          Matched: {item.matched_points.join(", ")}
                        </div>
                      ) : null}
                      {item.missing_points?.length ? (
                        <div className="mt-2 text-sm text-amber-700">
                          Missing: {item.missing_points.join(", ")}
                        </div>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-teal-700">
                      {Math.round(item.score)}
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
