/** Workout feedback: short synthesized sounds (Web Audio, no assets) paired with vibration patterns. */
export type Cue = "tap" | "record" | "rep" | "milestone" | "tick" | "go" | "work" | "rest" | "finish" | "complete" | "error";

const prefs = { sound: true, haptics: true, volume: 0.6 };
let ctx: AudioContext | null = null;

export function loadSoundPrefs() {
  try { const raw = JSON.parse(localStorage.getItem("reps-sound") || "{}"); prefs.sound = raw.sound ?? true; prefs.volume = raw.volume ?? 0.6; } catch {}
  return { sound: prefs.sound, volume: prefs.volume };
}
export function setSoundPrefs(next: { sound?: boolean; volume?: number }) {
  Object.assign(prefs, next);
  try { localStorage.setItem("reps-sound", JSON.stringify({ sound: prefs.sound, volume: prefs.volume })); } catch {}
}
export const setHaptics = (on: boolean) => { prefs.haptics = on; };

/** Must run inside a user gesture once so mobile browsers allow audio. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, start: number, ms: number, type: OscillatorType = "sine", gain = 1) {
  if (!ctx) return;
  const osc = ctx.createOscillator(), amp = ctx.createGain();
  const t0 = ctx.currentTime + start / 1000, peak = prefs.volume * 0.35 * gain;
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + ms / 1000 + 0.02);
}

const SOUNDS: Record<Cue, () => void> = {
  tap: () => tone(660, 0, 60, "triangle", 0.5),
  record: () => { tone(523, 0, 90, "triangle"); tone(784, 70, 140, "triangle"); },
  rep: () => tone(880, 0, 70, "square", 0.25),
  milestone: () => { tone(659, 0, 110); tone(880, 90, 110); tone(1175, 180, 200); },
  tick: () => tone(1000, 0, 80, "sine", 0.6),
  go: () => tone(1320, 0, 380, "sine"),
  work: () => { tone(988, 0, 140, "square", 0.5); tone(1319, 150, 260, "square", 0.5); },
  rest: () => { tone(660, 0, 180); tone(440, 170, 320); },
  finish: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 120, 260, "triangle")); },
  complete: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 110, 320, "triangle")); tone(1568, 600, 600, "sine", 0.8); },
  error: () => tone(220, 0, 220, "sawtooth", 0.4),
};
const VIBES: Record<Cue, number | number[]> = {
  tap: 15, record: 35, rep: 12, milestone: [40, 40, 80], tick: 20, go: 120, work: [80, 60, 80], rest: [200],
  finish: [100, 60, 100, 60, 240], complete: [60, 40, 60, 40, 160], error: [30, 30, 30],
};

export function cue(kind: Cue) {
  if (prefs.sound) { if (!ctx) unlockAudio(); try { SOUNDS[kind](); } catch {} }
  if (prefs.haptics && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(VIBES[kind]);
}
