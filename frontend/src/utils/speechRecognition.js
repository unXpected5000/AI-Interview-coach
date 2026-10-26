let recognitionModePromise;

const RECOGNITION_RETRY_DELAYS_MS = [500, 1200, 2500];
export const MAX_SPEECH_RECOGNITION_RETRIES = RECOGNITION_RETRY_DELAYS_MS.length;

export function isSpeechRecognitionSecureContext(browserWindow = globalThis.window) {
  if (!browserWindow) return false;
  const hostname = browserWindow.location?.hostname?.toLowerCase() ?? "";
  const isLoopback = hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
  return browserWindow.isSecureContext === true || isLoopback;
}

export function getSpeechRecognitionRetryDelay(retryCount) {
  return RECOGNITION_RETRY_DELAYS_MS[retryCount] ?? null;
}

export function scheduleSpeechRecognitionRestart(retryCount, restart, schedule = globalThis.setTimeout) {
  const delayMs = getSpeechRecognitionRetryDelay(retryCount);
  if (delayMs === null) return null;
  return {
    delayMs,
    attempt: retryCount + 1,
    timer: schedule(restart, delayMs),
  };
}

export function collectSpeechRecognitionResults(event, seenFinalResultIndexes = new Set()) {
  const finalPhrases = [];
  const interimPhrases = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const phrase = result[0]?.transcript?.trim() ?? "";
    if (!phrase) continue;
    if (result.isFinal) {
      if (!seenFinalResultIndexes.has(index)) {
        seenFinalResultIndexes.add(index);
        finalPhrases.push(phrase);
      }
    } else {
      interimPhrases.push(phrase);
    }
  }
  return { finalPhrases, interimTranscript: interimPhrases.join(" ").trim() };
}

export function isCurrentSpeechRecognitionEvent(
  recognition,
  activeRecognition,
  generation,
  activeGeneration,
  questionId,
  activeQuestionId,
) {
  return recognition === activeRecognition
    && generation === activeGeneration
    && questionId === activeQuestionId;
}

export function resolveInterviewAnswer(draft, finalTranscript, manuallyEdited = false) {
  return manuallyEdited ? String(draft ?? "").trim() : String(finalTranscript ?? "").trim();
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export async function getSpeechRecognitionMode(onStatus = () => {}) {
  if (!recognitionModePromise) {
    recognitionModePromise = (async () => {
      const SpeechRecognition = getSpeechRecognitionConstructor();
      if (!SpeechRecognition) return { SpeechRecognition: null, processLocally: false, unavailableReason: "unsupported" };
      if (!isSpeechRecognitionSecureContext()) {
        return { SpeechRecognition: null, processLocally: false, unavailableReason: "secure_context" };
      }
      const preferredLanguage = globalThis.navigator?.language || "en-US";
      if (typeof SpeechRecognition.available !== "function" || typeof SpeechRecognition.install !== "function") {
        return { SpeechRecognition, processLocally: false, language: preferredLanguage };
      }

      const preferredBaseLanguage = preferredLanguage.split("-")[0].toLowerCase();
      const localLanguages = [...new Set([
        preferredLanguage,
        ...(preferredBaseLanguage === "en" ? ["en-US", "en-GB"] : []),
      ])];
      for (const language of localLanguages) {
        const options = { langs: [language], processLocally: true, quality: "dictation" };
        try {
          let availability = await SpeechRecognition.available(options);
          if (availability === "downloadable" || availability === "downloading") {
            onStatus("Preparing offline speech recognition. This language pack downloads once to this device.");
            const installed = await SpeechRecognition.install(options);
            availability = installed ? "available" : "unavailable";
          }
          if (availability === "available") {
            return { SpeechRecognition, processLocally: true, language };
          }
        } catch {
          // Try the next suitable local language before falling back to the browser service.
        }
      }
      return { SpeechRecognition, processLocally: false, language: preferredLanguage };
    })().catch(() => {
      const supported = getSpeechRecognitionConstructor();
      if (!isSpeechRecognitionSecureContext()) {
        return { SpeechRecognition: null, processLocally: false, unavailableReason: "secure_context" };
      }
      return { SpeechRecognition: supported, processLocally: false, unavailableReason: supported ? null : "unsupported" };
    });
  }
  return recognitionModePromise;
}

export async function createSpeechRecognition(onStatus) {
  const mode = await getSpeechRecognitionMode(onStatus);
  if (!mode.SpeechRecognition) return { recognition: null, processLocally: false, unavailableReason: mode.unavailableReason };
  const recognition = new mode.SpeechRecognition();
  recognition.lang = mode.language || globalThis.navigator?.language || "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  if (mode.processLocally && "processLocally" in recognition) recognition.processLocally = true;
  return { recognition, processLocally: mode.processLocally, unavailableReason: null };
}

export function resetSpeechRecognitionModeForTests() {
  recognitionModePromise = undefined;
}
