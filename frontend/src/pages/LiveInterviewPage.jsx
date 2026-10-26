import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { completeInterview, getInterview, submitAnswer } from "../api/interviewApi.js";
import { useWebcam } from "../hooks/useWebcam.js";
import { useMediaPipe } from "../hooks/useMediaPipe.js";
import { buildSpeechAnalysis } from "../utils/speechAnalysis.js";
import { createSpeechRecognition, getSpeechRecognitionConstructor, getSpeechRecognitionMode } from "../utils/speechRecognition.js";
import { microphoneDiagnosticMessage, speechRecognitionErrorMessage, testMicrophoneInput, testSpeechRecognition } from "../utils/microphoneDiagnostic.js";
import InterviewerAvatar from "../components/interview/InterviewerAvatar.jsx";
import { getInterviewerState } from "../utils/interviewState.js";
import FloatingWebcamPanel from "../components/interview/FloatingWebcamPanel.jsx";

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function LiveInterviewPage() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [interactionMode, setInteractionMode] = useState("voice");
  const [callActive, setCallActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechActivity, setSpeechActivity] = useState(0);
  const [hasSpeechBoundaryEvents, setHasSpeechBoundaryEvents] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [webcamMetrics, setWebcamMetrics] = useState({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [speechMode, setSpeechMode] = useState("");
  const [microphoneState, setMicrophoneState] = useState("muted");
  const [microphoneTest, setMicrophoneTest] = useState({ running: false, level: 0, kind: "", message: "Run a short microphone test before joining to confirm your browser can hear input." });
  const recognitionRef = useRef(null);
  const recognitionGenerationRef = useRef(0);
  const recognitionEndedRef = useRef(null);
  const recognitionRetriesRef = useRef(0);
  const recognitionRetryTimerRef = useRef(null);
  const shouldListenRef = useRef(false);
  const activeQuestionIdRef = useRef(null);
  const interruptedQuestionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const transcriptRef = useRef("");
  const draftRef = useRef("");
  const timestampsRef = useRef([]);
  const answerStartRef = useRef(0);
  const voiceRef = useRef(null);
  const speechGenerationRef = useRef(0);
  const speechPulseTimeoutRef = useRef(null);
  const interruptionTimeoutRef = useRef(null);
  const { videoRef, error: cameraError } = useWebcam(callActive && cameraOn);
  const { metrics, isReady: cameraAnalysisReady, error: cameraAnalysisError } = useMediaPipe(videoRef, callActive && cameraOn);

  useEffect(() => {
    if (callActive && cameraOn && cameraAnalysisReady && !cameraError) setWebcamMetrics(metrics);
  }, [callActive, cameraOn, metrics, cameraAnalysisReady, cameraError]);

  useEffect(() => {
    let active = true;
    getInterview(interviewId)
      .then((data) => {
        if (!active) return;
        const interview = data.interview;
        const answerMap = Object.fromEntries((data.answers ?? []).map((answer) => [answer.question_id, answer]));
        setSession(data);
        setQuestions(interview.questions ?? []);
        setAnswers(answerMap);
        const firstUnanswered = interview.questions.findIndex((question) => !answerMap[question.question_id]);
        setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
      })
      .catch((requestError) => setError(requestError.response?.data?.detail ?? "Unable to load the interview."))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
      activeQuestionIdRef.current = null;
      shouldListenRef.current = false;
      recognitionGenerationRef.current += 1;
      recognitionRef.current?.abort?.();
      window.clearTimeout(recognitionRetryTimerRef.current);
      window.clearTimeout(interruptionTimeoutRef.current);
      window.clearTimeout(speechPulseTimeoutRef.current);
      speechGenerationRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, [interviewId]);

  const currentQuestion = questions[currentIndex];
  useEffect(() => {
    activeQuestionIdRef.current = currentQuestion?.question_id ?? null;
    interruptedQuestionRef.current = null;
  }, [currentQuestion?.question_id]);
  const completedCount = Object.keys(answers).length;
  const progress = questions.length ? Math.round((completedCount / questions.length) * 100) : 0;
  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);
  const avatarState = getInterviewerState({ callActive, error, wasInterrupted, isSpeaking, isListening });

  function stopSpeechAnimation() {
    window.clearTimeout(speechPulseTimeoutRef.current);
    speechPulseTimeoutRef.current = null;
    setSpeechActivity(0);
    setHasSpeechBoundaryEvents(false);
  }

  const updateTranscript = useCallback((text) => {
    transcriptRef.current = text;
    draftRef.current = text;
    setTranscript(text);
    setDraft(text);
    const elapsed = answerStartRef.current ? (Date.now() - answerStartRef.current) / 1000 : 0;
    setAnalysis(buildSpeechAnalysis(text, elapsed, timestampsRef.current));
  }, []);

  const listen = useCallback((reset = true) => {
    const recognitionGeneration = ++recognitionGenerationRef.current;
    if (!speechSupported) {
      setMicrophoneState("unavailable");
      setError("Live speech recognition is not available in this browser. You can type your answer below.");
      setIsListening(false);
      return;
    }
    if (reset) {
      finalTranscriptRef.current = "";
      transcriptRef.current = "";
      timestampsRef.current = [];
      answerStartRef.current = Date.now();
      setTranscript("");
      setDraft("");
      draftRef.current = "";
      setAnalysis(null);
    }
    recognitionRetriesRef.current = 0;
    shouldListenRef.current = true;
    setMicrophoneState("starting");
    setMicMuted(false);
    setIsListening(true);
    setError("");

    function scheduleRecognitionRetry() {
      if (!shouldListenRef.current || recognitionRetryTimerRef.current) return;
      if (recognitionRetriesRef.current >= 3) {
        shouldListenRef.current = false;
        setIsListening(false);
        setMicMuted(true);
        setMicrophoneState("unavailable");
        setError("Speech recognition stopped after several retries. Your answer is safe; switch to text or restart the microphone.");
        return;
      }
      const delays = [250, 600, 1200];
      const delay = delays[recognitionRetriesRef.current];
      recognitionRetriesRef.current += 1;
      recognitionRetryTimerRef.current = window.setTimeout(() => {
        recognitionRetryTimerRef.current = null;
        void createAndStart();
      }, delay);
    }

    const createAndStart = async () => {
      if (!shouldListenRef.current || recognitionGeneration !== recognitionGenerationRef.current) return;
      setMicrophoneState("starting");
      const questionId = activeQuestionIdRef.current;
      let result;
      try {
        result = await createSpeechRecognition((message) => setError(message));
      } catch {
        shouldListenRef.current = false;
        setIsListening(false);
        setMicMuted(true);
        setMicrophoneState("unavailable");
        setError("Could not start speech recognition. Type your answer or retry the microphone.");
        return;
      }
      const { recognition, processLocally } = result;
      if (!shouldListenRef.current || recognitionGeneration !== recognitionGenerationRef.current || activeQuestionIdRef.current !== questionId) return;
      if (!recognition) {
        shouldListenRef.current = false;
        setIsListening(false);
        setMicMuted(true);
        setMicrophoneState("unavailable");
        setError("Speech recognition is unavailable. You can type your answer.");
        return;
      }
      setSpeechMode(processLocally ? "On-device speech" : "Browser speech service");
      recognition.onresult = (event) => {
        if (recognitionGenerationRef.current !== recognitionGeneration || activeQuestionIdRef.current !== questionId) return;
        let interim = "";
        let receivedPhrase = false;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const phrase = result[0]?.transcript?.trim() ?? "";
          if (phrase) receivedPhrase = true;
          if (result.isFinal && phrase) {
            recognitionRetriesRef.current = 0;
            finalTranscriptRef.current = `${finalTranscriptRef.current} ${phrase}`.trim();
            timestampsRef.current.push((Date.now() - answerStartRef.current) / 1000);
          } else {
            interim += `${phrase} `;
          }
        }
        if (receivedPhrase) setMicrophoneState("speech_detected");
        updateTranscript(`${finalTranscriptRef.current} ${interim}`.trim());
      };
      recognition.onstart = () => {
        if (recognitionGenerationRef.current === recognitionGeneration && activeQuestionIdRef.current === questionId && shouldListenRef.current) setMicrophoneState("listening");
      };
      recognition.onerror = (event) => {
        if (recognitionGenerationRef.current !== recognitionGeneration || activeQuestionIdRef.current !== questionId) return;
        if (event.error === "network") {
          shouldListenRef.current = false;
          setIsListening(false);
          setMicMuted(true);
          setMicrophoneState("network_error");
          setError(speechRecognitionErrorMessage("network"));
        } else if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") {
          shouldListenRef.current = false;
          setIsListening(false);
          setMicMuted(true);
          setMicrophoneState(event.error === "audio-capture" ? "device_error" : "permission_error");
          setError(speechRecognitionErrorMessage(event.error));
        } else if (event.error === "no-speech") {
          setMicrophoneState("no_speech");
          setError(speechRecognitionErrorMessage(event.error));
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          setMicrophoneState("unavailable");
          setError(speechRecognitionErrorMessage(event.error));
        }
      };
      recognition.onend = () => {
        if (recognitionGenerationRef.current !== recognitionGeneration) return;
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        recognitionEndedRef.current?.();
        recognitionEndedRef.current = null;
        if (shouldListenRef.current && activeQuestionIdRef.current === questionId) {
          setMicrophoneState("starting");
          scheduleRecognitionRetry();
        } else {
          setIsListening(false);
          setMicMuted(true);
        }
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        setMicrophoneState("starting");
        scheduleRecognitionRetry();
      }
    };
    void createAndStart();
  }, [speechSupported, updateTranscript]);

  const speak = useCallback((text, onDone) => {
    const generation = ++speechGenerationRef.current;
    const synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") {
      onDone?.();
      return;
    }
    shouldListenRef.current = false;
    window.clearTimeout(recognitionRetryTimerRef.current);
    recognitionRetryTimerRef.current = null;
    recognitionGenerationRef.current += 1;
    setMicMuted(true);
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setIsListening(false);
    setMicrophoneState("muted");
    synth.cancel();
    setIsSpeaking(false);
    window.clearTimeout(speechPulseTimeoutRef.current);
    setSpeechActivity(0);
    setHasSpeechBoundaryEvents(false);
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => {
      if (generation === speechGenerationRef.current) setIsSpeaking(true);
    };
    utterance.onboundary = (event) => {
      if (generation !== speechGenerationRef.current) return;
      if (event.name !== "word" && !(Number.isFinite(event.charLength) && event.charLength > 0)) return;
      setHasSpeechBoundaryEvents(true);
      setSpeechActivity(1);
      window.clearTimeout(speechPulseTimeoutRef.current);
      const boundaryDuration = Number.isFinite(event.charLength) ? event.charLength * 48 : 180;
      speechPulseTimeoutRef.current = window.setTimeout(() => setSpeechActivity(0), Math.max(120, Math.min(320, boundaryDuration)));
    };
    const finishSpeaking = () => {
      if (generation !== speechGenerationRef.current) return;
      window.clearTimeout(speechPulseTimeoutRef.current);
      speechPulseTimeoutRef.current = null;
      setSpeechActivity(0);
      setIsSpeaking(false);
      onDone?.();
    };
    utterance.onend = finishSpeaking;
    utterance.onerror = finishSpeaking;
    synth.speak(utterance);
  }, []);

  function askQuestion(question, first = false) {
    if (!question) return;
    if (interactionMode === "text") {
      setIsSpeaking(false);
      return;
    }
    const leadIn = first ? "Hi, thanks for joining me. Take your time. " : "Thanks, that’s helpful. ";
    speak(`${leadIn}${question.question}`, () => listen(true));
  }

  async function handleJoinCall() {
    if (session.score) {
      navigate(`/interviews/${interviewId}/results`, { replace: true });
      return;
    }
    if (completedCount >= questions.length) {
      try {
        await completeInterview(interviewId);
        navigate(`/interviews/${interviewId}/results`, { replace: true });
      } catch (requestError) {
        setError(requestError.response?.data?.detail ?? "Could not prepare the interview report.");
      }
      return;
    }
    setCallActive(true);
    setMicrophoneState(interactionMode === "voice" ? "starting" : "text_mode");
    if (interactionMode === "voice" && speechSupported) {
      setError("Checking for on-device speech recognition…");
      const mode = await getSpeechRecognitionMode((message) => setError(message));
      setSpeechMode(mode.processLocally ? "On-device speech" : "Browser speech service");
      setError("");
    }
    if (!currentQuestion) {
      handleEndCall();
      return;
    }
    askQuestion(currentQuestion, true);
  }

  async function changeInteractionMode(mode) {
    if (mode === interactionMode) return;
    window.clearTimeout(recognitionRetryTimerRef.current);
    recognitionRetryTimerRef.current = null;
    if (recognitionRef.current) {
      const captured = await stopRecognitionAndWait();
      if (captured) updateTranscript(captured);
    } else {
      shouldListenRef.current = false;
      recognitionGenerationRef.current += 1;
      setIsListening(false);
      setMicMuted(true);
    }
    speechGenerationRef.current += 1;
    window.speechSynthesis?.cancel();
    stopSpeechAnimation();
    setIsSpeaking(false);
    setInteractionMode(mode);
    setMicrophoneState(mode === "text" ? "text_mode" : "muted");
    if (mode === "voice" && callActive) {
      finalTranscriptRef.current = draftRef.current;
      transcriptRef.current = draftRef.current;
      listen(false);
    }
  }

  async function stopRecognitionAndWait() {
    shouldListenRef.current = false;
    window.clearTimeout(recognitionRetryTimerRef.current);
    recognitionRetryTimerRef.current = null;
    const activeRecognition = recognitionRef.current;
    if (activeRecognition) {
      let endTimer;
      await new Promise((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(endTimer);
          resolve();
        };
        recognitionEndedRef.current = finish;
        endTimer = window.setTimeout(finish, 800);
        try {
          activeRecognition.stop();
        } catch {
          finish();
        }
      });
    }
    recognitionGenerationRef.current += 1;
    recognitionRef.current = null;
    setIsListening(false);
    setMicMuted(true);
    setMicrophoneState("muted");
    return transcriptRef.current;
  }

  async function handleSubmitAnswer() {
    if (!currentQuestion || isSaving) return;
    const captured = await stopRecognitionAndWait();
    const spokenAnswer = draftRef.current.trim() || captured.trim();
    if (!spokenAnswer) {
      setError("I didn’t catch an answer. Try the microphone again or type a response.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const duration = answerStartRef.current ? (Date.now() - answerStartRef.current) / 1000 : 0;
      const isSpokenAnswer = interactionMode === "voice" && Boolean(captured.trim());
      const speechAnalysis = isSpokenAnswer ? buildSpeechAnalysis(spokenAnswer, duration, timestampsRef.current) : undefined;
      const saved = await submitAnswer(interviewId, currentQuestion.question_id, spokenAnswer, {
        transcript: isSpokenAnswer ? captured : undefined,
        speech_analysis: speechAnalysis,
        webcam_metrics: cameraOn && cameraAnalysisReady && !cameraError && webcamMetrics.sample_count > 0 && videoRef.current?.readyState >= 2 ? webcamMetrics : {},
        answer_status: interruptedQuestionRef.current === currentQuestion.question_id ? "interrupted" : "answered",
      });
      setAnswers((current) => ({ ...current, [currentQuestion.question_id]: saved }));
      if (saved.answer_status === "evaluation_failed") setError("Your response was saved, but its evaluation was unavailable. It will be labeled separately in the report.");
      let updatedQuestions = questions.map((item) => item.question_id === saved.adapted_question?.question_id ? saved.adapted_question : item);
      if (saved.follow_up_question && !updatedQuestions.some((item) => item.question_id === saved.follow_up_question.question_id)) {
        const parentIndex = updatedQuestions.findIndex((item) => item.question_id === currentQuestion.question_id);
        updatedQuestions.splice(parentIndex + 1, 0, saved.follow_up_question);
      }
      setQuestions(updatedQuestions);
      let nextIndex = currentIndex + 1;
      while (nextIndex < updatedQuestions.length && answers[updatedQuestions[nextIndex].question_id]) nextIndex += 1;
      const nextQuestion = updatedQuestions[nextIndex];
      if (nextQuestion) {
        setCurrentIndex(nextIndex);
        setDraft("");
        draftRef.current = "";
        setTranscript("");
        await wait(900);
        askQuestion(nextQuestion);
      } else {
        await completeInterview(interviewId);
        setCallActive(false);
        navigate(`/interviews/${interviewId}/results`, { replace: true });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail ?? "Could not save this answer. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEndCall() {
    speechGenerationRef.current += 1;
    window.speechSynthesis?.cancel();
    stopSpeechAnimation();
    const captured = await stopRecognitionAndWait();
    try {
      const unsavedAnswer = draftRef.current.trim() || captured.trim();
      if (currentQuestion && unsavedAnswer && !answers[currentQuestion.question_id]) {
        const duration = answerStartRef.current ? (Date.now() - answerStartRef.current) / 1000 : 0;
        const isSpokenAnswer = interactionMode === "voice" && Boolean(captured.trim());
        const speechAnalysis = isSpokenAnswer ? buildSpeechAnalysis(unsavedAnswer, duration, timestampsRef.current) : undefined;
        const saved = await submitAnswer(interviewId, currentQuestion.question_id, unsavedAnswer, {
          transcript: isSpokenAnswer ? captured : undefined,
          speech_analysis: speechAnalysis,
          webcam_metrics: cameraOn && cameraAnalysisReady && !cameraError && webcamMetrics.sample_count > 0 && videoRef.current?.readyState >= 2 ? webcamMetrics : {},
          answer_status: interruptedQuestionRef.current === currentQuestion.question_id ? "interrupted" : "partial",
        });
        setAnswers((current) => ({ ...current, [currentQuestion.question_id]: saved }));
      }
      await completeInterview(interviewId);
      navigate(`/interviews/${interviewId}/results`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail ?? "Could not finish the interview report.");
    } finally {
      setCallActive(false);
      setIsSpeaking(false);
      setMicrophoneState("stopped");
    }
  }

  async function handleSkipQuestion() {
    if (!currentQuestion || isSaving) return;
    if (draft.trim() || transcriptRef.current.trim()) {
      setError("There is an unsaved response. Submit it as a partial answer, or clear it before skipping.");
      return;
    }
    speechGenerationRef.current += 1;
    window.speechSynthesis?.cancel();
    stopSpeechAnimation();
    await stopRecognitionAndWait();
    setIsSaving(true);
    setError("");
    try {
      const saved = await submitAnswer(interviewId, currentQuestion.question_id, "", { answer_status: "skipped" });
      setAnswers((current) => ({ ...current, [currentQuestion.question_id]: saved }));
      const nextIndex = questions.findIndex((question) => question.question_id === currentQuestion.question_id) + 1;
      const nextQuestion = questions.slice(nextIndex).find((question) => !answers[question.question_id]);
      if (nextQuestion) {
        const resolvedIndex = questions.findIndex((question) => question.question_id === nextQuestion.question_id);
        setCurrentIndex(resolvedIndex);
        setDraft("");
        draftRef.current = "";
        setTranscript("");
        await wait(300);
        askQuestion(nextQuestion);
      } else {
        await completeInterview(interviewId);
        setCallActive(false);
        navigate(`/interviews/${interviewId}/results`, { replace: true });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail ?? "Could not mark this question as skipped. Your interview is still open.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleCamera() {
    setCameraOn((value) => !value);
    if (cameraOn) setWebcamMetrics({});
  }

  function toggleMicrophone() {
    if (isListening) {
      void stopRecognitionAndWait();
      return;
    }
    if (interactionMode === "voice" && callActive && !isSpeaking) listen(false);
  }

  async function handleMicrophoneTest() {
    setMicrophoneTest({ running: true, level: 0, kind: "microphone", message: "Allow access if your browser asks, then speak for a moment." });
    try {
      const result = await testMicrophoneInput({ onLevel: (level) => setMicrophoneTest((current) => ({ ...current, level })) });
      setMicrophoneTest({
        running: false,
        level: 0,
        kind: "",
        message: result.signalDetected
          ? `Microphone input detected (peak level ${result.peakLevel}%). The temporary test stream has been released.`
          : "Permission worked, but the test heard no clear input. Check the selected mic, hardware mute, and input volume, then test again.",
      });
    } catch (testError) {
      setMicrophoneTest({ running: false, level: 0, kind: "", message: microphoneDiagnosticMessage(testError) });
    }
  }

  async function handleSpeechRecognitionTest() {
    setMicrophoneTest({ running: true, level: 0, kind: "speech", message: "Speak a short sentence to test live speech recognition." });
    try {
      const result = await testSpeechRecognition();
      setMicrophoneTest({ running: false, level: 0, kind: "", message: `Speech recognition worked${result.processLocally ? " on this device" : " using your browser's speech service"}: “${result.transcript}”` });
    } catch (testError) {
      setMicrophoneTest({ running: false, level: 0, kind: "", message: testError?.message ?? microphoneDiagnosticMessage(testError) });
    }
  }

  function interruptInterviewer() {
    interruptedQuestionRef.current = currentQuestion?.question_id ?? null;
    speechGenerationRef.current += 1;
    window.speechSynthesis?.cancel();
    stopSpeechAnimation();
    setIsSpeaking(false);
    setWasInterrupted(true);
    window.clearTimeout(interruptionTimeoutRef.current);
    interruptionTimeoutRef.current = window.setTimeout(() => setWasInterrupted(false), 650);
    listen(true);
  }

  function chooseVoice() {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
    voiceRef.current = englishVoices.find((voice) => /natural|aria|samantha|jenny|google us english/i.test(voice.name)) ?? englishVoices[0] ?? null;
  }

  useEffect(() => {
    chooseVoice();
    window.speechSynthesis?.addEventListener?.("voiceschanged", chooseVoice);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", chooseVoice);
  }, []);

  const visibleAnalysis = analysis ?? buildSpeechAnalysis(draft, 0, []);

  if (isLoading) return <div className="rounded-xl bg-white p-6 text-sm text-stone-600">Setting up your interview room…</div>;
  if (!session) return <div className="rounded-xl bg-white p-6 text-sm text-rose-700">{error || "Interview not found."}</div>;

  return (
    <section className="animate-rise">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">Live interview room</p><h1 className="mt-1 text-3xl font-black">AI interview call</h1><p className="mt-2 text-sm text-stone-600">Spoken questions, live speech-to-text, and coaching analysis after each answer.</p></div>
        <div className="rounded-full bg-white px-4 py-2 text-xs font-bold text-stone-600 shadow-sm">{completedCount}/{questions.length} answered · {progress}%</div>
      </div>
      {error ? <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_0.75fr]">
        <section className="overflow-hidden rounded-2xl bg-[#151719] p-4 text-white shadow-xl sm:p-6">
          <div className="relative min-h-[460px] overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 via-slate-900 to-teal-950">
            <div className="absolute left-4 top-4 z-40 flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs font-semibold text-white backdrop-blur"><span className={`size-2 rounded-full ${callActive ? isListening ? "bg-emerald-400" : "bg-amber-300" : "bg-stone-400"}`} />{callActive ? isSpeaking ? "Interviewer speaking" : isListening ? microphoneState === "speech_detected" ? "Speech detected" : "Listening for speech" : "Interview active" : "Ready to join"}</div>
            <div className={`interviewer-stage-avatar${cameraOn ? " interviewer-stage-avatar--camera" : ""}`}><InterviewerAvatar state={avatarState} speechActivity={speechActivity} hasSpeechBoundaryEvents={hasSpeechBoundaryEvents} /></div>
            {callActive && cameraOn ? <FloatingWebcamPanel videoRef={videoRef} cameraError={cameraError} onClose={toggleCamera} /> : null}
            {callActive && cameraOn && cameraAnalysisError && !cameraError ? <div className="absolute bottom-28 left-4 z-20 max-w-[45%] rounded-lg bg-amber-200 px-3 py-2 text-xs font-semibold text-amber-950">{cameraAnalysisError}</div> : null}
            <div className="absolute bottom-4 left-4 right-4 z-20 max-h-28 overflow-auto rounded-xl bg-black/65 p-4 pr-5 backdrop-blur sm:left-1/2 sm:right-auto sm:w-[min(70%,680px)] sm:-translate-x-1/2"><p className="text-[10px] font-bold uppercase tracking-widest text-teal-200">{currentQuestion ? `${currentQuestion.skill} · ${currentQuestion.difficulty}` : "Interview complete"}</p><p className="mt-1 text-sm font-semibold leading-5 sm:text-base sm:leading-6">{currentQuestion?.question ?? "Your report is ready."}</p></div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {!callActive ? <>
              <div className="inline-flex rounded-full border border-white/15 bg-black/20 p-1" role="group" aria-label="Interview response mode">
                <button aria-pressed={interactionMode === "voice"} className={`rounded-full px-4 py-2 text-sm font-bold ${interactionMode === "voice" ? "bg-teal-400 text-stone-950" : "text-white"}`} onClick={() => changeInteractionMode("voice")} type="button">Voice</button>
                <button aria-pressed={interactionMode === "text"} className={`rounded-full px-4 py-2 text-sm font-bold ${interactionMode === "text" ? "bg-teal-400 text-stone-950" : "text-white"}`} onClick={() => changeInteractionMode("text")} type="button">Text</button>
              </div>
              {interactionMode === "voice" ? <button className="rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20 disabled:cursor-wait disabled:opacity-60" disabled={microphoneTest.running} onClick={handleMicrophoneTest} type="button">{microphoneTest.running && microphoneTest.kind === "microphone" ? "Testing microphone…" : "Test microphone"}</button> : null}
              {interactionMode === "voice" && speechSupported ? <button className="rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20 disabled:cursor-wait disabled:opacity-60" disabled={microphoneTest.running} onClick={handleSpeechRecognitionTest} type="button">{microphoneTest.running && microphoneTest.kind === "speech" ? "Testing speech…" : "Test speech recognition"}</button> : null}
              <button className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-black text-stone-950 hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60" disabled={microphoneTest.running} onClick={handleJoinCall} type="button">Join call</button>
            </> : <>
              <button className="rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20" onClick={toggleCamera} type="button">{cameraOn ? "Turn camera off" : "Turn camera on"}</button>
              <button className="rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20" onClick={() => changeInteractionMode(interactionMode === "voice" ? "text" : "voice")} type="button">Switch to {interactionMode === "voice" ? "text" : "voice"}</button>
              {interactionMode === "voice" ? <button aria-label={micMuted ? "Unmute microphone" : "Mute microphone"} className="rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20" onClick={toggleMicrophone} type="button">{micMuted ? "Unmute mic" : "Mute mic"}</button> : null}
              {isSpeaking ? <button className="rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20" onClick={interruptInterviewer} type="button">Interrupt & answer</button> : null}
              <button className="rounded-full bg-teal-400 px-5 py-3 text-sm font-black text-stone-950 hover:bg-teal-300 disabled:opacity-40" disabled={isSaving || isSpeaking} onClick={handleSubmitAnswer} type="button">{isSaving ? "Saving answer…" : isListening ? "Finish answer" : "Submit answer"}</button>
              <button className="rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20 disabled:opacity-40" disabled={isSaving || Boolean(draft.trim())} onClick={handleSkipQuestion} type="button">Skip question</button>
              <button className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-500 disabled:opacity-50" disabled={isSaving} onClick={handleEndCall} type="button">End call & report</button>
            </>}
          </div>
          {interactionMode === "voice" && !callActive ? <div className="mt-3 rounded-xl border border-white/15 bg-black/20 p-3 text-xs text-slate-200" role="status" aria-live="polite">
            <div className="mb-1 flex items-center justify-between gap-3"><span className="font-bold">Microphone input level</span><span>{microphoneTest.running ? `${microphoneTest.level}%` : "Test mode"}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15" role="meter" aria-label="Microphone input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={microphoneTest.level}><div className="h-full rounded-full bg-teal-300 transition-[width] duration-75" style={{ width: `${microphoneTest.level}%` }} /></div>
            <p className="mt-2">{microphoneTest.message}</p>
            <p className="mt-1 text-slate-400">The test releases its temporary stream before browser speech recognition starts. During an interview, this browser API confirms input when transcript text arrives but does not expose a continuous level meter.</p>
          </div> : null}
          {callActive && interactionMode === "voice" ? <p className="mt-3 text-center text-xs text-slate-300" role="status" aria-live="polite">Microphone: {microphoneState === "starting" ? "starting browser recognition" : microphoneState === "listening" ? "listening; waiting for speech" : microphoneState === "speech_detected" ? "speech received by browser recognition" : microphoneState === "permission_error" ? "permission denied" : microphoneState === "device_error" ? "input device unavailable" : microphoneState === "network_error" ? "speech service network error" : microphoneState === "no_speech" ? "no speech detected" : microphoneState === "unavailable" ? "speech recognition unavailable" : "muted"}. Typed answers remain available.</p> : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="font-bold">Live transcript</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${isListening ? "bg-rose-100 text-rose-700" : "bg-stone-100 text-stone-500"}`}>{isListening ? "Listening" : isSpeaking ? "Interviewer speaking" : "Paused"}</span></div>
            {speechMode ? <p className="mt-2 text-[11px] font-semibold text-teal-700">{speechMode}</p> : null}
            <div className="mt-3 min-h-32 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-700">{transcript || "Your recognized words will appear here as you speak."}</div>
            <label className="mt-3 block text-xs font-bold text-stone-500">{interactionMode === "text" ? "Type your answer" : "Edit or type your answer"}<textarea className="mt-1 min-h-20 w-full rounded-lg border border-stone-200 p-3 text-sm" onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value); }} value={draft} /></label>
            {!speechSupported ? <p className="mt-2 text-xs text-amber-700">This browser does not expose SpeechRecognition. Typed answers are available in this room.</p> : null}
            <p className="mt-2 text-[11px] leading-4 text-stone-400">Voice mode uses on-device speech where supported, otherwise the browser’s speech service. Webcam is off until you enable it; its estimates run locally. The app stores answer transcripts and derived metrics, not raw microphone or video recordings.</p>
          </section>
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">Answer signals</h2><p className="mt-1 text-xs text-stone-500">Updates from the live transcript; final scoring is saved after submission.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">{[["Words", visibleAnalysis.word_count], ["Fillers", visibleAnalysis.filler_count], ["Pace", `${Math.round(visibleAnalysis.words_per_minute)} WPM`], ["Pauses", visibleAnalysis.pause_count]].map(([label, value]) => <div className="rounded-lg bg-stone-50 p-3" key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{label}</p><p className="mt-1 text-xl font-black text-stone-900">{value}</p></div>)}</div>
            {cameraOn ? <><p className="mt-4 text-xs font-semibold text-stone-600">Camera estimates (local, approximate)</p><div className="mt-2 grid grid-cols-3 gap-2 text-center">{[["Face visible", `${webcamMetrics.face_visibility_pct ?? 0}%`], ["In frame", `${webcamMetrics.centered_frame_pct ?? 0}%`], ["Movement", webcamMetrics.head_movement_index ?? 0]].map(([label, value]) => <div className="rounded-lg bg-stone-50 p-2" key={label}><p className="text-[10px] text-stone-500">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>)}</div><p className="mt-2 text-[10px] leading-4 text-stone-400">These describe face tracking and framing only; they do not measure confidence, emotion, or interview performance.</p></> : null}
          </section>
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Interview progress</h2><div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-stone-500">Question {Math.min(currentIndex + 1, questions.length)} of {questions.length}. Answers are analyzed by the same service used in practice mode.</p></section>
        </aside>
      </div>
    </section>
  );
}
