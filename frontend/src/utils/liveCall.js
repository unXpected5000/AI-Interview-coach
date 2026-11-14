// Pure helpers for the live interview's turn-taking. Kept free of React and
// browser APIs so the pacing rules can be unit-tested.

const ACKNOWLEDGEMENTS = [
  "Thanks.",
  "Okay, thank you.",
  "Got it, thanks for walking me through that.",
  "Thanks, that's helpful.",
  "Alright.",
];

/** Short spoken bridge before the next question, varied so it sounds less scripted. */
export function bridgeBeforeQuestion({ first = false, previousStatus = "answered", isFollowUp = false, turn = 0 } = {}) {
  if (first) return "Hi, thanks for joining. Take your time with each answer. ";
  if (previousStatus === "skipped") return "No problem, let's move on. ";
  const acknowledgement = ACKNOWLEDGEMENTS[Math.abs(turn) % ACKNOWLEDGEMENTS.length];
  return isFollowUp ? `${acknowledgement} I'd like to follow up on that. ` : `${acknowledgement} Next question. `;
}

/**
 * Hands-free mode: finish the answer after a pause. Only fires after real
 * speech activity, a minimum number of words, and a sustained silence.
 */
export function shouldAutoFinish({ enabled, listening, busy, lastSpeechAt, now, wordCount, silenceMs = 4000, minWords = 8 }) {
  if (!enabled || !listening || busy || !lastSpeechAt) return false;
  if ((wordCount ?? 0) < minWords) return false;
  return now - lastSpeechAt >= silenceMs;
}

/** Upper bound for how long the browser should take to speak `text`, used as a watchdog. */
export function speechWatchdogMs(text, rate = 1) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = 2.4 * Math.max(0.5, rate);
  return Math.round((words / wordsPerSecond) * 1000 * 1.6 + 4000);
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** One clear label for whose turn it is. */
export function turnLabel({ callActive, isSpeaking, isListening, isSaving, microphoneState, interactionMode }) {
  if (!callActive) return { tone: "idle", text: "Ready to join" };
  if (isSaving) return { tone: "thinking", text: microphoneState === "transcribing" ? "Finalizing your transcript…" : "Interviewer is reviewing your answer…" };
  if (isSpeaking) return { tone: "interviewer", text: "Interviewer is speaking — you can interrupt" };
  if (interactionMode === "text") return { tone: "you", text: "Your turn — type your answer" };
  if (isListening) return { tone: "you", text: microphoneState === "speech_detected" ? "Your turn — listening" : "Your turn — speak when ready" };
  return { tone: "paused", text: "Microphone paused — unmute or type to answer" };
}

/** What the interviewer says: greeting or acknowledgement, transition, then the question. */
export function spokenQuestion(question, { first, previousStatus, turn }) {
  const transition = String(question.transition ?? "").trim();
  if (!transition) {
    return `${bridgeBeforeQuestion({ first, previousStatus, isFollowUp: question.follow_up_for != null, turn })}${question.question}`;
  }
  const opener = first ? "Hi, thanks for joining. Take your time with each answer. " : previousStatus === "skipped" ? "No problem. " : "";
  const body = /,$/.test(transition) ? question.question.replace(/^[A-Z](?![A-Z])/, (letter) => letter.toLowerCase()) : question.question;
  return `${opener}${transition} ${body}`;
}
