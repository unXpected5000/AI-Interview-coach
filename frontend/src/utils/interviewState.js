export function getInterviewerState({ callActive, error = "", wasInterrupted = false, isSpeaking = false, isListening = false }) {
  if (!callActive) return "idle";
  if (error.toLowerCase().includes("speech") || error.toLowerCase().includes("network")) return "disconnected";
  if (wasInterrupted) return "interrupted";
  if (isSpeaking) return "speaking";
  if (isListening) return "listening";
  return "thinking";
}
