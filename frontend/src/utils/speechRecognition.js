let recognitionModePromise;

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export async function getSpeechRecognitionMode(onStatus = () => {}) {
  if (!recognitionModePromise) {
    recognitionModePromise = (async () => {
      const SpeechRecognition = getSpeechRecognitionConstructor();
      if (!SpeechRecognition) return { SpeechRecognition: null, processLocally: false };
      if (typeof SpeechRecognition.available !== "function" || typeof SpeechRecognition.install !== "function") {
        return { SpeechRecognition, processLocally: false };
      }

      const options = { langs: [navigator.language || "en-US"], processLocally: true, quality: "dictation" };
      try {
        let availability = await SpeechRecognition.available(options);
        if (availability === "downloadable" || availability === "downloading") {
          onStatus("Preparing offline speech recognition. This language pack downloads once to this device.");
          const installed = await SpeechRecognition.install(options);
          availability = installed ? "available" : "unavailable";
        }
        return { SpeechRecognition, processLocally: availability === "available" };
      } catch {
        return { SpeechRecognition, processLocally: false };
      }
    })().catch(() => ({ SpeechRecognition: getSpeechRecognitionConstructor(), processLocally: false }));
  }
  return recognitionModePromise;
}

export async function createSpeechRecognition(onStatus) {
  const mode = await getSpeechRecognitionMode(onStatus);
  if (!mode.SpeechRecognition) return { recognition: null, processLocally: false };
  const recognition = new mode.SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  if (mode.processLocally && "processLocally" in recognition) recognition.processLocally = true;
  return { recognition, processLocally: mode.processLocally };
}

export function resetSpeechRecognitionModeForTests() {
  recognitionModePromise = undefined;
}
