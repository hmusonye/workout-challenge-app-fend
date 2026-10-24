import type { Challenge, ExerciseSet } from "@/types";

/** Shape written by Settings → Export. Older exports share it (version 1). */
export interface Backup { version: 1; exportedAt?: string; challenges: Challenge[]; sets: ExerciseSet[] }
export type Destination = { kind: "existing"; challengeId: string; alreadyCounted: boolean } | { kind: "new" } | { kind: "skip" };
export interface SourceSummary { challenge: Challenge; liveSets: ExerciseSet[]; deletedSets: number; reps: number; firstDate: string | null; lastDate: string | null }
export interface PlannedImport { source: SourceSummary; destination: Destination; target: Challenge; isNew: boolean; sets: ExerciseSet[]; duplicates: number; reps: number; openingBefore: number; openingAfter: number; totalBefore: number; totalAfter: number }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Validates a backup file. Throws a user-facing message on anything unusable; drops individually broken sets. */
export function parseBackup(text: string): { backup: Backup; invalidSets: number } {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^﻿/, "")); } catch { throw new Error("That file isn’t valid JSON."); }
  const d = data as Partial<Backup>;
  if (!d || typeof d !== "object" || d.version !== 1 || !Array.isArray(d.challenges) || !Array.isArray(d.sets)) throw new Error("This isn’t a REPS backup (expected version 1 with challenges and sets).");
  const challenges = d.challenges.filter((c): c is Challenge => !!c && typeof c.id === "string" && typeof c.name === "string" && typeof c.activityName === "string" && Number.isFinite(c.targetReps));
  if (!challenges.length) throw new Error("The backup contains no challenges.");
  const ids = new Set(challenges.map((c) => c.id));
  const sets = d.sets.filter((s): s is ExerciseSet => !!s && typeof s.id === "string" && ids.has(s.challengeId) && Number.isInteger(s.reps) && s.reps > 0 && DATE.test(String(s.localDate)) && isIso(s.performedAt));
  return { backup: { version: 1, exportedAt: d.exportedAt, challenges: challenges.map((c) => ({ ...c, openingReps: Number(c.openingReps) || 0, quickSetSizes: Array.isArray(c.quickSetSizes) ? c.quickSetSizes : [5, 20, 25], activeWeekdays: Array.isArray(c.activeWeekdays) ? c.activeWeekdays : [0, 1, 2, 3, 4, 5, 6] })), sets }, invalidSets: d.sets.length - sets.length };
}

export function summarizeSources(backup: Backup): SourceSummary[] {
  return backup.challenges.map((challenge) => {
    const own = backup.sets.filter((s) => s.challengeId === challenge.id);
    const liveSets = own.filter((s) => !s.deletedAt).sort((a, b) => a.performedAt.localeCompare(b.performedAt));
    return { challenge, liveSets, deletedSets: own.length - liveSets.length, reps: liveSets.reduce((n, s) => n + s.reps, 0), firstDate: liveSets[0]?.localDate ?? null, lastDate: liveSets.at(-1)?.localDate ?? null };
  });
}

/** Best default: the active challenge with the same movement, else a new challenge. */
export function suggestDestination(source: SourceSummary, existing: Challenge[], existingSets: ExerciseSet[]): Destination {
  if (!source.liveSets.length && !source.challenge.openingReps) return { kind: "skip" };
  const match = existing.filter((c) => c.status !== "archived" && c.activityName.trim().toLowerCase() === source.challenge.activityName.trim().toLowerCase())
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))[0];
  if (!match) return { kind: "new" };
  return { kind: "existing", challengeId: match.id, alreadyCounted: defaultAlreadyCounted(match, source, existingSets) };
}

/** If the challenge's "previous reps" can absorb the imported sets, they were almost certainly typed in as that starting total. */
export const defaultAlreadyCounted = (target: Challenge, source: SourceSummary, existingSets: ExerciseSet[]) => target.openingReps > 0 && target.openingReps >= newRepsFor(target, source, existingSets);

const signature = (s: Pick<ExerciseSet, "performedAt" | "reps">) => `${new Date(s.performedAt).toISOString()}|${s.reps}`;
function newRepsFor(target: Challenge, source: SourceSummary, existingSets: ExerciseSet[]) {
  const seen = new Set(existingSets.filter((s) => s.challengeId === target.id && !s.deletedAt).map(signature));
  return source.liveSets.filter((s) => !seen.has(signature(s))).reduce((n, s) => n + s.reps, 0);
}

const liveTotal = (c: Challenge, sets: ExerciseSet[]) => c.openingReps + sets.filter((s) => s.challengeId === c.id && !s.deletedAt).reduce((n, s) => n + s.reps, 0);

/**
 * Turns a mapping into concrete rows. Sets get fresh ids (the originals may belong to another account on the server),
 * duplicates of sets already in the target are skipped (so re-importing is safe), and deleted sets are never imported.
 * With `alreadyCounted`, the target's "previous reps" shrinks by the imported amount so the overall total is unchanged.
 */
export function planImport(sources: SourceSummary[], destinations: Destination[], existing: Challenge[], existingSets: ExerciseSet[], userId: string, now = new Date().toISOString(), newId: () => string = () => crypto.randomUUID()): PlannedImport[] {
  const plans: PlannedImport[] = [];
  sources.forEach((source, i) => {
    const destination = destinations[i] || { kind: "skip" };
    if (destination.kind === "skip") return;
    const isNew = destination.kind === "new";
    const base = isNew ? undefined : existing.find((c) => c.id === destination.challengeId);
    if (!isNew && !base) return;
    const target: Challenge = base ? { ...base } : { ...source.challenge, id: newId(), userId, sourceChallengeId: undefined, deletedAt: undefined, completedAt: undefined, status: source.challenge.status === "archived" ? "archived" : "active", createdAt: now, updatedAt: now };
    const seen = new Set(isNew ? [] : existingSets.filter((s) => s.challengeId === target.id && !s.deletedAt).map(signature));
    const sets: ExerciseSet[] = [];
    let duplicates = 0;
    for (const s of source.liveSets) {
      const sig = signature(s);
      if (seen.has(sig)) { duplicates++; continue; }
      seen.add(sig);
      sets.push({ id: newId(), userId, challengeId: target.id, reps: s.reps, performedAt: new Date(s.performedAt).toISOString(), localDate: s.localDate, notes: s.notes, createdAt: isIso(s.createdAt) ? s.createdAt : s.performedAt, updatedAt: now, syncStatus: "pending" });
    }
    const reps = sets.reduce((n, s) => n + s.reps, 0);
    const totalBefore = isNew ? 0 : liveTotal(target, existingSets);
    const openingBefore = isNew ? 0 : target.openingReps;
    const alreadyCounted = destination.kind === "existing" && destination.alreadyCounted;
    // A new challenge carries over the backup's own starting total; an existing one keeps its total when the reps were already counted.
    const openingAfter = isNew ? source.challenge.openingReps : alreadyCounted ? Math.max(0, openingBefore - reps) : openingBefore;
    target.openingReps = openingAfter;
    const totalAfter = openingAfter + (isNew ? 0 : totalBefore - openingBefore) + reps;
    plans.push({ source, destination, target, isNew, sets, duplicates, reps, openingBefore, openingAfter, totalBefore, totalAfter });
  });
  return plans;
}
