const FILLER_PHRASES = [
  "you know",
  "sort of",
  "kind of",
  "actually",
  "basically",
  "um",
  "uh",
  "like",
  "i mean",
  "right",
  "well",
  "so to speak",
  "at the end of the day",
  "literally",
  "seriously",
  "honestly",
];

export function buildSpeechAnalysis(transcript, durationSeconds = 0, resultTimestamps = []) {
  const normalized = normalizeTranscript(transcript);
  const words = normalized ? normalized.split(" ") : [];
  const wordCount = words.filter(Boolean).length;
  const safeDuration = Number(durationSeconds) > 0 ? Number(durationSeconds) : 0;
  const wordsPerMinute = safeDuration > 0 ? Number(((wordCount / safeDuration) * 60).toFixed(2)) : 0;
  
  const { count: fillerCount, breakdown: fillerBreakdown } = countFillersDetailed(normalized);
  const fillerRate = wordCount > 0 ? Number((fillerCount / wordCount).toFixed(4)) : 0;

  // Real timestamps logic if provided
  let realPauseCount = 0;
  let longestPause = 0;
  let speakingConsistency = 100;
  let avgPauseDuration = 0;

  if (resultTimestamps && resultTimestamps.length > 1) {
    let pauses = [];
    let lastTime = 0;
    
    for (let i = 0; i < resultTimestamps.length; i++) {
      const current = resultTimestamps[i];
      const gap = current - lastTime;
      if (gap > 2.0) { // Gap > 2s is considered a significant pause
        pauses.push(gap);
        realPauseCount++;
        if (gap > longestPause) longestPause = gap;
      }
      lastTime = current;
    }

    if (pauses.length > 0) {
      avgPauseDuration = pauses.reduce((a, b) => a + b, 0) / pauses.length;
      
      // speaking consistency drops based on high standard deviation of pauses or too many long pauses
      const variance = pauses.reduce((a, b) => a + Math.pow(b - avgPauseDuration, 2), 0) / pauses.length;
      const stdDev = Math.sqrt(variance);
      speakingConsistency = Math.max(0, 100 - (stdDev * 5) - (realPauseCount * 2));
    } else {
      speakingConsistency = 100;
    }
  } else {
    // Punctuation is not evidence of a spoken pause. Leave timing metrics at zero
    // when browser recognition timestamps are unavailable.
  }

  return {
    word_count: wordCount,
    duration_seconds: Number(safeDuration.toFixed(2)),
    words_per_minute: wordsPerMinute,
    filler_count: fillerCount,
    filler_rate: fillerRate,
    filler_breakdown: fillerBreakdown,
    pause_count: realPauseCount,
    longest_pause_seconds: Number(longestPause.toFixed(2)),
    avg_pause_duration: Number(avgPauseDuration.toFixed(2)),
    speaking_consistency: Math.round(speakingConsistency),
    result_timestamps: Array.isArray(resultTimestamps) ? [...resultTimestamps] : [],
  };
}

function countFillersDetailed(normalizedTranscript) {
  let remaining = normalizedTranscript;
  let count = 0;
  const breakdown = {};

  for (const filler of [...FILLER_PHRASES].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`\\b${escapeRegExp(filler)}\\b`, "gi");
    const matches = remaining.match(pattern);
    if (matches) {
      count += matches.length;
      breakdown[filler] = matches.length;
      remaining = remaining.replace(pattern, " ");
    }
  }

  return { count, breakdown };
}

function normalizeTranscript(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
