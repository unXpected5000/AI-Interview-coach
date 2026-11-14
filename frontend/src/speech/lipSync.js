// Approximate mouth shapes from the voice audio's frequency spectrum. This is
// audio-driven animation, not phoneme-accurate visemes: loudness opens the
// jaw, bright (high-frequency) sounds widen the lips (ee, s), and dark
// low-frequency vowels round them (oo, oh).

function bandEnergy(spectrum, sampleRate, lowHz, highHz) {
  const binHz = sampleRate / 2 / spectrum.length;
  const start = Math.max(0, Math.floor(lowHz / binHz));
  const end = Math.min(spectrum.length, Math.ceil(highHz / binHz));
  if (end <= start) return 0;
  let total = 0;
  for (let index = start; index < end; index += 1) total += spectrum[index];
  return total / (end - start) / 255;
}

export function mouthShapeFromSpectrum(spectrum, sampleRate = 24000) {
  if (!spectrum?.length) return { level: 0, open: 0, wide: 0, round: 0 };
  const low = bandEnergy(spectrum, sampleRate, 80, 500);
  const mid = bandEnergy(spectrum, sampleRate, 500, 2000);
  const high = bandEnergy(spectrum, sampleRate, 2000, 6000);
  const level = Math.min(1, (low + mid + high) / 1.4);
  if (level < 0.04) return { level: 0, open: 0, wide: 0, round: 0 };
  const total = low + mid + high || 1;
  const brightness = high / total;
  const darkness = low / total;
  return {
    level,
    open: Math.min(1, level * 1.6),
    wide: Math.min(1, Math.max(0, (brightness - 0.18) * 3)),
    round: Math.min(1, Math.max(0, (darkness - 0.45) * 2.5)),
  };
}

/** Smooth successive mouth shapes so the animation doesn't jitter. */
export function smoothMouth(previous, next, attack = 0.55, release = 0.25) {
  const blend = (a = 0, b = 0) => a + (b - a) * (b > a ? attack : release);
  return {
    level: blend(previous?.level, next.level),
    open: blend(previous?.open, next.open),
    wide: blend(previous?.wide, next.wide),
    round: blend(previous?.round, next.round),
  };
}
