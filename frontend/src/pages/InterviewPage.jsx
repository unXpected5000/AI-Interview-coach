import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { completeInterview, getInterview, submitAnswer } from "../api/interviewApi.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import VoiceMetricsPanel from "../components/interview/VoiceMetricsPanel.jsx";
import { WebcamPanel } from "../components/interview/WebcamPanel.jsx";
import { buildSpeechAnalysis } from "../utils/speechAnalysis.js";

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function formatSeconds(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function InterviewPage() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const recognitionRef = useRef(null);
  const recordingStartRef = useRef(0);
  const transcriptRef = useRef("");
  const resultTimestampsRef = useRef([]);
  const silenceTimeoutRef = useRef(null);
  const [interviewState, setInterviewState] = useState(null);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState("");
  const [speechAnalysis, setSpeechAnalysis] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [recordingState, setRecordingState] = useState('IDLE'); // 'IDLE', 'RECORDING', 'PAUSED'
  const [liveDuration, setLiveDuration] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [error, setError] = useState("");
  const [webcamMetrics, setWebcamMetrics] = useState({});

  useEffect(() => {
    let interval;
    if (recordingState === 'RECORDING') {
      interval = setInterval(() => {
        if (recordingStartRef.current) {
          setLiveDuration((Date.now() - recordingStartRef.current) / 1000);
        }
      }, 1000);
    } else if (recordingState === 'IDLE') {
      setLiveDuration(0);
    }
    return () => clearInterval(interval);
  }, [recordingState]);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInterview() {
      try {
        const data = await getInterview(interviewId);
        if (!active) {
          return;
        }

        const interview = data.interview;
        const answerMap = {};
        for (const answer of data.answers ?? []) {
          answerMap[answer.question_id] = answer;
        }

        setInterviewState({ ...data, interview });
        setAnswers(answerMap);

        const firstUnansweredIndex = interview.questions.findIndex(
          (question) => !answerMap[question.question_id],
        );
        setCurrentIndex(firstUnansweredIndex >= 0 ? firstUnansweredIndex : 0);
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.detail ?? "Unable to load interview.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadInterview();

    return () => {
      active = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort?.();
        recognitionRef.current = null;
      }
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    };
  }, [interviewId]);

  const interview = interviewState?.interview;
  const questions = interview?.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const answeredCount = useMemo(
    () => questions.filter((question) => answers[question.question_id]).length,
    [answers, questions],
  );
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  useEffect(() => {
    const savedAnswer = currentQuestion ? answers[currentQuestion.question_id] : null;
    const savedTranscript = savedAnswer?.transcript || savedAnswer?.answer_text || "";
    setDraft(savedAnswer?.answer_text ?? "");
    setTranscript(savedTranscript);
    transcriptRef.current = savedTranscript;
    resultTimestampsRef.current = [];
    setSpeechAnalysis(savedAnswer?.speech_analysis ?? null);
    setSpeechError("");
    setRecordingState('IDLE');
    if (recognitionRef.current) {
      recognitionRef.current.abort?.();
      recognitionRef.current = null;
    }
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    recordingStartRef.current = 0;
  }, [answers, currentQuestion]);

  function createRecognitionInstance() {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true; // Use continuous so it doesn't stop on pause
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // If we are paused, ignore
      // But actually if we stop() on pause, this won't fire much after.

      let nextTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        nextTranscript += event.results[index][0].transcript;
      }

      const cleanedTranscript = nextTranscript.trim();
      const fullTranscript = transcriptRef.current ? transcriptRef.current + " " + cleanedTranscript : cleanedTranscript;
      
      setTranscript(fullTranscript);
      setDraft(fullTranscript);
      
      const elapsed = recordingStartRef.current
        ? (Date.now() - recordingStartRef.current) / 1000
        : 0;

      // Track timestamp
      if (event.results[event.results.length - 1].isFinal) {
        transcriptRef.current = fullTranscript;
        resultTimestampsRef.current.push(elapsed);
      } else {
        // Just note that there is activity
        if (resultTimestampsRef.current.length === 0 || resultTimestampsRef.current[resultTimestampsRef.current.length - 1] !== elapsed) {
          resultTimestampsRef.current.push(elapsed);
        }
      }

      setSpeechAnalysis(buildSpeechAnalysis(fullTranscript, elapsed, resultTimestampsRef.current));

      // Reset silence timeout
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(() => {
        handleStopRecording();
      }, 30000);
    };

    recognition.onerror = (event) => {
      setSpeechError(event.error === "not-allowed"
        ? "Microphone access was blocked."
        : "Speech recognition stopped unexpectedly.");
      setRecordingState('IDLE');
      recordingStartRef.current = 0;
      recognitionRef.current = null;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    };

    recognition.onend = () => {
      // If continuous, it might end randomly or when stopped.
      // If state is RECORDING, it means it ended unexpectedly, we should maybe restart, but for now we just let it go to IDLE unless we were PAUSED.
      setRecordingState((prev) => {
        if (prev === 'RECORDING') {
          return 'IDLE';
        }
        return prev;
      });
    };

    return recognition;
  }

  function handleStartRecording() {
    if (!speechSupported) {
      setSpeechError("Speech recognition is not supported in this browser.");
      return;
    }

    setSpeechError("");
    setRecordingState('RECORDING');
    setTranscript("");
    transcriptRef.current = "";
    resultTimestampsRef.current = [];
    setSpeechAnalysis(null);

    const recognition = createRecognitionInstance();
    if (!recognition) {
      setSpeechError("Speech recognition is not available.");
      setRecordingState('IDLE');
      return;
    }

    recognitionRef.current = recognition;
    recordingStartRef.current = Date.now();

    try {
      recognition.start();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(() => {
        handleStopRecording();
      }, 30000);
    } catch (startError) {
      setRecordingState('IDLE');
      setSpeechError("Unable to start speech recognition.");
      recordingStartRef.current = 0;
      recognitionRef.current = null;
      transcriptRef.current = "";
    }
  }

  function handlePauseRecording() {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop(); // Stop listening
      setRecordingState('PAUSED');
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    } catch (err) {
      console.error(err);
    }
  }

  function handleResumeRecording() {
    if (!speechSupported) return;
    setRecordingState('RECORDING');
    
    // Create new instance to resume
    const recognition = createRecognitionInstance();
    if (recognition) {
      recognitionRef.current = recognition;
      try {
        recognition.start();
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = setTimeout(() => {
          handleStopRecording();
        }, 30000);
      } catch (err) {
        setSpeechError("Unable to resume speech recognition.");
        setRecordingState('PAUSED');
      }
    }
  }

  function handleStopRecording() {
    setRecordingState('IDLE');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (stopError) {
        setSpeechError("Unable to stop speech recognition.");
      }
      recognitionRef.current = null;
    }
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    const elapsed = recordingStartRef.current
      ? (Date.now() - recordingStartRef.current) / 1000
      : 0;
    const finalTranscript = transcriptRef.current.trim();
    if (recordingStartRef.current && finalTranscript) {
      setSpeechAnalysis(buildSpeechAnalysis(finalTranscript, elapsed, resultTimestampsRef.current));
    }
    recordingStartRef.current = 0;
  }

  async function handleNext() {
    if (!currentQuestion || !draft.trim()) {
      setError("Write an answer before continuing.");
      return;
    }

    if (recordingState !== 'IDLE') {
      setError("Stop recording before submitting the answer.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const transcriptToStore = transcript.trim() || draft.trim();
      const savedAnswer = await submitAnswer(
        interviewId,
        currentQuestion.question_id,
        draft.trim(),
        {
          transcript: transcriptToStore,
          speech_analysis: speechAnalysis || undefined,
          webcam_metrics: webcamMetrics,
        },
      );
      setAnswers((current) => ({
        ...current,
        [currentQuestion.question_id]: savedAnswer,
      }));

      const isLastQuestion = currentIndex >= questions.length - 1;
      if (isLastQuestion) {
        await completeInterview(interviewId);
        navigate(`/interviews/${interviewId}/results`, { replace: true });
        return;
      }

      setCurrentIndex((value) => Math.min(value + 1, questions.length - 1));
    } catch (requestError) {
      setError(requestError.response?.data?.detail ?? "Unable to save answer.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">
        Loading interview...
      </div>
    );
  }

  if (!interview) {
    return null;
  }

  if (!currentQuestion) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">
        No interview questions were found for this session.
      </div>
    );
  }

  const currentAnalysis = speechAnalysis || (currentQuestion && answers[currentQuestion.question_id]?.speech_analysis);

  return (
    <section className="animate-rise">
      <PageHeader
        eyebrow="Interview Session"
        title="Answer one question at a time"
        description="Each answer is stored immediately, scored locally with Sentence-BERT, and the final feedback is generated once at completion."
      />

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <aside className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-stone-950">Progress</h2>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-bold text-teal-700">
              {answeredCount}/{questions.length}
            </span>
          </div>

          <div className="mt-5">
            <ProgressBar label="Interview completion" value={progress} tone="teal" />
          </div>

          <div className="mt-6 space-y-3">
            {questions.map((question, index) => {
              const isActive = index === currentIndex;
              const hasAnswer = Boolean(answers[question.question_id]);
              return (
                <button
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    isActive
                      ? "border-teal-300 bg-teal-50"
                      : hasAnswer
                        ? "border-stone-200 bg-stone-50"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                  key={question.question_id}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-stone-950">
                      {String(question.question_id).padStart(2, "0")} - {question.skill}
                    </p>
                    <span className="text-xs font-bold text-stone-500">
                      {hasAnswer ? "Saved" : isActive ? "Current" : "Queued"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-stone-600">
                    {question.question}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <div className="rounded-lg bg-stone-950 p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-wide text-teal-200">
              {currentQuestion.source_section || currentQuestion.skill}
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight">
              {currentQuestion.question}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white/10 px-3 py-1">{currentQuestion.difficulty}</span>
              <span className="rounded-full bg-white/10 px-3 py-1">{currentQuestion.question_type}</span>
              <span className="rounded-full bg-white/10 px-3 py-1">{currentQuestion.topic_focus}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.92fr]">
            <div className="space-y-4">
              <WebcamPanel onMetricsUpdate={setWebcamMetrics} />
              
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-bold text-stone-700">Transcript preview</label>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${recordingState === 'RECORDING' ? "bg-rose-100 text-rose-700" : recordingState === 'PAUSED' ? "bg-amber-100 text-amber-700" : "bg-stone-200 text-stone-600"}`}>
                  {recordingState === 'RECORDING' ? "Recording" : recordingState === 'PAUSED' ? "Paused" : "Idle"}
                </span>
              </div>
              <p className="mt-3 min-h-24 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-stone-700">
                {transcript || "Speech transcript will appear here when recording starts."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {recordingState === 'IDLE' && (
                  <button
                    className="rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                    disabled={!speechSupported}
                    type="button"
                    onClick={handleStartRecording}
                  >
                    Start Recording
                  </button>
                )}
                {recordingState === 'RECORDING' && (
                  <button
                    className="rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-600"
                    type="button"
                    onClick={handlePauseRecording}
                  >
                    Pause
                  </button>
                )}
                {recordingState === 'PAUSED' && (
                  <button
                    className="rounded-full bg-teal-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700"
                    type="button"
                    onClick={handleResumeRecording}
                  >
                    Resume
                  </button>
                )}
                {recordingState !== 'IDLE' && (
                  <button
                    className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 transition hover:border-stone-950 disabled:cursor-not-allowed disabled:text-stone-400"
                    type="button"
                    onClick={handleStopRecording}
                  >
                    Stop Recording
                  </button>
                )}
              </div>
              {!speechSupported ? (
                <p className="mt-3 text-xs text-amber-700">
                  This browser does not support native speech recognition.
                </p>
              ) : null}
              {speechError ? (
                <p className="mt-2 text-xs text-rose-700">{speechError}</p>
              ) : null}
              <VoiceMetricsPanel 
                analysis={currentAnalysis} 
                isRecording={recordingState === 'RECORDING'} 
                liveDuration={liveDuration} 
              />
              </div>
            </div>

            <div className="rounded-lg bg-stone-950 p-6 text-white">
              <p className="text-sm font-bold uppercase tracking-wide text-teal-200">
                Speak or type
              </p>
              <div className="mt-4">
                <label className="text-sm font-bold text-white">Answer</label>
                <textarea
                  className="mt-2 min-h-72 w-full resize-none rounded-lg border border-stone-700 bg-stone-900 p-4 text-sm leading-6 text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-teal-400 focus:bg-stone-950"
                  placeholder="Write your answer here or use the microphone to populate it."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={currentIndex <= 0 || isSaving}
                  type="button"
                  onClick={() => setCurrentIndex((value) => Math.max(value - 1, 0))}
                >
                  Previous
                </button>
                <button
                  className="rounded-full bg-teal-500 px-5 py-3 text-sm font-bold text-stone-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-stone-400"
                  disabled={isSaving}
                  type="button"
                  onClick={handleNext}
                >
                  {currentIndex >= questions.length - 1 ? "Complete interview" : "Save & next"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
