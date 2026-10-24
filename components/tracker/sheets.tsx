"use client";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Cloud, CloudOff, RefreshCw, Trash2, X } from "lucide-react";
import { toLocalDate } from "@/lib/date-utils";
import { NumberField } from "./challenge-form";
import type { SyncInfo } from "./use-tracker";
import type { Challenge, ExerciseSet } from "@/types";

export function Sheet({ title, eyebrow, onClose, children, className = "", closable = true }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; className?: string; closable?: boolean }) {
  return (
    <div className="sheetBackdrop" onClick={closable ? onClose : undefined}>
      <section className={`sheet ${className}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {closable && <button className="sheetClose" aria-label="Close" onClick={onClose}><X /></button>}
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

/** Record a set with a chosen size, date and challenge. */
export function CustomSetSheet({ challenges, initial, onRecord, onClose }: { challenges: Challenge[]; initial: { challengeId: string; date?: string; reps: number }; onRecord: (reps: number, challengeId: string, date: string, notes?: string) => void; onClose: () => void }) {
  const [reps, setReps] = useState(initial.reps);
  const [date, setDate] = useState(initial.date || toLocalDate());
  const [challengeId, setChallengeId] = useState(initial.challengeId);
  const [notes, setNotes] = useState("");
  const c = challenges.find((x) => x.id === challengeId);
  return (
    <Sheet eyebrow="CUSTOM SET" title="How many reps?" onClose={onClose}>
      <div className="bigInput"><NumberField label={c?.activityLabelPlural || "Reps"} value={reps} min={1} onChange={setReps} /></div>
      <label>Challenge<select value={challengeId} onChange={(e) => setChallengeId(e.target.value)}>{challenges.filter((x) => x.status !== "archived").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>Date<input type="date" value={date} max={toLocalDate()} onChange={(e) => setDate(e.target.value || toLocalDate())} /></label>
      <label>Note (optional)<input value={notes} maxLength={140} placeholder="e.g. felt strong" onChange={(e) => setNotes(e.target.value)} /></label>
      <button className="primary" disabled={reps < 1 || !c} onClick={() => { onRecord(reps, challengeId, date, notes.trim() || undefined); onClose(); }}>Record {reps} {c?.unitLabel || "reps"}</button>
    </Sheet>
  );
}

/** Edit or delete a recorded set. */
export function SetEditorSheet({ entry, challenges, onSave, onDelete, onClose }: { entry: ExerciseSet; challenges: Challenge[]; onSave: (patch: Partial<ExerciseSet>) => void; onDelete: () => void; onClose: () => void }) {
  const [reps, setReps] = useState(entry.reps);
  const [date, setDate] = useState(entry.localDate);
  const [notes, setNotes] = useState(entry.notes || "");
  const [challengeId, setChallengeId] = useState(entry.challengeId);
  return (
    <Sheet eyebrow="EDIT SET" title={`${entry.reps} ${challenges.find((c) => c.id === entry.challengeId)?.unitLabel || "reps"}`} onClose={onClose}>
      <div className="bigInput"><NumberField id="edit-reps" label="Repetitions" value={reps} min={1} onChange={setReps} /></div>
      <label>Challenge<select value={challengeId} onChange={(e) => setChallengeId(e.target.value)}>{challenges.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>Date<input type="date" value={date} max={toLocalDate()} onChange={(e) => setDate(e.target.value || entry.localDate)} /></label>
      <label>Note<input value={notes} maxLength={140} onChange={(e) => setNotes(e.target.value)} /></label>
      <button className="primary" disabled={reps < 1} onClick={() => { onSave({ reps, localDate: date, notes: notes.trim() || undefined, challengeId }); onClose(); }}>Save set</button>
      <button className="textDanger" onClick={() => { onDelete(); onClose(); }}><Trash2 /> Delete set</button>
    </Sheet>
  );
}

export function SyncSheet({ sync, onSync, onClose }: { sync: SyncInfo; onSync: () => void; onClose: () => void }) {
  const online = typeof navigator === "undefined" || navigator.onLine;
  const headline = sync.status === "syncing" ? "Syncing…" : sync.status === "offline" ? "Offline" : sync.status === "error" ? "Sync paused" : sync.pending ? "Waiting to sync" : "All synced";
  return (
    <Sheet eyebrow="SYNC" title={headline} onClose={onClose} className="syncSheet">
      <div className="syncRows">
        <div><span>Connection</span><b>{online ? <><Cloud /> Online</> : <><CloudOff /> Offline</>}</b></div>
        <div><span>Changes waiting</span><b>{sync.pending}</b></div>
        <div><span>Last synced</span><b>{sync.lastSyncedAt ? formatDistanceToNow(new Date(sync.lastSyncedAt), { addSuffix: true }) : "Not yet this session"}</b></div>
        {sync.pulled > 0 && <div><span>From other devices</span><b>{sync.pulled} updates</b></div>}
      </div>
      {sync.lastError && <p className="formError" role="alert">{sync.lastError}</p>}
      <p className="hint">Every tap is saved on this device first. REPS syncs automatically when you’re online, every 45 seconds, and whenever you come back to the app — so your other devices stay in step.</p>
      <button className="primary" disabled={!online || sync.status === "syncing"} onClick={onSync}><RefreshCw className={sync.status === "syncing" ? "spin" : ""} /> Sync now</button>
    </Sheet>
  );
}
