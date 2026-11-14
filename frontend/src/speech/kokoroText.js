// Text preparation for the Kokoro-82M voice model.
// Adapted from kokoro-js 1.2.1 (https://github.com/hexgrad/kokoro, Apache-2.0,
// Copyright the kokoro-js authors): text normalisation, phoneme post-processing,
// and voice-style selection. Pure functions so they can be unit-tested.

const PUNCTUATION = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCTUATION_PATTERN = new RegExp(
  `(\\s*[${PUNCTUATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+\\s*)+`,
  "g",
);

function speakYear(match) {
  if (match.includes(".")) return match;
  if (match.includes(":")) {
    const [hours, minutes] = match.split(":").map(Number);
    if (minutes === 0) return `${hours} o'clock`;
    return minutes < 10 ? `${hours} oh ${minutes}` : `${hours} ${minutes}`;
  }
  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;
  const left = match.slice(0, 2);
  const right = parseInt(match.slice(2, 4), 10);
  const suffix = match.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${suffix}`;
    if (right < 10) return `${left} oh ${right}${suffix}`;
  }
  return `${left} ${right}${suffix}`;
}

function speakMoney(match) {
  const unit = match[0] === "$" ? "dollar" : "pound";
  if (Number.isNaN(Number(match.slice(1)))) return `${match.slice(1)} ${unit}s`;
  if (!match.includes(".")) return `${match.slice(1)} ${unit}${match.slice(1) === "1" ? "" : "s"}`;
  const [whole, fraction] = match.slice(1).split(".");
  const cents = parseInt(fraction.padEnd(2, "0"), 10);
  const small = match[0] === "$" ? (cents === 1 ? "cent" : "cents") : cents === 1 ? "penny" : "pence";
  return `${whole} ${unit}${whole === "1" ? "" : "s"} and ${cents} ${small}`;
}

function speakDecimal(match) {
  const [whole, fraction] = match.split(".");
  return `${whole} point ${fraction.split("").join(" ")}`;
}

/** Normalise written text into speakable text before phonemisation. */
export function normalizeForSpeech(text) {
  return String(text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“")
    .replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«")
    .replace(/\)/g, "»")
    .replace(/[^\S \n]/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, speakYear)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, speakMoney)
    .replace(/\d*\.\d+/g, speakDecimal)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (match) => match.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

/** Split text into punctuation and word runs; only word runs are phonemised. */
export function splitOnPunctuation(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(PUNCTUATION_PATTERN)) {
    if (last < match.index) parts.push({ match: false, text: text.slice(last, match.index) });
    if (match[0].length) parts.push({ match: true, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ match: false, text: text.slice(last) });
  return parts;
}

/** Kokoro-specific phoneme fixes applied after espeak-ng. */
export function postProcessPhonemes(phonemes, american = true) {
  let result = phonemes
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");
  if (american) result = result.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  return result.trim();
}

/** Each voice file holds 510 style vectors of 256 floats, indexed by token count. */
export function styleOffset(tokenCount) {
  return 256 * Math.min(Math.max(tokenCount - 2, 0), 509);
}

/**
 * Split text into short sentences so speech can start after the first one is
 * generated while later ones are still being synthesised.
 */
export function splitIntoSentences(text, maxLength = 140) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [clean];
  const result = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLength) {
      result.push(sentence);
      continue;
    }
    // Break long sentences at commas so no single chunk takes too long.
    let current = "";
    for (const piece of sentence.split(/(?<=,)\s+/)) {
      if ((current + " " + piece).trim().length > maxLength && current) {
        result.push(current.trim());
        current = piece;
      } else {
        current = `${current} ${piece}`;
      }
    }
    if (current.trim()) result.push(current.trim());
  }
  return result;
}
