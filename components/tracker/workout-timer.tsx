"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pause, Play, Plus, RotateCcw, Square, Timer, Volume2, VolumeX } from "lucide-react";
import { cue, loadSoundPrefs, setSoundPrefs, unlockAudio } from "@/lib/feedback";
import { cadenceFor, timeUnit } from "@/lib/templates";
import { NumberField } from "./challenge-form";
import type { Challenge } from "@/types";

type Mode = "count" | "intervals";
type Phase = "setup" | "countdown" | "running" | "paused" | "done";
export interface TimerConfig { mode: Mode; cadence: number; work: number; rest: number; rounds: number; repsPerRound: number; metronome: boolean }
export interface TimerState { challengeId: string; config: TimerConfig; phase: Phase; countdownAt?: number; startedAt?: number; pausedAt?: number; pausedMs: number; manualReps: number; endedAt?: number }

const KEY = "reps-timer";
const COUNTDOWN_MS = 3000;
export const readTimer = (): TimerState | null => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const writeTimer = (s: TimerState | null) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch {} };
export const clock = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s).padStart(2, "0")}`; };

function elapsedOf(s: TimerState, now: number) {
  // A countdown that finished while the timer was minimized has implicitly started.
  const startedAt = s.startedAt ?? (s.phase === "countdown" && s.countdownAt ? s.countdownAt + COUNTDOWN_MS : undefined);
  if (!startedAt) return 0;
  return Math.max(0, (s.endedAt ?? s.pausedAt ?? now) - startedAt - s.pausedMs);
}
const intervalTotal = (c: TimerConfig) => c.rounds * c.work * 1000 + Math.max(0, c.rounds - 1) * c.rest * 1000;

/** Everything the display and the sound engine need, derived purely from timestamps. */
export function deriveTimer(s: TimerState, challenge: Pick<Challenge, "unitLabel">, now: number) {
  const c = s.config, e = elapsedOf(s, now), unit = timeUnit(challenge);
  const fromTime = (ms: number) => unit === "seconds" ? Math.floor(ms / 1000) : unit === "minutes" ? Math.floor(ms / 60000) : 0;
  if (c.mode === "intervals") {
    const cycle = (c.work + c.rest) * 1000, idx = Math.floor(e / cycle), within = e % cycle;
    const inWork = within < c.work * 1000;
    const round = Math.min(c.rounds, idx + 1);
    const workDone = Math.min(c.rounds, idx + (inWork ? 0 : 1));
    const finished = e >= intervalTotal(c);
    const phaseLeft = finished ? 0 : inWork ? c.work * 1000 - within : cycle - within;
    const reps = (unit ? fromTime(workDone * c.work * 1000 + (inWork && !finished ? within : 0)) : workDone * c.repsPerRound) + s.manualReps;
    return { elapsed: e, reps, round, inWork: inWork && !finished, phaseLeft, finished, phaseKey: finished ? "done" : `${round}:${inWork ? "w" : "r"}` };
  }
  const reps = (unit ? fromTime(e) : c.cadence > 0 ? Math.floor((e / 60000) * c.cadence) : 0) + s.manualReps;
  return { elapsed: e, reps, round: 0, inWork: true, phaseLeft: 0, finished: false, phaseKey: "run" };
}

function defaultConfig(c: Challenge): TimerConfig {
  return { mode: "count", cadence: timeUnit(c) ? 0 : cadenceFor(c) || 0, work: 40, rest: 20, rounds: 8, repsPerRound: c.defaultRepsPerSet, metronome: true };
}

/** Full-screen workout companion: counts reps (by tap or cadence) or runs intervals, then records the result as a set. */
export function WorkoutTimer({ challenge, onSave, onMinimize }: { challenge: Challenge; onSave: (reps: number, notes: string) => Promise<void> | void; onMinimize: () => void }) {
  const [s, setS] = useState<TimerState>(() => {
    const saved = readTimer();
    return saved && saved.challengeId === challenge.id ? saved : { challengeId: challenge.id, config: defaultConfig(challenge), phase: "setup", pausedMs: 0, manualReps: 0 };
  });
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(() => loadSoundPrefs().sound);
  const [finalReps, setFinalReps] = useState<number | null>(null);
  const prev = useRef({ reps: -1, phaseKey: "", secLeft: -1, countdownSec: -1 });
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const unit = timeUnit(challenge);
  const d = deriveTimer(s, challenge, now);
  const sRef = useRef(s);
  useEffect(() => { sRef.current = s; }, [s]);
  const update = (next: TimerState) => { sRef.current = next; setS(next); writeTimer(next.phase === "setup" ? null : next); };


  /** One clock tick: countdown → running handoff, interval auto-finish, and every sound/vibration cue. */
  function step(t: number) {
    const cur = sRef.current, p = prev.current;
    if (cur.phase === "countdown" && cur.countdownAt) {
      const left = Math.ceil((cur.countdownAt + COUNTDOWN_MS - t) / 1000);
      if (left <= 0) { cue("go"); update({ ...cur, phase: "running", startedAt: cur.countdownAt + COUNTDOWN_MS }); }
      else if (left !== p.countdownSec) { cue("tick"); p.countdownSec = left; }
      return;
    }
    if (cur.phase !== "running") return;
    const x = deriveTimer(cur, challenge, t);
    if (x.finished) { cue("finish"); update({ ...cur, phase: "done", endedAt: (cur.startedAt || t) + cur.pausedMs + intervalTotal(cur.config) }); return; }
    if (p.reps >= 0 && x.reps > p.reps) {
      if (Math.floor(x.reps / 10) > Math.floor(p.reps / 10) && !unit) cue("milestone");
      else if (cur.config.metronome && cur.config.mode === "count" && cur.config.cadence > 0) cue("rep");
    }
    if (cur.config.mode === "intervals") {
      if (p.phaseKey && x.phaseKey !== p.phaseKey) cue(x.inWork ? "work" : "rest");
      const secLeft = Math.ceil(x.phaseLeft / 1000);
      if (secLeft <= 3 && secLeft > 0 && secLeft !== p.secLeft) cue("tick");
      p.secLeft = secLeft;
    }
    p.reps = x.reps; p.phaseKey = x.phaseKey;
  }

  // Tick while something is moving.
  useEffect(() => {
    if (s.phase !== "running" && s.phase !== "countdown") return;
    const id = window.setInterval(() => { const t = Date.now(); setNow(t); step(t); }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase]);

  // Keep the screen awake during a workout.
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if ((s.phase === "running" || s.phase === "countdown") && nav.wakeLock && !wake.current) nav.wakeLock.request("screen").then((l) => { wake.current = l; }).catch(() => {});
    if (s.phase !== "running" && s.phase !== "countdown" && wake.current) { void wake.current.release().catch(() => {}); wake.current = null; }
  }, [s.phase]);
  useEffect(() => () => { void wake.current?.release().catch(() => {}); }, []);

  function start() {
    unlockAudio();
    prev.current = { reps: -1, phaseKey: "", secLeft: -1, countdownSec: -1 };
    const t = Date.now();
    setNow(t);
    update({ ...s, phase: "countdown", countdownAt: t, startedAt: undefined, pausedAt: undefined, endedAt: undefined, pausedMs: 0, manualReps: 0 });
  }
  const pause = () => { cue("tap"); update({ ...s, phase: "paused", pausedAt: Date.now() }); };
  const resume = () => { unlockAudio(); cue("go"); update({ ...s, phase: "running", pausedMs: s.pausedMs + (Date.now() - (s.pausedAt || Date.now())), pausedAt: undefined }); };
  const stop = () => { cue("finish"); const t = Date.now(); setNow(t); update({ ...s, phase: "done", endedAt: s.pausedAt ?? t, pausedAt: undefined }); };
  const addManual = (n: number) => { cue("rep"); update({ ...s, manualReps: Math.max(0, s.manualReps + n) }); };
  const reset = () => { setFinalReps(null); update({ challengeId: challenge.id, config: s.config, phase: "setup", pausedMs: 0, manualReps: 0 }); };
  const setConfig = (patch: Partial<TimerConfig>) => setS((x) => ({ ...x, config: { ...x.config, ...patch } }));
  const toggleSound = () => { const next = !sound; setSound(next); setSoundPrefs({ sound: next }); if (next) { unlockAudio(); cue("tap"); } };

  const reps = finalReps ?? d.reps;
  const modeLabel = s.config.mode === "intervals" ? `${s.config.rounds}×${s.config.work}s/${s.config.rest}s` : s.config.cadence > 0 && !unit ? `auto ${s.config.cadence}/min` : "timed";
  const big = s.config.mode === "intervals" && (s.phase === "running" || s.phase === "paused") ? clock(d.phaseLeft) : clock(d.elapsed);

  return (
    <div className={`timerScreen ${s.phase} ${d.inWork ? "work" : "rest"}`} role="dialog" aria-label="Workout timer">
      <header>
        <button className="iconButton" aria-label="Minimize timer" onClick={onMinimize}><ChevronDown /></button>
        <div><p className="eyebrow">WORKOUT</p><b>{challenge.name}</b></div>
        <button className="iconButton" aria-label={sound ? "Mute sounds" : "Unmute sounds"} onClick={toggleSound}>{sound ? <Volume2 /> : <VolumeX />}</button>
      </header>

      {s.phase === "setup" && (
        <section className="timerSetup">
          <div className="segmented" role="group" aria-label="Timer mode">
            <button className={s.config.mode === "count" ? "active" : ""} onClick={() => setConfig({ mode: "count" })}>{unit ? "Timed" : "Count"}</button>
            <button className={s.config.mode === "intervals" ? "active" : ""} onClick={() => setConfig({ mode: "intervals" })}>Intervals</button>
          </div>
          {s.config.mode === "count" && (unit ? (
            <p className="hint">Elapsed time is recorded as {unit} of {challenge.activityLabelPlural.toLowerCase()}. Pause any time.</p>
          ) : (
            <>
              <div className="segmented" role="group" aria-label="Counting">
                <button className={s.config.cadence === 0 ? "active" : ""} onClick={() => setConfig({ cadence: 0 })}>I’ll tap reps</button>
                <button className={s.config.cadence > 0 ? "active" : ""} onClick={() => setConfig({ cadence: s.config.cadence || cadenceFor(challenge) || 60 })}>Auto-count</button>
              </div>
              {s.config.cadence > 0 ? (
                <>
                  <NumberField label="Pace (reps per minute)" value={s.config.cadence} min={1} onChange={(n) => setConfig({ cadence: n })} hint="Great for skipping, running steps or steady sets — reps add up on their own." />
                  <label className="setting"><span><b>Rep beep</b><small>A short click on every counted rep</small></span><input type="checkbox" checked={s.config.metronome} onChange={(e) => setConfig({ metronome: e.target.checked })} /></label>
                </>
              ) : <p className="hint">Tap the big button for each rep or set. A chime marks every 10.</p>}
            </>
          ))}
          {s.config.mode === "intervals" && (
            <div className="formGrid two">
              <NumberField label="Work (sec)" value={s.config.work} min={5} onChange={(n) => setConfig({ work: n })} />
              <NumberField label="Rest (sec)" value={s.config.rest} min={0} onChange={(n) => setConfig({ rest: n })} />
              <NumberField label="Rounds" value={s.config.rounds} min={1} onChange={(n) => setConfig({ rounds: n })} />
              {!unit && <NumberField label="Reps per round" value={s.config.repsPerRound} min={1} onChange={(n) => setConfig({ repsPerRound: n })} />}
              <p className="hint">Total {clock(intervalTotal(s.config))}. {unit ? `Work time is recorded as ${unit}.` : "Each finished work round adds its reps automatically."}</p>
            </div>
          )}
          <button className="primary go" onClick={start}><Play /> Start</button>
        </section>
      )}

      {s.phase === "countdown" && <section className="timerFace"><div className="countdown">{Math.max(1, Math.ceil(((s.countdownAt || now) + COUNTDOWN_MS - now) / 1000))}</div><p>Get ready…</p></section>}

      {(s.phase === "running" || s.phase === "paused") && (
        <section className="timerFace">
          {s.config.mode === "intervals" && <p className="phaseTag">{d.inWork ? "WORK" : "REST"} · round {d.round}/{s.config.rounds}</p>}
          <div className="bigClock" aria-live="off">{big}</div>
          {s.config.mode === "intervals" && <small className="subClock">total {clock(d.elapsed)}</small>}
          <div className="repCount"><b>{d.reps}</b><span>{unit || challenge.unitLabel} {s.phase === "paused" ? "· paused" : ""}</span></div>
          {!unit && (
            <div className="tapRow">
              <button className="tapBig" onClick={() => addManual(1)} aria-label="Add one rep"><Plus /> 1</button>
              <button onClick={() => addManual(challenge.defaultRepsPerSet)}>+{challenge.defaultRepsPerSet}</button>
              <button onClick={() => addManual(-1)} disabled={s.manualReps < 1} aria-label="Remove one rep">−1</button>
            </div>
          )}
          <div className="timerControls">
            {s.phase === "running" ? <button className="outline" onClick={pause}><Pause /> Pause</button> : <button className="outline" onClick={resume}><Play /> Resume</button>}
            <button className="primary" onClick={stop}><Square /> Finish</button>
          </div>
        </section>
      )}

      {s.phase === "done" && (
        <section className="timerFace">
          <Timer className="doneIcon" />
          <h2>Nice work!</h2>
          <p>{clock(d.elapsed)} · {modeLabel}</p>
          <div className="bigInput"><NumberField label={`${challenge.activityLabelPlural} to record`} value={reps} min={0} onChange={setFinalReps} /></div>
          <button className="primary" disabled={reps < 1} onClick={async () => { await onSave(reps, `⏱ ${clock(d.elapsed)} · ${modeLabel}`); writeTimer(null); }}>Save {reps} {challenge.unitLabel}</button>
          <div className="timerControls">
            <button className="outline" onClick={reset}><RotateCcw /> New workout</button>
            <button className="outline" onClick={() => { writeTimer(null); onMinimize(); }}>Discard</button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Small floating pill that keeps a minimized workout visible and tappable. */
export function TimerPill({ challenge, onOpen }: { challenge: Challenge; onOpen: () => void }) {
  const [state] = useState(readTimer);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id); }, []);
  if (!state || state.challengeId !== challenge.id || state.phase === "setup") return null;
  const d = deriveTimer(state, challenge, now);
  return <button className="timerPill" onClick={onOpen}><Timer /> {state.phase === "done" ? "Workout finished — save it" : `${clock(d.elapsed)} · ${d.reps} ${challenge.unitLabel}${state.phase === "paused" ? " · paused" : ""}`}</button>;
}
