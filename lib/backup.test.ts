import { describe, expect, it } from "vitest";
import { parseBackup, planImport, suggestDestination, summarizeSources } from "./backup";
import type { Challenge, ExerciseSet } from "@/types";

const oldPushups: Challenge = { id: "old-c", userId: "old-user", name: "10K Push-Up Challenge", activityName: "Push-up", activityLabelPlural: "Push-ups", unitLabel: "reps", targetMode: "total", targetReps: 10000, defaultRepsPerSet: 10, quickSetSizes: [5, 20, 25], activeWeekdays: [0, 1, 2, 3, 4, 5, 6], startDate: "2026-07-15", openingReps: 2650, status: "active", createdAt: "2026-07-15T08:00:00.000Z", updatedAt: "2026-07-15T08:00:00.000Z" };
const set = (i: number, reps: number, deletedAt?: string): ExerciseSet => { const d = new Date(Date.UTC(2026, 6, 16) + i * 3_600_000).toISOString(); return { id: `old-s${i}`, userId: "old-user", challengeId: "old-c", reps, performedAt: d, localDate: d.slice(0, 10), deletedAt, createdAt: d, updatedAt: d }; };
// 7,585 live reps across 611 sets, plus 4 deleted sets — the same shape as the real backup.
const backupSets = [...Array.from({ length: 610 }, (_, i) => set(i, 12)), set(610, 265), ...[1, 2, 3, 4].map((k) => set(700 + k, 10, "2026-09-01T00:00:00.000Z"))];
const file = JSON.stringify({ version: 1, exportedAt: "2026-10-19T19:19:44.328Z", challenges: [oldPushups], sets: backupSets });
const current: Challenge = { ...oldPushups, id: "new-c", userId: "me", name: "20K Push-ups", targetReps: 20000, openingReps: 10535, startDate: "2026-10-20" };

describe("backup import", () => {
  const { backup } = parseBackup(file);
  const sources = summarizeSources(backup);
  let n = 0; const ids = () => `id-${n++}`;

  it("summarises live and deleted sets", () => {
    expect(sources[0].liveSets).toHaveLength(611);
    expect(sources[0].reps).toBe(7585);
    expect(sources[0].deletedSets).toBe(4);
  });

  it("merges into the matching challenge and keeps the total when the reps were already counted", () => {
    const dest = suggestDestination(sources[0], [current], []);
    expect(dest).toEqual({ kind: "existing", challengeId: "new-c", alreadyCounted: true });
    const [plan] = planImport(sources, [dest], [current], [], "me", "2026-10-24T00:00:00.000Z", ids);
    expect(plan.sets).toHaveLength(611);
    expect(plan.reps).toBe(7585);
    expect(plan.openingBefore).toBe(10535);
    expect(plan.openingAfter).toBe(10535 - 7585);
    expect(plan.totalBefore).toBe(10535);
    expect(plan.totalAfter).toBe(10535);
    expect(plan.sets.every((s) => s.challengeId === "new-c" && s.userId === "me" && !s.id.startsWith("old-"))).toBe(true);
  });

  it("adds on top when the reps were not counted yet", () => {
    const [plan] = planImport(sources, [{ kind: "existing", challengeId: "new-c", alreadyCounted: false }], [{ ...current, openingReps: 0 }], [], "me", undefined, ids);
    expect(plan.totalAfter).toBe(7585);
  });

  it("is safe to import twice — duplicates are skipped", () => {
    const [first] = planImport(sources, [{ kind: "existing", challengeId: "new-c", alreadyCounted: true }], [current], [], "me", undefined, ids);
    const afterFirst = { ...current, openingReps: first.openingAfter };
    const [again] = planImport(sources, [{ kind: "existing", challengeId: "new-c", alreadyCounted: true }], [afterFirst], first.sets, "me", undefined, ids);
    expect(again.sets).toHaveLength(0);
    expect(again.duplicates).toBe(611);
    expect(again.openingAfter).toBe(first.openingAfter);
    expect(again.totalAfter).toBe(10535);
  });

  it("creates a fresh challenge (new id) carrying the backup's starting total", () => {
    const [plan] = planImport(sources, [{ kind: "new" }], [], [], "me", undefined, ids);
    expect(plan.target.id).not.toBe("old-c");
    expect(plan.totalAfter).toBe(2650 + 7585);
  });

  it("rejects files that aren't backups", () => {
    expect(() => parseBackup("{}")).toThrow(/REPS backup/);
    expect(() => parseBackup("nope")).toThrow(/valid JSON/);
  });
});
