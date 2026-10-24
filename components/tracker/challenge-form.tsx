"use client";
import { useState } from "react";
import { Dumbbell, Minus, Plus, Target } from "lucide-react";
import { TEMPLATES, makeChallenge, validateChallenge } from "@/lib/templates";
import type { Challenge } from "@/types";

const fmt = (n: number) => new Intl.NumberFormat().format(n);
const nowIso = () => new Date().toISOString();
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Number input that can be cleared while typing; commits integers only. */
export function NumberField({ label, value, onChange, min = 0, hint, id }: { label: string; value: number; onChange: (n: number) => void; min?: number; hint?: string; id?: string }) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); if (Number(text) !== value) setText(String(value)); }
  return (
    <label htmlFor={id}>
      {label}
      <input id={id} inputMode="numeric" type="number" min={min} value={text}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.trunc(n)); }}
        onBlur={() => { if (text === "" || Number(text) < min) { setText(String(Math.max(min, value))); onChange(Math.max(min, value)); } }} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** − N + control for reps per tap. */
export function Stepper({ value, onChange, label = "Reps per tap", step }: { value: number; onChange: (n: number) => void; label?: string; step?: number }) {
  const inc = step || (value >= 50 ? 10 : value >= 20 ? 5 : 1);
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => onChange(Math.max(1, value - inc))} disabled={value <= 1}><Minus /></button>
      <input aria-label={label} inputMode="numeric" type="number" min={1} value={value} onChange={(e) => { const n = Math.trunc(Number(e.target.value)); if (n >= 1) onChange(n); }} />
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} onClick={() => onChange(value + inc)}><Plus /></button>
    </div>
  );
}

function QuickSetsField({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <label>
      Quick-set buttons
      <input value={text} placeholder="5, 20, 25" onChange={(e) => { setText(e.target.value); onChange(e.target.value.split(/[,\s]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 5)); }} />
      <small>Up to 5 sizes, separated by commas.</small>
    </label>
  );
}

function Fields({ draft, set, editing }: { draft: Challenge; set: <K extends keyof Challenge>(k: K, v: Challenge[K]) => void; editing?: boolean }) {
  return (
    <div className="formGrid">
      <label>Challenge name<input value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
      {editing && (
        <>
          <label>Movement<input value={draft.activityName} onChange={(e) => set("activityName", e.target.value)} placeholder="Push-up" /></label>
          <label>Plural label<input value={draft.activityLabelPlural} onChange={(e) => set("activityLabelPlural", e.target.value)} placeholder="Push-ups" /></label>
          <label>Unit<select value={draft.unitLabel} onChange={(e) => set("unitLabel", e.target.value)}><option value="reps">reps</option><option value="seconds">seconds</option><option value="minutes">minutes</option><option value="km">km</option><option value="steps">steps</option></select></label>
        </>
      )}
      <div className="segmented" role="group" aria-label="Target type">
        <button type="button" className={draft.targetMode === "total" ? "active" : ""} onClick={() => set("targetMode", "total")}>Total target</button>
        <button type="button" className={draft.targetMode === "daily" ? "active" : ""} onClick={() => set("targetMode", "daily")}>Daily target</button>
      </div>
      <NumberField label={draft.targetMode === "total" ? "Total challenge target" : "Daily target per training day"} value={draft.targetReps} min={1} onChange={(n) => set("targetReps", n)}
        hint={draft.targetMode === "total" ? "One cumulative goal across the challenge dates." : "The amount to hit on each training day."} />
      <label>Reps per tap<Stepper value={draft.defaultRepsPerSet} onChange={(n) => set("defaultRepsPerSet", n)} /></label>
      <QuickSetsField value={draft.quickSetSizes} onChange={(v) => set("quickSetSizes", v)} />
      {draft.targetMode === "daily" && (
        <div className="weekdayPicker" role="group" aria-label="Training days">
          <span>Training days</span>
          <div>{WEEKDAYS.map((d, i) => <button type="button" key={i} aria-pressed={draft.activeWeekdays.includes(i)} className={draft.activeWeekdays.includes(i) ? "on" : ""} onClick={() => set("activeWeekdays", draft.activeWeekdays.includes(i) ? draft.activeWeekdays.filter((x) => x !== i) : [...draft.activeWeekdays, i].sort())}>{d}</button>)}</div>
        </div>
      )}
      <label>Start date<input type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
      <label>End date (optional)<input type="date" value={draft.endDate || ""} min={draft.startDate} onChange={(e) => set("endDate", e.target.value || undefined)} /></label>
      {editing && <NumberField label={`Previous ${draft.activityLabelPlural.toLowerCase() || "reps"} (before tracking)`} value={draft.openingReps} onChange={(n) => set("openingReps", n)} />}
    </div>
  );
}

/** Three-step builder for new challenges (first run and "New challenge"). */
export function ChallengeWizard({ userId, defaultReps, onFinish, compact = false }: { userId: string; defaultReps?: number; onFinish: (c: Challenge) => Promise<unknown>; compact?: boolean }) {
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState("pushups");
  const [draft, setDraft] = useState<Challenge>(() => makeChallenge(TEMPLATES.pushups, userId, defaultReps));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Challenge>(k: K, v: Challenge[K]) => setDraft((d) => ({ ...d, [k]: v, updatedAt: nowIso() }));
  const error = validateChallenge(draft);
  const stepOneError = !draft.activityName.trim() || !draft.activityLabelPlural.trim() ? "Name the movement to continue." : null;
  async function next() {
    if (step < 3) { setStep(step + 1); return; }
    if (error || saving) return;
    setSaving(true);
    try { await onFinish(draft); } finally { setSaving(false); }
  }
  return (
    <main className={compact ? "onboarding compact" : "onboarding"}>
      {!compact && <div className="onboardingBrand"><Dumbbell /><b>REPS</b></div>}
      <div className="steps">{[1, 2, 3].map((n) => <i key={n} className={step >= n ? "on" : ""} />)}</div>
      <section>
        <p className="eyebrow">STEP {step} OF 3</p>
        {step === 1 && (
          <>
            <h1>What are we<br /><em>training?</em></h1>
            <p className="lede">Choose a starting point. You can tune every detail — even after you start.</p>
            <div className="templateGrid">
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <button key={k} type="button" className={template === k ? "selected" : ""} onClick={() => { setTemplate(k); setDraft(makeChallenge(t, userId, defaultReps)); }}>
                  <span>{t.glyph}</span><b>{t.activityLabelPlural || "Custom"}</b><small>{k === "custom" ? "Build your own" : t.name}</small>
                </button>
              ))}
            </div>
            <label>Movement<input value={draft.activityName} placeholder="e.g. Kettlebell swing" onChange={(e) => set("activityName", e.target.value)} /></label>
            <label>Plural label<input value={draft.activityLabelPlural} placeholder="e.g. Swings" onChange={(e) => set("activityLabelPlural", e.target.value)} /></label>
          </>
        )}
        {step === 2 && (<><h1>Shape your<br /><em>challenge.</em></h1><Fields draft={draft} set={set} /></>)}
        {step === 3 && (
          <>
            <h1>Bring your<br /><em>progress.</em></h1>
            <p className="lede">Already started? Add it without inventing historical sets.</p>
            <div className="bigInput"><NumberField label={`Previous ${draft.activityLabelPlural.toLowerCase()}`} value={draft.openingReps} onChange={(n) => set("openingReps", n)} hint="This counts toward your total from day one." /></div>
            <div className="summary"><Target /><div><b>{draft.name}</b><span>{fmt(draft.targetReps)} {draft.unitLabel}{draft.targetMode === "daily" ? " a day" : ""} · +{draft.defaultRepsPerSet} per tap</span></div></div>
          </>
        )}
        {(step === 1 ? stepOneError : step === 3 || step === 2 ? error : null) && <p className="formError" role="alert">{step === 1 ? stepOneError : error}</p>}
        <div className="onboardingActions">
          {step > 1 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="button" className="primary" disabled={saving || (step === 1 ? !!stepOneError : step === 3 && !!error)} onClick={next}>
            {saving ? "Saving…" : step < 3 ? "Continue" : "Start challenge"}
          </button>
        </div>
      </section>
    </main>
  );
}

/** Edit an existing challenge — any field, any time. */
export function ChallengeEditor({ challenge, onSave, onClose, onDelete, onImport }: { challenge: Challenge; onSave: (patch: Challenge) => Promise<unknown>; onClose: () => void; onDelete: () => void; onImport: () => void }) {
  const [draft, setDraft] = useState<Challenge>(challenge);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Challenge>(k: K, v: Challenge[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const error = validateChallenge(draft);
  return (
    <div className="sheetBackdrop" onClick={onClose}>
      <section className="sheet editorSheet" role="dialog" aria-label={`Edit ${challenge.name}`} onClick={(e) => e.stopPropagation()}>
        <button className="sheetClose" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">EDIT CHALLENGE</p>
        <h2>{challenge.name}</h2>
        {challenge.status !== "active" && <p className="hint">This challenge is <b>{challenge.status}</b>. {challenge.status === "completed" ? "Raising the target reopens it." : "Reactivate it to record again."}</p>}
        <Fields draft={draft} set={set} editing />
        <label>Status<select value={draft.status} onChange={(e) => set("status", e.target.value as Challenge["status"])}><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived (hidden)</option></select></label>
        {error && <p className="formError" role="alert">{error}</p>}
        <button className="primary" disabled={!!error || saving} onClick={async () => { setSaving(true); try { await onSave(draft); onClose(); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save changes"}</button>
        <button className="textButton" onClick={onImport}>Import history from a backup…</button>
        <button className="textDanger" onClick={onDelete}>Delete challenge…</button>
      </section>
    </div>
  );
}
