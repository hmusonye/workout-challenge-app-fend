"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Flame, MoreHorizontal, Pencil, Plus, Timer, Undo2 } from "lucide-react";
import { dailyProgress, totalProgress } from "@/lib/challenge-math";
import { toLocalDate } from "@/lib/date-utils";
import { computeStats } from "@/lib/gamification";
import { glyphFor } from "@/lib/templates";
import { Stepper } from "./challenge-form";
import type { Tracker } from "./use-tracker";
import type { Challenge, ExerciseSet } from "@/types";

const fmt = (n: number) => new Intl.NumberFormat().format(n);

export function progressOf(c: Challenge, sets: ExerciseSet[], today = toLocalDate()) {
  const own = sets.filter((s) => s.challengeId === c.id);
  if (c.targetMode === "total") { const p = totalProgress(c, own, today); return { pct: p.completionPercent, done: p.currentTotal, remaining: p.remaining, total: p, daily: null }; }
  const p = dailyProgress(c, own, today);
  return { pct: p.todayCompletionPercent, done: p.todayTotal, remaining: p.todayRemaining, total: null, daily: p };
}

/** Horizontal, swipeable challenge switcher — one tap to change what you're recording. */
export function ChallengeChips({ challenges, sets, activeId, onPick, onNew }: { challenges: Challenge[]; sets: ExerciseSet[]; activeId?: string; onPick: (id: string) => void; onNew: () => void }) {
  const listed = challenges.filter((c) => c.status === "active" || c.id === activeId);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("[aria-checked=true]")?.scrollIntoView({ inline: "center", block: "nearest" }); }, [activeId]);
  return (
    <div className="chipRail" role="radiogroup" aria-label="Recording for" ref={ref}>
      {listed.map((c) => {
        const p = progressOf(c, sets);
        return (
          <button key={c.id} role="radio" aria-checked={c.id === activeId} className={`chip ${c.id === activeId ? "on" : ""} ${c.status}`} onClick={() => onPick(c.id)}>
            <span className="chipGlyph">{c.status === "completed" ? "🏆" : glyphFor(c)}</span>
            <span className="chipText"><b>{c.name}</b><small>{Math.round(p.pct)}%{c.targetMode === "daily" ? " today" : ""}</small></span>
            <i style={{ width: `${p.pct}%` }} />
          </button>
        );
      })}
      <button className="chip add" onClick={onNew} aria-label="New challenge"><Plus /> New</button>
    </div>
  );
}

function ProgressCard({ challenge, sets, onEdit }: { challenge: Challenge; sets: ExerciseSet[]; onEdit: () => void }) {
  const { pct, total, daily } = progressOf(challenge, sets);
  const behind = (total?.deficit ?? daily?.periodDeficit ?? 0) > 0;
  return (
    <section className="progressCard">
      <div className="ring" style={{ "--progress": `${pct * 3.6}deg` } as React.CSSProperties}><div><b>{Math.round(pct)}%</b><span>{daily ? "today" : "complete"}</span></div></div>
      <div className="progressInfo">
        <div className="progressHead"><p className="eyebrow">{challenge.status === "completed" ? "COMPLETED" : "ACTIVE CHALLENGE"}</p><button className="linkButton" onClick={onEdit}><Pencil /> Edit</button></div>
        <h2>{challenge.name}</h2>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="stats">
          <span><b>{fmt(total?.currentTotal ?? daily?.periodActual ?? 0)}</b> done</span>
          <span><b>{fmt(total?.remaining ?? daily?.todayRemaining ?? 0)}</b> {daily ? "left today" : "remaining"}</span>
          <span className={behind ? "amber" : "green"}><b>{total?.deficit ? `${fmt(total.deficit)} behind` : total?.aheadBy ? `${fmt(total.aheadBy)} ahead` : daily?.periodDeficit ? `${fmt(daily.periodDeficit)} behind` : "On pace"}</b>{total?.requiredDailyAverage ? ` · ${fmt(total.requiredDailyAverage)}/day` : ""}</span>
        </div>
      </div>
    </section>
  );
}

export function TodayView({ t, onCustom, onEditSet, onEditChallenge, onNew, onTimer }: { t: Tracker; onCustom: () => void; onEditSet: (s: ExerciseSet) => void; onEditChallenge: (c: Challenge) => void; onNew: () => void; onTimer: () => void }) {
  const active = t.active!;
  const today = toLocalDate();
  const todaySets = t.sets.filter((s) => s.challengeId === active.id && s.localDate === today && !s.deletedAt);
  const todayTotal = todaySets.reduce((n, s) => n + s.reps, 0);
  const stats = computeStats(t.challenges, t.sets, today);
  const daily = active.targetMode === "daily" ? dailyProgress(active, t.sets.filter((s) => s.challengeId === active.id), today) : null;

  // Reps-per-tap updates instantly on screen; the challenge itself saves once you stop adjusting.
  const [perTap, setPerTap] = useState({ id: active.id, value: active.defaultRepsPerSet });
  const shown = perTap.id === active.id ? perTap.value : active.defaultRepsPerSet;
  const saveTimer = useRef<number | undefined>(undefined);
  function adjustPerTap(n: number) {
    setPerTap({ id: active.id, value: n });
    window.clearTimeout(saveTimer.current);
    const c = active;
    saveTimer.current = window.setTimeout(() => { if (n !== c.defaultRepsPerSet) void t.updateChallenge(c, { defaultRepsPerSet: n }, true); }, 600);
  }
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  return (
    <>
      <ChallengeChips challenges={t.challenges} sets={t.sets} activeId={active.id} onPick={(id) => t.activate(id)} onNew={onNew} />
      <section className="hero">
        <div className="heroTop">
          <div><span>Today’s effort</span><strong>{fmt(todayTotal)}</strong><small>{active.unitLabel} across {todaySets.length} {todaySets.length === 1 ? "set" : "sets"}</small></div>
          <div className="streak"><Flame /><b>{daily?.streak ?? stats.currentStreak}</b><span>day streak</span></div>
        </div>
        <div className="setRow">{todaySets.length ? todaySets.map((s) => <button key={s.id} onClick={() => onEditSet(s)} title="Edit set">{s.reps}</button>) : <span>Your first set is one tap away.</span>}</div>
        <Link href="/profile" className="xpStrip"><span className="levelChip">⚡ Lv {stats.level}</span><div className="bar xp"><i style={{ width: `${stats.levelProgress}%` }} /></div><small>{fmt(stats.xp)} XP · {t.badges.length} 🏅</small></Link>
      </section>
      {active.status === "completed" && (
        <section className="conquered"><span>🏆</span><div><b>{active.name} conquered!</b><small>Extra sets still count toward lifetime stats. Edit to raise the target.</small></div><button className="primary small" onClick={onNew}>New challenge</button></section>
      )}
      <section className="recordZone">
        <button className="recordButton" onClick={() => void t.record(shown, { fromTap: true })} aria-label={`Record ${shown} ${active.activityLabelPlural}`}>
          <span><Plus /> {shown}</span><b>{active.activityLabelPlural}</b><small>tap to record</small>
        </button>
        <div className="perTapRow"><span>Per tap</span><Stepper value={shown} onChange={adjustPerTap} /></div>
        <div className="quickSets">
          {active.quickSetSizes.map((n) => <button key={n} onClick={() => void t.record(n, { fromTap: true })}>+{n}</button>)}
          <button onClick={onCustom}><MoreHorizontal /> Custom</button>
        </div>
        <div className="recordExtras">
          <button className="timerLaunch" onClick={onTimer}><Timer /> Workout timer</button>
          <button className="undoLink" disabled={!todaySets.length} onClick={() => todaySets.length && void t.softDelete(todaySets.at(-1)!)}><Undo2 /> Undo last</button>
        </div>
      </section>
      <ProgressCard challenge={active} sets={t.sets} onEdit={() => onEditChallenge(active)} />
    </>
  );
}
