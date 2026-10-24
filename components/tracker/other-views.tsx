"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth, subMonths } from "date-fns";
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, Cloud, CloudOff, Monitor, Moon, Pencil, Play, Plus, RotateCcw, Sun, Undo2, UserPlus, Volume2, X } from "lucide-react";
import { localDb } from "@/db/dexie";
import { toLocalDate } from "@/lib/date-utils";
import { cue, loadSoundPrefs, setSoundPrefs, unlockAudio } from "@/lib/feedback";
import { glyphFor } from "@/lib/templates";
import type { ThemePref } from "@/lib/theme";
import { progressOf } from "./today-view";
import type { Tracker } from "./use-tracker";
import type { Challenge, ExerciseSet } from "@/types";

const fmt = (n: number) => new Intl.NumberFormat().format(n);

export function CalendarView({ t, onEditSet, onAdd }: { t: Tracker; onEditSet: (s: ExerciseSet) => void; onAdd: (date: string, challengeId?: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const weekStart = t.settings?.weekStartsOn ?? 1;
  const byId = new Map(t.challenges.map((c) => [c.id, c]));
  const scoped = t.sets.filter((s) => !filter || s.challengeId === filter);
  const live = scoped.filter((s) => !s.deletedAt);
  const totals = new Map<string, number>();
  live.forEach((s) => totals.set(s.localDate, (totals.get(s.localDate) || 0) + s.reps));
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const prefix = (getDay(days[0]) - weekStart + 7) % 7;
  const monthKey = format(month, "yyyy-MM");
  const inMonth = [...totals].filter(([d]) => d.startsWith(monthKey));
  const monthTotal = inMonth.reduce((n, [, v]) => n + v, 0);
  const best = Math.max(0, ...inMonth.map(([, v]) => v));
  const scale = Math.max(50, best / 4);
  const labels = weekStart === 1 ? "MTWTFSS" : "SMTWTFS";
  const daySets = scoped.filter((s) => s.localDate === selected).sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  return (
    <>
      <div className="chipRail compact" role="radiogroup" aria-label="Show challenge">
        <button role="radio" aria-checked={!filter} className={`chip ${!filter ? "on" : ""}`} onClick={() => setFilter("")}><span className="chipText"><b>All challenges</b></span></button>
        {t.challenges.filter((c) => c.status !== "archived").map((c) => <button key={c.id} role="radio" aria-checked={filter === c.id} className={`chip ${filter === c.id ? "on" : ""}`} onClick={() => setFilter(c.id)}><span className="chipGlyph">{glyphFor(c)}</span><span className="chipText"><b>{c.name}</b></span></button>)}
      </div>
      <section className="calendarHead">
        <div className="monthNav">
          <button aria-label="Previous month" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft /></button>
          <h2>{format(month, "MMMM yyyy")}</h2>
          <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></button>
          <button className="todayShortcut" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button>
        </div>
        <div className="monthStats">
          <span><b>{fmt(monthTotal)}</b> reps</span>
          <span><b>{inMonth.length ? fmt(Math.round(monthTotal / inMonth.length)) : 0}</b> daily avg</span>
          <span><b>{inMonth.length}</b> active days</span>
          <span><b>{fmt(best)}</b> best day</span>
        </div>
      </section>
      <section className="calendarCard">
        <div className="weekdays">{labels.split("").map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="calendarGrid">
          {Array.from({ length: prefix }).map((_, i) => <i key={`p${i}`} />)}
          {days.map((d) => {
            const date = format(d, "yyyy-MM-dd"), n = totals.get(date) || 0, level = n ? Math.min(Math.ceil(n / scale), 4) : 0;
            return <button key={date} className={`${date === toLocalDate() ? "today" : ""} level${level}`} onClick={() => setSelected(date)} aria-label={`${format(d, "MMMM d")}: ${n} reps`}><b>{format(d, "d")}</b>{n > 0 ? <><i /><small>{n}</small></> : <span />}</button>;
          })}
        </div>
      </section>
      {selected && (
        <div className="sheetBackdrop" onClick={() => setSelected(null)}>
          <section className="sheet daySheet" role="dialog" aria-label="Day details" onClick={(e) => e.stopPropagation()}>
            <button className="sheetClose" aria-label="Close" onClick={() => setSelected(null)}><X /></button>
            <p className="eyebrow">{format(new Date(`${selected}T12:00:00`), "EEEE, MMMM d")}</p>
            <h2>{fmt(daySets.filter((s) => !s.deletedAt).reduce((n, s) => n + s.reps, 0))} reps</h2>
            <div className="setList">
              {daySets.length ? daySets.map((s) => (
                <div key={s.id} className={s.deletedAt ? "deleted" : ""}>
                  <span><b>{s.reps}</b> {byId.get(s.challengeId)?.activityLabelPlural.toLowerCase() || "reps"}<small>{format(new Date(s.performedAt), "h:mm a")}{s.notes ? ` · ${s.notes}` : ""}</small></span>
                  {s.deletedAt ? <button onClick={() => void t.restore(s)}>Restore</button> : <><button onClick={() => { setSelected(null); onEditSet(s); }}>Edit</button><button onClick={() => void t.softDelete(s, "delete")}>Delete</button></>}
                </div>
              )) : <p>No sets recorded.</p>}
            </div>
            {selected <= toLocalDate() && <button className="primary" onClick={() => { const d = selected; setSelected(null); onAdd(d, filter || undefined); }}><Plus /> Add a set on this day</button>}
          </section>
        </div>
      )}
    </>
  );
}

type Tab = "active" | "completed" | "archived";
export function ChallengesView({ t, onNew, onEdit, onTrain }: { t: Tracker; onNew: () => void; onEdit: (c: Challenge) => void; onTrain: (c: Challenge) => void }) {
  const [tab, setTab] = useState<Tab>("active");
  const counts = { active: 0, completed: 0, archived: 0 };
  t.challenges.forEach((c) => counts[c.status]++);
  const shown = t.challenges.filter((c) => c.status === tab).sort((a, b) => Number(b.id === t.active?.id) - Number(a.id === t.active?.id) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className="sectionTitle"><div><p className="eyebrow">YOUR PROGRAM</p><h2>Choose today’s focus</h2></div><button className="primary small" onClick={onNew}><Plus /> New</button></div>
      <div className="segmented tabs" role="tablist">
        {(["active", "completed", "archived"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{k[0].toUpperCase() + k.slice(1)} <span className="count">{counts[k]}</span></button>)}
      </div>
      {!shown.length && <p className="emptyNote">{tab === "active" ? "No active challenges. Start one — or reactivate an archived one." : tab === "completed" ? "Finish a challenge to see it here with its trophy." : "Archived challenges are hidden from Today but keep their history."}</p>}
      <div className="challengeGrid">
        {shown.map((c) => {
          const p = progressOf(c, t.sets);
          const isActive = c.id === t.active?.id;
          return (
            <article key={c.id} className={`challengeCard ${isActive ? "selected" : ""}`}>
              <div className="challengeIcon">{c.status === "completed" ? "🏆" : glyphFor(c)}</div>
              <div>
                <span className={`status ${c.status}`}>{isActive && c.status === "active" ? "RECORDING NOW" : c.status.toUpperCase()}</span>
                <h3>{c.name}</h3>
                <p>{c.activityLabelPlural} · {fmt(c.targetReps)} {c.targetMode === "daily" ? "daily" : "total"}{c.endDate ? ` · ends ${format(new Date(`${c.endDate}T12:00:00`), "MMM d")}` : ""}</p>
              </div>
              <b className="bigPct">{Math.round(p.pct)}%</b>
              <div className="bar"><i style={{ width: `${p.pct}%` }} /></div>
              <div className="challengeMeta">
                <span><b>{fmt(p.total?.currentTotal ?? p.daily?.periodActual ?? 0)}</b> completed</span>
                <span><b>{fmt(p.remaining)}</b> {p.daily ? "left today" : "remaining"}</span>
                <span><b>{p.total?.requiredDailyAverage ? fmt(p.total.requiredDailyAverage) : p.daily ? p.daily.streak : "—"}</b> {p.daily ? "streak" : "per day"}</span>
              </div>
              <div className="challengeActions">
                {c.status !== "archived" && <button className="outline primaryish" onClick={() => onTrain(c)}><Play /> {isActive ? "Record" : "Train this"}</button>}
                <button className="outline" onClick={() => onEdit(c)}><Pencil /> Edit</button>
                {c.status !== "archived" && <button className="outline" onClick={() => void t.invite(c.id)}><UserPlus /> Invite</button>}
                {c.status === "archived"
                  ? <button className="outline" onClick={() => void t.updateChallenge(c, { status: "active" })}><ArchiveRestore /> Reactivate</button>
                  : <button className="outline" onClick={() => void t.updateChallenge(c, { status: "archived" })}><Archive /> Archive</button>}
                <button className="deleteChallenge" onClick={() => void t.deleteChallenge(c)}><X /> Delete challenge</button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function ThemeSwitch({ value, onChange }: { value: ThemePref; onChange: (v: ThemePref) => void }) {
  const opts: [ThemePref, typeof Sun, string][] = [["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "Auto"]];
  return <div className="segmented themeSwitch" role="radiogroup" aria-label="Theme">{opts.map(([v, Icon, label]) => <button key={v} role="radio" aria-checked={value === v} className={value === v ? "active" : ""} onClick={() => onChange(v)}><Icon /> {label}</button>)}</div>;
}

export function SettingsView({ t, onImport }: { t: Tracker; onImport: () => void }) {
  const settings = t.settings!;
  const [sound, setSound] = useState(() => loadSoundPrefs());
  const updateSound = (next: Partial<typeof sound>) => { const merged = { ...sound, ...next }; setSound(merged); setSoundPrefs(merged); unlockAudio(); if (merged.sound) cue("record"); };
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), challenges: t.challenges, sets: t.sets, settings }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "reps-backup.json"; a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <div className="settingsPage">
      <section>
        <p className="eyebrow">PREFERENCES</p>
        <h2>Make it yours</h2>
        <div className="setting stacked"><span><b>Theme</b><small>Light, dark, or follow your phone</small></span><ThemeSwitch value={t.theme} onChange={(v) => void t.updateSettings({ theme: v })} /></div>
        <label className="setting"><span><b>Vibration</b><small>Haptic feedback on sets, timers and trophies</small></span><input type="checkbox" checked={settings.hapticsEnabled} onChange={(e) => void t.updateSettings({ hapticsEnabled: e.target.checked })} /></label>
        <label className="setting"><span><b>Sounds</b><small>Beeps, countdowns and trophy fanfare</small></span><input type="checkbox" checked={sound.sound} onChange={(e) => updateSound({ sound: e.target.checked })} /></label>
        {sound.sound && <label className="setting"><span><b><Volume2 className="inline" /> Volume</b><small>Test plays as you slide</small></span><input type="range" min={0.1} max={1} step={0.1} value={sound.volume} onChange={(e) => updateSound({ volume: Number(e.target.value) })} /></label>}
        <label className="setting"><span><b>Week starts</b><small>Used by your calendar</small></span><select value={settings.weekStartsOn} onChange={(e) => void t.updateSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })}><option value="1">Monday</option><option value="0">Sunday</option></select></label>
        <label className="setting"><span><b>Default reps per tap</b><small>Starting value for new custom challenges. Each challenge has its own — adjust it on Today.</small></span><input className="numberSmall" type="number" min={1} value={settings.fallbackDefaultRepsPerSet} onChange={(e) => { const n = Math.trunc(Number(e.target.value)); if (n >= 1) void t.updateSettings({ fallbackDefaultRepsPerSet: n }); }} /></label>
      </section>
      <section>
        <p className="eyebrow">YOUR DATA</p>
        <h2>Portable by design</h2>
        <button className="dataAction" onClick={exportData}><Cloud /><span><b>Export JSON backup</b><small>Challenges, sets, settings and history</small></span><ChevronRight /></button>
        <button className="dataAction" onClick={onImport}><RotateCcw /><span><b>Import JSON backup</b><small>Merge history into a challenge — preview, progress and summary</small></span><ChevronRight /></button>
        <button className="dataAction" onClick={() => signOut({ callbackUrl: "/login" })}><CloudOff /><span><b>Sign out</b><small>Your server data stays safely stored</small></span><ChevronRight /></button>
        <button className="dataAction danger" onClick={async () => { if (confirm("Reset all data on this device? Anything not yet synced will be lost.")) { await localDb.delete(); location.href = "/"; } }}><X /><span><b>Reset all device data</b><small>Requires explicit confirmation</small></span><ChevronRight /></button>
      </section>
    </div>
  );
}

export function ActivityView({ t }: { t: Tracker }) {
  const byId = new Map(t.challenges.map((c) => [c.id, c]));
  const items = [...t.sets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 300);
  return (
    <section className="activityPage">
      <p className="eyebrow">AUDIT-FRIENDLY HISTORY</p>
      <h2>Every change, visible</h2>
      <div className="timeline">
        {items.map((s) => {
          const c = byId.get(s.challengeId);
          return (
            <article key={s.id}>
              <i className={s.deletedAt ? "removed" : ""}>{s.deletedAt ? <Undo2 /> : <Check />}</i>
              <div>
                <b>{s.deletedAt ? `${s.deletedReason === "undo" ? "Undid" : "Deleted"} set` : `Recorded ${s.reps} ${c?.unitLabel || "reps"}`}</b>
                <span>{c ? `${c.name} · ` : ""}{format(new Date(s.updatedAt), "MMM d · h:mm a")}{s.syncStatus === "pending" ? " · not synced yet" : ""}</span>
                {s.notes && <small>{s.notes}</small>}
              </div>
              {s.deletedAt && <button onClick={() => void t.restore(s)}>Restore</button>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
