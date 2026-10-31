import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { completeInterview, getInterview, submitAnswer } from "../api/interviewApi.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import VoiceMetricsPanel from "../components/interview/VoiceMetricsPanel.jsx";
import { WebcamPanel } from "../components/interview/WebcamPanel.jsx";
import { buildSpeechAnalysis } from "../utils/speechAnalysis.js";
import { createSpeechRecognition, getSpeechRecognitionConstructor, getSpeechRecognitionMode } from "../utils/speechRecognition.js";

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
  const pauseStartRef = useRef(0);
  const totalPausedTimeRef = useRef(0);
  const transcriptRef = useRef("");
  const resultTimestampsRef = useRef([]);
  const silenceTimeoutRef = useRef(null);
  const recognitionRetryTimeoutRef = useRef(null);
  const recognitionRetriesRef = useRef(0);
  const shouldListenRef = useRef(false);
  const activeQuestionIdRef = useRef(null);
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
  const [speechMode, setSpeechMode] = useState("");
  const [error, setError] = useState("");
  const [webcamMetrics, setWebcamMetrics] = useState({});

  useEffect(() => {
    let interval;
    if (recordingState === 'RECORDING') {
      interval = setInterval(() => {
        if (recordingStartRef.current) {
          setLiveDuration((Date.now() - recordingStartRef.current - totalPausedTimeRef.current) / 1000);
        }
      }, 1000);
    } else if (recordingState === 'IDLE') {
      setLiveDuration(0);
    }
    return () => clearInterval(interval);
  }, [recordingState]);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionConstructor()));
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
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort?.();
        recognitionRef.current = null;
      }
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (recognitionRetryTimeoutRef.current) clearTimeout(recognitionRetryTimeoutRef.current);
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
    activeQuestionIdRef.current = currentQuestion?.question_id ?? null;
    const savedTranscript = savedAnswer?.transcript || savedAnswer?.answer_text || "";
    setDraft(savedAnswer?.answer_text ?? "");
    setTranscript(savedTranscript);
    transcriptRef.current = savedTranscript;
    resultTimestampsRef.current = [];
    setSpeechAnalysis(savedAnswer?.speech_analysis ?? null);
    setSpeechError("");
    setSpeechMode("");
    setRecordingState('IDLE');
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.abort?.();
      recognitionRef.current = null;
    }
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    if (recognitionRetryTimeoutRef.current) clearTimeout(recognitionRetryTimeoutRef.current);
    recordingStartRef.current = 0;
    pauseStartRef.current = 0;
    totalPausedTimeRef.current = 0;
  }, [answers, currentQuestion]);

  async function createRecognitionInstance() {
    const questionId = currentQuestion?.question_id;
    let result;
    try {
      result = await createSpeechRecognition((message) => setSpeechError(message));
    } catch {
      setSpeechError("Could not start speech recognition. Type your answer or retry the microphone.");
      return null;
    }
    const { recognition, processLocally } = result;
    if (!recognition) return null;

    recognition.onresult = (event) => {
      if (activeQuestionIdRef.current !== questionId) return;
      const elapsed = recordingStartRef.current
        ? (Date.now() - recordingStartRef.current - totalPausedTimeRef.current) / 1000
        : 0;

      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const chunk = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          recognitionRetriesRef.current = 0;
          transcriptRef.current += (transcriptRef.current ? " " : "") + chunk.trim();
          resultTimestampsRef.current.push(elapsed);
        } else {
          interimTranscript += chunk;
        }
      }

      const fullTranscript = transcriptRef.current + (interimTranscript ? " " + interimTranscript.trim() : "");
      
      setTranscript(fullTranscript);
      setDraft(fullTranscript);
      
      setSpeechAnalysis(buildSpeechAnalysis(fullTranscript, elapsed, resultTimestampsRef.current));
    };

    recognition.onerror = (event) => {
      if (activeQuestionIdRef.current !== questionId) return;
      if (event.error === "network" && !processLocally) {
        shouldListenRef.current = false;
        setRecordingState("PAUSED");
        pauseStartRef.current = Date.now();
        setSpeechError("The browser speech service lost its network connection. Your transcript is safe; retry when online or type your answer.");
        recognitionRef.current = null;
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setSpeechError("Microphone access was blocked.");
        setRecordingState('IDLE');
        recordingStartRef.current = 0;
        recognitionRef.current = null;
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        return;
      }
      
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setSpeechError(`Speech recognition issue (${event.error}). Check your microphone or type your answer.`);
      }
    };

    recognition.onend = () => {
      if (!shouldListenRef.current || activeQuestionIdRef.current !== questionId) return;
      if (recognitionRetriesRef.current >= 3) {
        shouldListenRef.current = false;
        setRecordingState("PAUSED");
        setSpeechError("Speech recognition stopped after several retries. Your answer is safe; type it or restart the microphone.");
        return;
      }
      const delays = [250, 600, 1200];
      const delay = delays[recognitionRetriesRef.current];
      recognitionRetriesRef.current += 1;
      recognitionRetryTimeoutRef.current = window.setTimeout(async () => {
        recognitionRetryTimeoutRef.current = null;
        if (!shouldListenRef.current) return;
        const nextRecognition = await createRecognitionInstance();
        if (!nextRecognition || !shouldListenRef.current) return;
        recognitionRef.current = nextRecognition;
        try {
          nextRecognition.start();
        } catch {
          if (shouldListenRef.current) nextRecognition.stop?.();
        }
      }, delay);
    };

    return recognition;
  }

  async function handleStartRecording() {
    if (!speechSupported) {
      setSpeechError("Speech recognition is not supported in this browser.");
      return;
    }

    setSpeechError("");
    setRecordingState('RECORDING');
    shouldListenRef.current = true;
    recognitionRetriesRef.current = 0;
    setTranscript("");
    transcriptRef.current = "";
    resultTimestampsRef.current = [];
    setSpeechAnalysis(null);

    const mode = await getSpeechRecognitionMode((message) => setSpeechError(message));
    if (!shouldListenRef.current) return;
    const recognition = await createRecognitionInstance();
    if (!shouldListenRef.current) return;
    if (mode.SpeechRecognition) setSpeechMode(mode.processLocally ? "On-device recognition" : "Browser speech service (network required)");
    if (!recognition) {
      setSpeechError("Speech recognition is not available.");
      setRecordingState('IDLE');
      return;
    }

    recognitionRef.current = recognition;
    recordingStartRef.current = Date.now();
    pauseStartRef.current = 0;
    totalPausedTimeRef.current = 0;

    try {
      if (recognitionRetryTimeoutRef.current) clearTimeout(recognitionRetryTimeoutRef.current);
      recognition.start();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    } catch (startError) {
      shouldListenRef.current = false;
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
      shouldListenRef.current = false;
      if (recognitionRetryTimeoutRef.current) clearTimeout(recognitionRetryTimeoutRef.current);
      recognitionRef.current.stop(); // Stop listening
      setRecordingState('PAUSED');
      pauseStartRef.current = Date.now();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleResumeRecording() {
    if (!speechSupported) return;
    shouldListenRef.current = true;
    setRecordingState('RECORDING');
    
    if (pauseStartRef.current) {
      totalPausedTimeRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }
    
    // Create new instance to resume
    const recognition = await createRecognitionInstance();
    if (!shouldListenRef.current) return;
    if (recognition) {
      recognitionRef.current = recognition;
      try {
        recognition.start();
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      } catch (err) {
        setSpeechError("Unable to resume speech recognition.");
        setRecordingState('PAUSED');
      }
    } else {
      shouldListenRef.current = false;
      setRecordingState("PAUSED");
      setSpeechError("Speech recognition is unavailable. Your transcript is safe; type your answer instead.");
    }
  }

  function handleStopRecording() {
    shouldListenRef.current = false;
    if (recognitionRetryTimeoutRef.current) clearTimeout(recognitionRetryTimeoutRef.current);
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
    
    if (pauseStartRef.current) {
      totalPausedTimeRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }

    const elapsed = recordingStartRef.current
      ? (Date.now() - recordingStartRef.current - totalPausedTimeRef.current) / 1000
      : 0;
    const finalTranscript = transcriptRef.current.trim();
    if (recordingStartRef.current && finalTranscript) {
      setSpeechAnalysis(buildSpeechAnalysis(finalTranscript, elapsed, resultTimestampsRef.current));
    }
    recordingStartRef.current = 0;
    pauseStartRef.current = 0;
    totalPausedTimeRef.current = 0;
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
        const transcriptToStore = transcript.trim() || undefined;
      const savedAnswer = await submitAnswer(
        interviewId,
        currentQuestion.question_id,
        draft.trim(),
        {
          transcript: transcriptToStore,
          speech_analysis: transcriptToStore ? speechAnalysis || undefined : undefined,
          webcam_metrics: webcamMetrics,
        },
      );
      setAnswers((current) => ({
        ...current,
        [currentQuestion.question_id]: savedAnswer,
      }));
      if (savedAnswer.difficulty_state) setInterviewState((current) => current ? { ...current, interview: { ...current.interview, difficulty: savedAnswer.difficulty_state } } : current);

      setInterviewState((current) => {
        if (!current?.interview) return current;
        let updatedQuestions = current.interview.questions.map((question) =>
          question.question_id === savedAnswer.adapted_question?.question_id
            ? savedAnswer.adapted_question
            : question,
        );
        const followUp = savedAnswer.follow_up_question;
        if (followUp && !updatedQuestions.some((question) => question.question_id === followUp.question_id)) {
          const parentIndex = updatedQuestions.findIndex(
            (question) => question.question_id === currentQuestion.question_id,
          );
          updatedQuestions.splice(parentIndex + 1, 0, followUp);
        }
        return {
          ...current,
          interview: { ...current.interview, questions: updatedQuestions },
        };
      });

      const hasNewFollowUp = Boolean(savedAnswer.follow_up_question);
      const isLastQuestion = currentIndex >= questions.length - 1 && !hasNewFollowUp;
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
              {speechMode ? <p className="mt-2 text-xs font-semibold text-teal-700">{speechMode}</p> : null}
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
