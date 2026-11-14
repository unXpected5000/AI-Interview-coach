// Behaviour model for the interviewer avatar: blinking, gaze, expressions,
// head motion and breathing. Pure functions of time and state so both the
// built-in avatar and an optional realistic .glb avatar use the same "acting".

/** Expression targets (0-1) for each conversation state. */
export const EXPRESSIONS = {
  idle: { smile: 0.35, browRaise: 0.1, browFrown: 0, eyeWide: 0.05 },
  speaking: { smile: 0.18, browRaise: 0.2, browFrown: 0, eyeWide: 0.1 },
  listening: { smile: 0.25, browRaise: 0.28, browFrown: 0, eyeWide: 0.15 },
  thinking: { smile: 0.05, browRaise: 0, browFrown: 0.45, eyeWide: 0 },
  interrupted: { smile: 0.15, browRaise: 0.45, browFrown: 0, eyeWide: 0.3 },
  disconnected: { smile: 0, browRaise: 0, browFrown: 0.2, eyeWide: 0 },
};

/** Deterministic pseudo-random number in [0, 1) for a step index. */
export function hashNoise(step, salt = 0) {
  const x = Math.sin(step * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Blink amount (0 open - 1 closed) at time t (seconds). Blinks come every
 * 2-6 seconds, last ~150 ms, and occasionally double.
 */
export function blinkAmount(t) {
  let start = 0;
  for (let step = 0; step < 10000; step += 1) {
    const gap = 2 + hashNoise(step, 1) * 4;
    const next = start + gap;
    if (t < next + 0.4) {
      const local = t - next;
      const closed = (offset) => {
        const phase = (local - offset) / 0.15;
        return phase > 0 && phase < 1 ? Math.sin(phase * Math.PI) : 0;
      };
      const isDouble = hashNoise(step, 2) > 0.82;
      return Math.max(closed(0), isDouble ? closed(0.22) : 0);
    }
    start = next;
  }
  return 0;
}

/** Eye direction (-1..1 x/y). Listening holds eye contact; thinking looks up and away. */
export function gazeAt(t, state) {
  const step = Math.floor(t / 1.7);
  const jitterX = (hashNoise(step, 3) - 0.5) * 0.25;
  const jitterY = (hashNoise(step, 4) - 0.5) * 0.15;
  if (state === "thinking") return { x: -0.55 + jitterX * 0.5, y: 0.45 + jitterY * 0.5 };
  if (state === "listening") return { x: jitterX * 0.35, y: jitterY * 0.35 };
  if (state === "speaking") {
    // Speakers glance away briefly about a quarter of the time.
    const glance = hashNoise(step, 5) > 0.75;
    return glance ? { x: (hashNoise(step, 6) - 0.5) * 0.9, y: 0.15 } : { x: jitterX * 0.4, y: jitterY * 0.4 };
  }
  return { x: jitterX, y: jitterY };
}

/** Head rotation in radians (pitch = nod, yaw = turn, roll = tilt). */
export function headMotion(t, state, speechLevel = 0, reducedMotion = false) {
  if (reducedMotion) return { pitch: 0, yaw: 0, roll: 0 };
  const sway = { pitch: Math.sin(t * 0.7) * 0.012, yaw: Math.sin(t * 0.43) * 0.02, roll: Math.sin(t * 0.31) * 0.01 };
  if (state === "listening") {
    // Small nods every few seconds and a slight attentive tilt.
    const nodPhase = (t % 3.6) / 3.6;
    const nod = nodPhase < 0.18 ? Math.sin((nodPhase / 0.18) * Math.PI * 2) * 0.045 : 0;
    return { pitch: sway.pitch + nod, yaw: sway.yaw * 0.6, roll: 0.05 + sway.roll };
  }
  if (state === "thinking") return { pitch: -0.04 + sway.pitch, yaw: -0.08 + sway.yaw, roll: -0.03 };
  if (state === "speaking") {
    // Emphasis follows speech loudness.
    return { pitch: sway.pitch + speechLevel * 0.05, yaw: sway.yaw + Math.sin(t * 1.9) * 0.025, roll: sway.roll };
  }
  return sway;
}

/** Breathing: 0-1 cycle at about 15 breaths per minute. */
export function breath(t) {
  return (Math.sin(t * Math.PI * 0.5) + 1) / 2;
}

/** Move a value toward a target with exponential smoothing. */
export function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Blend the current expression toward the state's targets. */
export function blendExpression(current, state, dt) {
  const target = EXPRESSIONS[state] ?? EXPRESSIONS.idle;
  return Object.fromEntries(Object.entries(target).map(([key, value]) => [key, approach(current?.[key] ?? 0, value, 4, dt)]));
}

// ARKit blendshape names used by most realistic avatars (Avaturn, Mixamo-converted,
// Character Creator exports), plus Oculus visemes when present.
export function blendshapeWeights({ mouth, blink, gaze, expression }) {
  const open = mouth?.open ?? 0;
  const wide = mouth?.wide ?? 0;
  const round = mouth?.round ?? 0;
  const smile = expression?.smile ?? 0;
  return {
    jawOpen: open * 0.65,
    mouthClose: 0,
    mouthFunnel: round * 0.5,
    mouthPucker: round * 0.35,
    mouthStretchLeft: wide * 0.35,
    mouthStretchRight: wide * 0.35,
    mouthSmileLeft: smile * 0.55 + wide * 0.1,
    mouthSmileRight: smile * 0.55 + wide * 0.1,
    eyeBlinkLeft: blink,
    eyeBlinkRight: blink,
    eyeWideLeft: expression?.eyeWide ?? 0,
    eyeWideRight: expression?.eyeWide ?? 0,
    eyeLookInLeft: Math.max(0, gaze.x) * 0.6,
    eyeLookOutLeft: Math.max(0, -gaze.x) * 0.6,
    eyeLookInRight: Math.max(0, -gaze.x) * 0.6,
    eyeLookOutRight: Math.max(0, gaze.x) * 0.6,
    eyeLookUpLeft: Math.max(0, gaze.y) * 0.6,
    eyeLookUpRight: Math.max(0, gaze.y) * 0.6,
    eyeLookDownLeft: Math.max(0, -gaze.y) * 0.6,
    eyeLookDownRight: Math.max(0, -gaze.y) * 0.6,
    browInnerUp: (expression?.browRaise ?? 0) * 0.7,
    browOuterUpLeft: (expression?.browRaise ?? 0) * 0.5,
    browOuterUpRight: (expression?.browRaise ?? 0) * 0.5,
    browDownLeft: (expression?.browFrown ?? 0) * 0.6,
    browDownRight: (expression?.browFrown ?? 0) * 0.6,
    viseme_aa: open * Math.max(0, 1 - wide - round),
    viseme_E: open * wide * 0.8,
    viseme_I: open * wide * 0.5,
    viseme_O: open * round * 0.8,
    viseme_U: round * 0.6,
  };
}
