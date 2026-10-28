"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { localDb, type PendingMutation } from "@/db/dexie";
import { toLocalDate } from "@/lib/date-utils";
import { cue, loadSoundPrefs, setHaptics } from "@/lib/feedback";
import { isChallengeComplete } from "@/lib/gamification";
import { applyTheme, readThemePref, watchSystemTheme, type ThemePref } from "@/lib/theme";
import { totalProgress } from "@/lib/challenge-math";
import type { Badge, Challenge, ExerciseSet, UserSettings } from "@/types";
import { shareLink } from "@/components/social-views";
import { normalizeChallenge } from "@/lib/serialize";
import type { PlannedImport } from "@/lib/backup";

export interface ImportProgress { phase: "saving" | "uploading" | "done"; done: number; total: number }

export type SyncStatus = "saved" | "syncing" | "offline" | "error";
export interface SyncInfo { status: SyncStatus; pending: number; lastSyncedAt: string | null; lastError: string | null; pulled: number }
export interface Toast { id: number; message: string; action?: { label: string; run: () => void } }

const nowIso = () => new Date().toISOString();
const TIER_RANK = { platinum: 4, gold: 3, silver: 2, bronze: 1 };
const byImportance = (list: Badge[]) => [...list].sort((a, b) => Number(b.code.startsWith("challenge:")) - Number(a.code.startsWith("challenge:")) || TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.value - a.value);
const isCreate = (m: PendingMutation) => Number(m.entityType === "challenge" && m.action === "create");
const SYNC_INTERVAL_MS = 45_000;
const BATCH = 100;

/** All tracker state and actions. Local-first: every write lands in IndexedDB + the mutation queue, then syncs. */
export function useTracker(userId: string) {
  const USER = userId;
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [sets, setSets] = useState<ExerciseSet[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const [badges, setBadges] = useState<Badge[]>([]);
  const [celebrating, setCelebrating] = useState<Badge[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [sync, setSync] = useState<SyncInfo>({ status: "saved", pending: 0, lastSyncedAt: null, lastError: null, pulled: 0 });
  const toastTimer = useRef<number | undefined>(undefined);
  const syncRun = useRef<Promise<boolean> | null>(null);
  const syncAgain = useRef(false);
  const lastTap = useRef(0);
  const state = useRef({ challenges, sets, settings });
  state.current = { challenges, sets, settings };
  const cursorKey = `reps-cursor:${USER}`;

  const showToast = useCallback((message: string, action?: Toast["action"], ms = 4500) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, action });
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const addBadges = useCallback((list: Badge[], celebrate: boolean) => {
    if (!list.length) return;
    setBadges((prev) => {
      const m = new Map(prev.map((b) => [b.code, b]));
      list.forEach((b) => m.set(b.code, b));
      const next = [...m.values()].sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
      try { localStorage.setItem(`reps-badges:${USER}`, JSON.stringify(next)); } catch {}
      return next;
    });
    if (celebrate) { setCelebrating((q) => byImportance([...q, ...list]).slice(0, 3)); cue("complete"); }
  }, [USER]);

  const countPending = useCallback(async () => localDb.mutations.where("userId").equals(USER).count(), [USER]);

  /** Merge server rows into local state, skipping anything with unsent local edits. Returns how many rows changed. */
  const applyRemote = useCallback(async (remote: { challenges?: (Challenge & { deletedAt?: string })[]; sets?: ExerciseSet[] }) => {
    const pending = await localDb.mutations.where("userId").equals(USER).toArray();
    const pendingIds = new Set(pending.map((m) => m.entityId));
    const { challenges: localC, sets: localS } = state.current;
    const cById = new Map(localC.map((c) => [c.id, c])), sById = new Map(localS.map((s) => [s.id, s]));
    const removed: string[] = [], putC: Challenge[] = [], putS: ExerciseSet[] = [];
    for (const c of remote.challenges || []) {
      if (pendingIds.has(c.id)) continue;
      if (c.deletedAt) { if (cById.has(c.id)) removed.push(c.id); continue; }
      const { deletedAt: _d, ...rest } = c; void _d;
      const clean = normalizeChallenge(rest);
      const mine = cById.get(c.id);
      if (!mine || mine.updatedAt < c.updatedAt || mine.status !== c.status) putC.push(clean);
    }
    for (const s of remote.sets || []) {
      if (pendingIds.has(s.id)) continue;
      const mine = sById.get(s.id);
      if (!mine || mine.updatedAt < s.updatedAt || Boolean(mine.deletedAt) !== Boolean(s.deletedAt)) putS.push({ ...s, syncStatus: "synced" });
    }
    if (!removed.length && !putC.length && !putS.length) return 0;
    await localDb.transaction("rw", localDb.challenges, localDb.sets, async () => {
      if (removed.length) await localDb.challenges.bulkDelete(removed);
      if (putC.length) await localDb.challenges.bulkPut(putC);
      if (putS.length) await localDb.sets.bulkPut(putS);
    });
    setChallenges((x) => { const m = new Map(x.map((c) => [c.id, c])); removed.forEach((id) => m.delete(id)); putC.forEach((c) => m.set(c.id, c)); return [...m.values()]; });
    setSets((x) => { const m = new Map(x.map((s) => [s.id, s])); putS.forEach((s) => m.set(s.id, s)); return [...m.values()]; });
    return removed.length + putC.length + putS.length;
  }, [USER]);

  /** Push queued mutations in batches and pull changes from other devices. Concurrent calls coalesce. */
  const runSync = useCallback(async (onProgress?: (done: number, total: number) => void): Promise<boolean> => {
    if (syncRun.current) {
      // Join the run in flight (it re-loops for new mutations). Progress callers then run once more to report their own upload.
      syncAgain.current = true;
      const result = await syncRun.current;
      const stillRunning = syncRun.current as Promise<boolean> | null; // may have been replaced while awaiting
      if (!onProgress || stillRunning) return result;
    }
    const run = (async () => {
      if (!navigator.onLine) { setSync((s) => ({ ...s, status: "offline", lastError: null })); return false; }
      setSync((s) => ({ ...s, status: "syncing" }));
      let pulled = 0;
      try {
        do {
          syncAgain.current = false;
          const mutations = (await localDb.mutations.where("userId").equals(USER).toArray())
            .sort((a, b) => isCreate(b) - isCreate(a) || a.occurredAt.localeCompare(b.occurredAt) || Number(b.entityType === "challenge") - Number(a.entityType === "challenge"));
          const batches = mutations.length ? Array.from({ length: Math.ceil(mutations.length / BATCH) }, (_, i) => mutations.slice(i * BATCH, i * BATCH + BATCH)) : [[]];
          let sent = 0;
          const total = mutations.length;
          onProgress?.(0, total);
          for (const batch of batches) {
            const cursor = localStorage.getItem(cursorKey) || undefined;
            const r = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutations: batch, today: toLocalDate(), cursor }) });
            if (r.status === 401) throw new Error("Signed out — sign in again to sync.");
            if (!r.ok) throw new Error(`Server returned ${r.status}`);
            const body = await r.json();
            if (!Array.isArray(body.accepted) || batch.some((m) => !body.accepted.includes(m.id))) throw new Error("Server did not accept every change");
            await localDb.mutations.bulkDelete(body.accepted);
            if (body.accepted.length) setSets((x) => x.map((s) => batch.some((m) => m.entityId === s.id) ? { ...s, syncStatus: "synced" } : s));
            pulled += await applyRemote(body);
            if (body.newBadges?.length) addBadges(body.newBadges, true);
            if (body.cursor) localStorage.setItem(cursorKey, body.cursor);
            sent += batch.length;
            onProgress?.(sent, total);
          }
        } while (syncAgain.current);
        const pending = await countPending();
        setSync({ status: "saved", pending, lastSyncedAt: nowIso(), lastError: null, pulled });
        return true;
      } catch (e) {
        const pending = await countPending();
        setSync((s) => ({ ...s, status: navigator.onLine ? "error" : "offline", pending, lastError: e instanceof Error ? e.message : "Sync failed" }));
        return false;
      }
    })();
    syncRun.current = run;
    try { return await run; } finally { syncRun.current = null; }
  }, [USER, cursorKey, applyRemote, addBadges, countPending]);

  const queue = useCallback(async (m: Omit<PendingMutation, "id" | "userId" | "occurredAt"> & { occurredAt?: string }) => {
    await localDb.mutations.add({ id: crypto.randomUUID(), userId: USER, occurredAt: nowIso(), ...m });
    setSync((s) => ({ ...s, pending: s.pending + 1 }));
    return runSync();
  }, [USER, runSync]);

  const audit = (entityType: string, entityId: string, action: string, summary: string) =>
    localDb.audit.add({ id: crypto.randomUUID(), userId: USER, entityId, entityType, action, occurredAt: nowIso(), summary });

  /** Queue device-only rows (created before sign-in, or while sync was broken) so they reach the server once. */
  async function backfill(localC: Challenge[], localS: ExerciseSet[], remote: { challenges: Challenge[]; sets: ExerciseSet[] }, pending: PendingMutation[], deleted: Set<string>) {
    const pendingIds = new Set(pending.map((m) => m.entityId));
    const rc = new Set(remote.challenges.map((x) => x.id)), rs = new Set(remote.sets.map((x) => x.id));
    const known = new Set([...rc, ...pending.filter((m) => m.entityType === "challenge").map((m) => m.entityId)]);
    const muts: PendingMutation[] = [];
    const m = (entityType: PendingMutation["entityType"], entityId: string, action: PendingMutation["action"], payload: Record<string, unknown>, occurredAt: string) => muts.push({ id: crypto.randomUUID(), userId: USER, entityType, entityId, action, payload, occurredAt });
    for (const c of localC) {
      if (c.userId !== USER || known.has(c.id) || deleted.has(c.id)) continue;
      known.add(c.id);
      const first = localS.filter((x) => x.challengeId === c.id).map((x) => x.createdAt || x.performedAt).sort()[0];
      m("challenge", c.id, "create", { ...c }, [c.createdAt || nowIso(), first].filter(Boolean).sort()[0]!);
    }
    for (const x of localS) {
      if (x.userId !== USER || rs.has(x.id) || pendingIds.has(x.id) || !known.has(x.challengeId) || deleted.has(x.challengeId)) continue;
      m("exercise_set", x.id, "create", { ...x, deletedAt: undefined }, x.createdAt || x.performedAt);
      if (x.deletedAt) m("exercise_set", x.id, x.deletedReason || "delete", { ...x }, x.deletedAt);
    }
    if (muts.length) await localDb.mutations.bulkAdd(muts);
    return muts.length;
  }

  /** The original app stored data under "local-owner" before accounts existed; adopt it once. */
  async function claimLegacy() {
    if (localStorage.getItem("reps-legacy-claimed")) return;
    if (!(await localDb.challenges.where("userId").equals("local-owner").count())) return;
    await localDb.transaction("rw", [localDb.challenges, localDb.sets, localDb.settings, localDb.mutations, localDb.audit], async () => {
      await localDb.challenges.where("userId").equals("local-owner").modify({ userId: USER });
      await localDb.sets.where("userId").equals("local-owner").modify({ userId: USER });
      await localDb.settings.where("userId").equals("local-owner").modify({ userId: USER });
      await localDb.mutations.toCollection().modify((m) => { if (!m.userId) m.userId = USER; if (m.payload.userId === "local-owner") m.payload.userId = USER; });
      await localDb.audit.toCollection().modify((a) => { if (!a.userId) a.userId = USER; });
    });
    localStorage.setItem("reps-legacy-claimed", USER);
  }

  async function load() {
    try { setBadges(JSON.parse(localStorage.getItem(`reps-badges:${USER}`) || "[]")); } catch {}
    const pref = readThemePref();
    setThemeState(pref); applyTheme(pref); loadSoundPrefs();
    await claimLegacy();
    await runSync();
    let [c, s, st] = await Promise.all([localDb.challenges.where("userId").equals(USER).toArray(), localDb.sets.where("userId").equals(USER).toArray(), localDb.settings.where("userId").equals(USER).first()]);
    let backfilled = 0;
    if (navigator.onLine) {
      try {
        const response = await fetch(`/api/bootstrap?today=${toLocalDate()}`);
        if (response.ok) {
          const remote = await response.json();
          const pending = await localDb.mutations.where("userId").equals(USER).toArray();
          const pendingIds = new Set(pending.map((m) => m.entityId));
          const deleted = new Set<string>(remote.deletedChallengeIds || []);
          backfilled = await backfill(c, s, remote, pending, deleted);
          if (Array.isArray(remote.badges)) addBadges(remote.badges, false);
          if (remote.newBadges?.length) setCelebrating(byImportance(remote.newBadges).slice(0, 3));
          const merge = <T extends { id: string }>(local: T[], server: T[]) => { const m = new Map(local.map((i) => [i.id, i])); for (const i of server) if (!pendingIds.has(i.id) || !m.has(i.id)) m.set(i.id, i); return [...m.values()]; };
          // Challenges deleted on another device disappear here too.
          c = merge(c.filter((x) => !deleted.has(x.id)), (remote.challenges as Challenge[]).map(normalizeChallenge));
          s = merge(s, remote.sets);
          st = remote.settings || st;
          if (remote.cursor) localStorage.setItem(cursorKey, remote.cursor);
          await localDb.transaction("rw", localDb.challenges, localDb.sets, localDb.settings, async () => { if (deleted.size) await localDb.challenges.bulkDelete([...deleted]); await localDb.challenges.bulkPut(c); await localDb.sets.bulkPut(s); if (st) await localDb.settings.put(st); });
        }
      } catch {}
    }
    c = c.map(normalizeChallenge);
    if (c.length && st && !st.onboardingComplete) { st = { ...st, onboardingComplete: true }; await localDb.settings.put(st); void saveSettingsRemote(st); }
    setChallenges(c); setSets(s); setSettings(st || null);
    setHaptics(st?.hapticsEnabled ?? true);
    const stored = localStorage.getItem(`reps-active:${USER}`);
    const selected = c.find((x) => x.id === stored && x.status !== "archived") || c.find((x) => x.status === "active") || c[0];
    if (selected) setActiveId(selected.id);
    setReady(true);
    if (backfilled) void runSync(); else void countPending().then((pending) => setSync((x) => ({ ...x, pending })));
  }

  useEffect(() => {
    void load();
    const online = () => void runSync();
    const offline = () => setSync((s) => ({ ...s, status: "offline" }));
    const visible = () => { if (document.visibilityState === "visible") void runSync(); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) void runSync(); }, SYNC_INTERVAL_MS);
    const unwatch = watchSystemTheme(readThemePref);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible); window.clearInterval(timer); unwatch(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = challenges.find((c) => c.id === activeId && c.status !== "archived") || challenges.find((c) => c.status === "active") || challenges.find((c) => c.status !== "archived");

  function activate(id: string, announce = true) {
    setActiveId(id);
    localStorage.setItem(`reps-active:${USER}`, id);
    lastTap.current = 0;
    const c = state.current.challenges.find((x) => x.id === id);
    if (announce && c) showToast(`Now recording ${c.activityLabelPlural.toLowerCase()}`, undefined, 2500);
  }

  async function saveSettingsRemote(st: UserSettings) {
    try { await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(st) }); } catch {}
  }

  async function updateSettings(patch: Partial<UserSettings>) {
    const base = state.current.settings;
    if (!base) return;
    const next = { ...base, ...patch };
    setSettings(next);
    if ("hapticsEnabled" in patch) setHaptics(next.hapticsEnabled);
    if (patch.theme) setTheme(patch.theme);
    await localDb.settings.put(next);
    void saveSettingsRemote(next);
  }

  function setTheme(pref: ThemePref) {
    setThemeState(pref); applyTheme(pref);
    const st = state.current.settings;
    if (st && st.theme !== pref) { const next = { ...st, theme: pref }; setSettings(next); void localDb.settings.put(next); void saveSettingsRemote(next); }
  }

  async function completeChallenge(c: Challenge) {
    const iso = nowIso();
    const updated: Challenge = { ...c, status: "completed", completedAt: iso, updatedAt: iso };
    await localDb.challenges.put(updated);
    setChallenges((x) => x.map((y) => (y.id === c.id ? updated : y)));
    cue("complete");
    showToast(`🏆 ${c.name} complete!`, undefined, 6000);
    const next = state.current.challenges.find((y) => y.id !== c.id && y.status === "active");
    if (next) activate(next.id, false);
    const saved = await queue({ entityType: "challenge", entityId: c.id, action: "update", payload: { ...updated } });
    if (!saved) showToast(`🏆 ${c.name} complete! Your badge will be minted when you’re back online.`, undefined, 6000);
  }

  async function record(reps: number, opts: { date?: string; notes?: string; challenge?: Challenge; fromTap?: boolean } = {}) {
    const target = opts.challenge || active;
    if (!target || !Number.isInteger(reps) || reps < 1) return;
    if (opts.fromTap) { const stamp = Date.now(); if (stamp - lastTap.current < 350) return; lastTap.current = stamp; }
    const iso = nowIso(), date = opts.date || toLocalDate();
    const entry: ExerciseSet = { id: crypto.randomUUID(), userId: USER, challengeId: target.id, reps, performedAt: iso, localDate: date, notes: opts.notes, createdAt: iso, updatedAt: iso, syncStatus: "pending" };
    await localDb.transaction("rw", localDb.sets, localDb.audit, async () => { await localDb.sets.add(entry); await audit("exercise_set", entry.id, "create", `Recorded ${reps} ${target.unitLabel}`); });
    setSets((x) => [...x, entry]);
    cue("record");
    showToast(`+${reps} ${target.activityLabelPlural}${date !== toLocalDate() ? ` on ${date}` : ""}`, { label: "Undo", run: () => void softDelete(entry, "undo") });
    const before = state.current.sets.filter((s) => s.challengeId === target.id);
    const crossesTarget = target.status === "active" && isChallengeComplete(target, [...before, entry], date > toLocalDate() ? date : toLocalDate());
    void queue({ entityType: "exercise_set", entityId: entry.id, action: "create", payload: { ...entry }, occurredAt: iso });
    if (crossesTarget) void completeChallenge(target);
    else if (target.targetMode === "total") {
      const prev = totalProgress(target, before, date).currentTotal, now = prev + reps;
      if (Math.floor(now / 1000) > Math.floor(prev / 1000)) cue("milestone");
    }
  }

  async function softDelete(entry: ExerciseSet, action: "undo" | "delete" = "undo") {
    const iso = nowIso();
    const updated: ExerciseSet = { ...entry, deletedAt: iso, deletedReason: action, updatedAt: iso, syncStatus: "pending" };
    await localDb.sets.put(updated);
    await audit("exercise_set", entry.id, action, `${action === "undo" ? "Undid" : "Deleted"} ${entry.reps} reps`);
    setSets((x) => x.map((s) => (s.id === entry.id ? updated : s)));
    showToast("Set removed", { label: "Restore", run: () => void restore(updated) });
    void queue({ entityType: "exercise_set", entityId: entry.id, action, payload: { ...updated }, occurredAt: iso });
  }

  async function restore(entry: ExerciseSet) {
    const iso = nowIso();
    const updated: ExerciseSet = { ...entry, deletedAt: undefined, deletedReason: undefined, updatedAt: iso, syncStatus: "pending" };
    await localDb.sets.put(updated);
    await audit("exercise_set", entry.id, "restore", `Restored ${entry.reps} reps`);
    setSets((x) => x.map((s) => (s.id === entry.id ? updated : s)));
    showToast("Set restored");
    void queue({ entityType: "exercise_set", entityId: entry.id, action: "restore", payload: { ...updated }, occurredAt: iso });
  }

  async function updateSet(entry: ExerciseSet, patch: Partial<Pick<ExerciseSet, "reps" | "localDate" | "notes" | "challengeId">>) {
    const iso = nowIso();
    const updated: ExerciseSet = { ...entry, ...patch, updatedAt: iso, syncStatus: "pending" };
    if (!Number.isInteger(updated.reps) || updated.reps < 1) return;
    await localDb.sets.put(updated);
    await audit("exercise_set", entry.id, "update", entry.reps !== updated.reps ? `Changed ${entry.reps} to ${updated.reps} reps` : "Edited set");
    setSets((x) => x.map((s) => (s.id === entry.id ? updated : s)));
    showToast("Set updated");
    void queue({ entityType: "exercise_set", entityId: entry.id, action: "update", payload: { ...updated }, occurredAt: iso });
  }

  async function createChallenge(draft: Challenge, onboarding = false) {
    const iso = nowIso();
    const c: Challenge = { ...draft, userId: USER, endDate: draft.endDate || undefined, createdAt: iso, updatedAt: iso };
    await localDb.challenges.put(c);
    await audit("challenge", c.id, "create", `Created ${c.name}`);
    setChallenges((x) => (x.some((y) => y.id === c.id) ? x : [...x, c]));
    activate(c.id, false);
    if (onboarding || !state.current.settings?.onboardingComplete) {
      const st: UserSettings = { id: state.current.settings?.id || crypto.randomUUID(), userId: USER, fallbackDefaultRepsPerSet: 10, hapticsEnabled: true, weekStartsOn: 1, theme: theme, ...state.current.settings, onboardingComplete: true };
      await localDb.settings.put(st); setSettings(st); void saveSettingsRemote(st);
    }
    const saved = await queue({ entityType: "challenge", entityId: c.id, action: "create", payload: { ...c } });
    showToast(saved ? "Challenge saved — let’s move!" : "Challenge saved offline — it will sync automatically.");
    return c;
  }

  /** Edits any field of a challenge, including while it's running. Raising a met target reopens it. */
  async function updateChallenge(c: Challenge, patch: Partial<Challenge>, quiet = false) {
    const iso = nowIso();
    let next: Challenge = { ...c, ...patch, updatedAt: iso };
    if (!next.endDate) next.endDate = undefined;
    const done = isChallengeComplete(next, state.current.sets.filter((s) => s.challengeId === c.id), toLocalDate());
    if (c.status === "completed" && next.status === "completed" && !done) next = { ...next, status: "active", completedAt: undefined };
    await localDb.challenges.put(next);
    if (!quiet) await audit("challenge", c.id, "update", `Edited ${next.name}`);
    setChallenges((x) => x.map((y) => (y.id === c.id ? next : y)));
    if (!quiet) showToast(next.status === "active" && c.status === "completed" ? "Challenge reopened with the new target" : "Challenge updated");
    void queue({ entityType: "challenge", entityId: c.id, action: "update", payload: { ...next }, occurredAt: iso });
    return next;
  }

  async function deleteChallenge(c: Challenge) {
    const recorded = state.current.sets.filter((s) => s.challengeId === c.id && !s.deletedAt).length;
    if (!window.confirm(`Delete “${c.name}”? ${recorded ? `${recorded} recorded ${recorded === 1 ? "set" : "sets"} will remain in your history.` : "This challenge has no recorded sets."}`)) return false;
    const remaining = state.current.challenges.filter((x) => x.id !== c.id);
    await localDb.challenges.delete(c.id);
    await audit("challenge", c.id, "delete", `Deleted ${c.name}`);
    setChallenges(remaining);
    if (active?.id === c.id) {
      const next = remaining.find((x) => x.status === "active") || remaining.find((x) => x.status !== "archived");
      if (next) activate(next.id, false); else { setActiveId(""); localStorage.removeItem(`reps-active:${USER}`); }
    }
    const saved = await queue({ entityType: "challenge", entityId: c.id, action: "delete", payload: { id: c.id } });
    showToast(saved ? "Challenge deleted. Recorded sets were kept." : "Challenge removed offline — deletion will sync automatically.");
    return true;
  }

  /** Writes a planned backup import to the device, then uploads it with progress. Returns whether the upload finished. */
  async function importBackup(plans: PlannedImport[], onProgress: (p: ImportProgress) => void) {
    const total = plans.reduce((n, p) => n + p.sets.length, 0);
    let done = 0;
    onProgress({ phase: "saving", done, total });
    const touched: Challenge[] = [], added: ExerciseSet[] = [];
    for (const plan of plans) {
      const iso = nowIso();
      if (plan.isNew) {
        await localDb.challenges.put(plan.target);
        await localDb.mutations.add({ id: crypto.randomUUID(), userId: USER, entityType: "challenge", entityId: plan.target.id, action: "create", payload: { ...plan.target }, occurredAt: plan.target.createdAt });
        touched.push(plan.target);
      } else if (plan.openingAfter !== plan.openingBefore) {
        const updated = { ...plan.target, updatedAt: iso };
        await localDb.challenges.put(updated);
        await localDb.mutations.add({ id: crypto.randomUUID(), userId: USER, entityType: "challenge", entityId: updated.id, action: "update", payload: { ...updated }, occurredAt: iso });
        touched.push(updated);
      }
      for (let i = 0; i < plan.sets.length; i += 100) {
        const chunk = plan.sets.slice(i, i + 100);
        await localDb.transaction("rw", localDb.sets, localDb.mutations, async () => {
          await localDb.sets.bulkAdd(chunk);
          await localDb.mutations.bulkAdd(chunk.map((s) => ({ id: crypto.randomUUID(), userId: USER, entityType: "exercise_set" as const, entityId: s.id, action: "create" as const, payload: { ...s }, occurredAt: iso })));
        });
        added.push(...chunk);
        done += chunk.length;
        onProgress({ phase: "saving", done, total });
      }
      await audit("data_import", plan.target.id, "import", `Imported ${plan.sets.length} sets (${plan.reps} ${plan.target.unitLabel}) into ${plan.target.name}`);
    }
    setChallenges((x) => { const m = new Map(x.map((c) => [c.id, c])); touched.forEach((c) => m.set(c.id, c)); return [...m.values()]; });
    setSets((x) => [...x, ...added]);
    setSync((x) => ({ ...x, pending: x.pending + added.length + touched.length }));
    const uploaded = await runSync((d, t) => onProgress({ phase: "uploading", done: d, total: t }));
    onProgress({ phase: "done", done: total, total });
    return uploaded;
  }

  async function invite(challengeId?: string) {
    try {
      const r = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(challengeId ? { challengeId } : {}) });
      if (!r.ok) throw new Error();
      const { url } = await r.json();
      const c = state.current.challenges.find((x) => x.id === challengeId);
      const msg = await shareLink("Train with me on REPS", c ? `Join my ${c.name} and let’s race on the leaderboard!` : "Join me on REPS — track sets, earn badges, climb the leaderboard.", url);
      if (msg) showToast(msg);
    } catch { showToast(navigator.onLine ? "Couldn’t create an invite. Try again." : "Invites need a connection — try again when online."); }
  }

  return {
    USER, ready, challenges, sets, settings, active, badges, celebrating, setCelebrating, toast, setToast, showToast, sync, runSync, theme, setTheme,
    activate, record, softDelete, restore, updateSet, createChallenge, updateChallenge, deleteChallenge, updateSettings, invite, importBackup,
  };
}
export type Tracker = ReturnType<typeof useTracker>;
