"use client";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, CloudOff, FileJson, Upload } from "lucide-react";
import { defaultAlreadyCounted, parseBackup, planImport, suggestDestination, summarizeSources, type Backup, type Destination, type PlannedImport, type SourceSummary } from "@/lib/backup";
import { Sheet } from "./sheets";
import type { ImportProgress, Tracker } from "./use-tracker";

const fmt = (n: number) => new Intl.NumberFormat().format(n);
const day = (d: string | null) => (d ? format(parseISO(d), "MMM d, yyyy") : "—");
type Step = "pick" | "review" | "importing" | "summary";

/** Import a JSON backup into existing or new challenges, with a live preview, progress bar and summary. */
export function ImportSheet({ t, initialChallengeId, onClose }: { t: Tracker; initialChallengeId?: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [backup, setBackup] = useState<Backup | null>(null);
  const [invalidSets, setInvalidSets] = useState(0);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [progress, setProgress] = useState<ImportProgress>({ phase: "saving", done: 0, total: 0 });
  const [result, setResult] = useState<{ plans: PlannedImport[]; uploaded: boolean } | null>(null);
  const targets = t.challenges.filter((c) => c.status !== "archived");

  const plans = useMemo(() => (backup ? planImport(sources, destinations, t.challenges, t.sets, t.USER) : []), [backup, sources, destinations, t.challenges, t.sets, t.USER]);
  const planFor = (i: number) => plans.find((p) => p.source === sources[i]);
  const totalSets = plans.reduce((n, p) => n + p.sets.length, 0);

  async function pick(file: File) {
    setError("");
    try {
      const { backup: b, invalidSets: bad } = parseBackup(await file.text());
      const src = summarizeSources(b);
      const initial = targets.find((c) => c.id === initialChallengeId);
      setBackup(b); setInvalidSets(bad); setSources(src); setFileName(file.name);
      setDestinations(src.map((s) => {
        const sameMovement = initial && initial.activityName.trim().toLowerCase() === s.challenge.activityName.trim().toLowerCase();
        if (sameMovement) return { kind: "existing", challengeId: initial.id, alreadyCounted: defaultAlreadyCounted(initial, s, t.sets) };
        // Opened from one challenge: don't silently create others from unrelated history in the file.
        const suggested = suggestDestination(s, targets, t.sets);
        return initial && suggested.kind === "new" ? { kind: "skip" } : suggested;
      }));
      setStep("review");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t read that file."); }
  }

  function setDest(i: number, value: string) {
    setDestinations((d) => d.map((x, j) => {
      if (j !== i) return x;
      if (value === "skip" || value === "new") return { kind: value };
      const target = t.challenges.find((c) => c.id === value)!;
      return { kind: "existing", challengeId: value, alreadyCounted: defaultAlreadyCounted(target, sources[i], t.sets) };
    }));
  }

  async function run() {
    if (!plans.length) return;
    const snapshot = plans;
    setStep("importing");
    const uploaded = await t.importBackup(snapshot, setProgress);
    setResult({ plans: snapshot, uploaded });
    setStep("summary");
  }

  // Saving to the device is quick; uploading is the long part, so weight the bar accordingly.
  const pct = progress.phase === "done" ? 100 : progress.phase === "saving" ? (progress.total ? (progress.done / progress.total) * 30 : 30) : 30 + (progress.total ? (progress.done / progress.total) * 70 : 70);

  return (
    <Sheet eyebrow="IMPORT BACKUP" title={step === "summary" ? "Import complete" : step === "importing" ? "Importing…" : "Bring in your history"} onClose={onClose} closable={step !== "importing"} className="importSheet">
      {step === "pick" && (
        <>
          <p className="hint">Choose a <b>reps-backup.json</b> file exported from REPS. You’ll review exactly what gets imported before anything changes. Re-importing the same file is safe — duplicates are skipped.</p>
          <label className="filePick">
            <FileJson /><span><b>Choose backup file</b><small>.json from Settings → Export</small></span>
            <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          </label>
          {error && <p className="formError" role="alert">{error}</p>}
        </>
      )}

      {step === "review" && backup && (
        <>
          <p className="hint"><b>{fileName}</b>{backup.exportedAt ? ` · exported ${format(new Date(backup.exportedAt), "MMM d, yyyy")}` : ""}{invalidSets ? ` · ${invalidSets} unreadable sets ignored` : ""}</p>
          {sources.map((s, i) => {
            const d = destinations[i], plan = planFor(i);
            return (
              <article key={s.challenge.id} className="importRow">
                <header><b>{s.challenge.name}</b><small>{fmt(s.liveSets.length)} sets · {fmt(s.reps)} {s.challenge.unitLabel} · {day(s.firstDate)} – {day(s.lastDate)}{s.challenge.openingReps ? ` · +${fmt(s.challenge.openingReps)} previous` : ""}{s.deletedSets ? ` · ${s.deletedSets} deleted sets skipped` : ""}</small></header>
                <label>Import into
                  <select value={d.kind === "existing" ? d.challengeId : d.kind} onChange={(e) => setDest(i, e.target.value)}>
                    {targets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="new">A new challenge (“{s.challenge.name}”)</option>
                    <option value="skip">Don’t import</option>
                  </select>
                </label>
                {d.kind === "existing" && (
                  <label className="checkRow">
                    <input type="checkbox" checked={d.alreadyCounted} onChange={(e) => setDestinations((all) => all.map((x, j) => (j === i && x.kind === "existing" ? { ...x, alreadyCounted: e.target.checked } : x)))} />
                    <span><b>These reps are already in my “previous reps”</b><small>Turn sets into real history without double counting — your total stays the same.</small></span>
                  </label>
                )}
                {plan && (
                  <div className="importPreview">
                    <div><span>New sets</span><b>{fmt(plan.sets.length)} · {fmt(plan.reps)} {plan.target.unitLabel}</b></div>
                    {plan.duplicates > 0 && <div><span>Already imported</span><b>{fmt(plan.duplicates)} skipped</b></div>}
                    {!plan.isNew && <div><span>Previous reps</span><b>{fmt(plan.openingBefore)} → {fmt(plan.openingAfter)}</b></div>}
                    <div><span>Challenge total</span><b>{plan.isNew ? fmt(plan.totalAfter) : `${fmt(plan.totalBefore)} → ${fmt(plan.totalAfter)}`} / {fmt(plan.target.targetReps)}</b></div>
                    {d.kind === "existing" && d.alreadyCounted && plan.openingBefore < plan.reps && <p className="warn"><AlertTriangle /> Your previous reps ({fmt(plan.openingBefore)}) are less than the imported {fmt(plan.reps)}, so the total will go up by {fmt(plan.totalAfter - plan.totalBefore)}.</p>}
                  </div>
                )}
              </article>
            );
          })}
          <button className="primary" disabled={!plans.length || (!totalSets && plans.every((p) => !p.isNew && p.openingAfter === p.openingBefore))} onClick={() => void run()}>
            <Upload /> {totalSets ? `Import ${fmt(totalSets)} sets` : "Nothing new to import"}
          </button>
          <button className="textButton" onClick={() => { setStep("pick"); setBackup(null); }}>Choose a different file</button>
        </>
      )}

      {step === "importing" && (
        <div className="importProgress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Import progress">
          <div className="bar big"><i style={{ width: `${pct}%` }} /></div>
          <p><b>{Math.round(pct)}%</b> · {progress.phase === "saving" ? `Saving to this device… ${fmt(progress.done)} / ${fmt(progress.total)} sets` : `Uploading to your account… ${fmt(progress.done)} / ${fmt(progress.total)} changes`}</p>
          <p className="hint">Keep the app open. If you lose connection, everything is already safe on this device and will finish uploading automatically.</p>
        </div>
      )}

      {step === "summary" && result && (
        <>
          <p className={`importStatus ${result.uploaded ? "ok" : "pending"}`}>{result.uploaded ? <><CheckCircle2 /> Imported and synced to your account.</> : <><CloudOff /> Saved on this device — it will upload automatically when you’re back online.</>}</p>
          {result.plans.map((p) => (
            <article key={p.target.id} className="importRow">
              <header><b>{p.target.name}</b><small>{p.isNew ? "New challenge" : "Merged into existing challenge"} · from “{p.source.challenge.name}”</small></header>
              <div className="importPreview">
                <div><span>Sets imported</span><b>{fmt(p.sets.length)}</b></div>
                <div><span>{p.target.activityLabelPlural} imported</span><b>{fmt(p.reps)}</b></div>
                {p.duplicates > 0 && <div><span>Duplicates skipped</span><b>{fmt(p.duplicates)}</b></div>}
                {p.source.deletedSets > 0 && <div><span>Deleted sets skipped</span><b>{fmt(p.source.deletedSets)}</b></div>}
                {!p.isNew && <div><span>Previous reps</span><b>{fmt(p.openingBefore)} → {fmt(p.openingAfter)}</b></div>}
                <div><span>Challenge total</span><b>{fmt(p.totalAfter)} / {fmt(p.target.targetReps)} ({Math.min(100, Math.round((p.totalAfter / p.target.targetReps) * 100))}%)</b></div>
                <div><span>History</span><b>{day(p.source.firstDate)} – {day(p.source.lastDate)}</b></div>
              </div>
            </article>
          ))}
          {invalidSets > 0 && <p className="hint">{invalidSets} sets in the file were unreadable and were left out.</p>}
          <button className="primary" onClick={onClose}>Done</button>
        </>
      )}
    </Sheet>
  );
}
