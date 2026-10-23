"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronRight, Crown, Flame, History, Lock, Settings as SettingsIcon, Share2, Sparkles, Target, Trophy, UserPlus, X, Zap } from "lucide-react";
import { BIG_DAY_MILESTONES, LIFETIME_MILESTONES, STREAK_MILESTONES, computeStats } from "@/lib/gamification";
import { toLocalDate } from "@/lib/date-utils";
import type { Badge, Challenge, ExerciseSet } from "@/types";

const fmt = (n: number) => new Intl.NumberFormat().format(n);
const GLYPH: Record<string, string> = { trophy: "🏆", medal: "🏅", flame: "🔥", bolt: "⚡", spark: "✨", compass: "🧭" };

/** Native share sheet where available, clipboard otherwise. Resolves to a toast message. */
export async function shareLink(title: string, text: string, url: string) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return "Shared!"; } catch (e) { if ((e as Error).name === "AbortError") return null; }
  }
  try { await navigator.clipboard.writeText(url); return "Link copied — paste it anywhere."; } catch { window.prompt("Copy this link", url); return null; }
}
export const shareBadge = (b: Badge) => shareLink(`I earned “${b.title}” on REPS`, `${b.description} 💪`, `${location.origin}/b/${b.shareSlug}`);

export function BadgeMedal({ badge, size = "" }: { badge: Pick<Badge, "tier" | "icon">; size?: string }) {
  return <div className={`badgeMedal ${badge.tier} ${size}`}><span>{GLYPH[badge.icon] || "🏅"}</span></div>;
}

export function Celebration({ badge, onClose, onShare }: { badge: Badge; onClose: () => void; onShare: () => void }) {
  return (
    <div className="celebrateBackdrop" onClick={onClose}>
      <div className="confetti" aria-hidden>{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
      <section className="celebrate" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Badge unlocked">
        <button className="sheetClose" onClick={onClose} aria-label="Close"><X /></button>
        <p className="eyebrow">ACHIEVEMENT UNLOCKED</p>
        <BadgeMedal badge={badge} size="big" />
        <span className={`tierChip ${badge.tier}`}>{badge.tier}</span>
        <h2>{badge.title}</h2>
        <p>{badge.description}</p>
        <button className="primary" onClick={onShare}><Share2 /> Share with friends</button>
        <button className="outline" onClick={onClose}>Keep moving</button>
      </section>
    </div>
  );
}

/** Next unearned milestones with progress, so the badge wall always shows something to chase. */
function nextGoals(stats: ReturnType<typeof computeStats>) {
  const goals: { title: string; icon: string; current: number; target: number }[] = [];
  const top = stats.byActivity[0];
  if (top) { const m = LIFETIME_MILESTONES.find((x) => x > top.reps); if (m) goals.push({ title: `${fmt(m)} ${top.label}`, icon: "medal", current: top.reps, target: m }); }
  const s = STREAK_MILESTONES.find((x) => x > stats.longestStreak); if (s) goals.push({ title: `${s}-Day Streak`, icon: "flame", current: stats.currentStreak, target: s });
  const d = BIG_DAY_MILESTONES.find((x) => x > (stats.bestDay?.reps || 0)); if (d) goals.push({ title: `${fmt(d)}-Rep Day`, icon: "bolt", current: stats.bestDay?.reps || 0, target: d });
  if (stats.byActivity.length < 3) goals.push({ title: "Explorer", icon: "compass", current: stats.byActivity.length, target: 3 });
  return goals;
}

export function ProfileView({ challenges, sets, badges, userName, onInvite, onShareBadge }: { challenges: Challenge[]; sets: ExerciseSet[]; badges: Badge[]; userName: string; onInvite: () => void; onShareBadge: (b: Badge) => void }) {
  const stats = computeStats(challenges, sets, toLocalDate());
  const goals = nextGoals(stats);
  const maxActivity = Math.max(1, ...stats.byActivity.map((a) => a.reps));
  return (
    <div className="profilePage">
      <section className="profileHero">
        <div className="avatar">{(userName || "?").slice(0, 1).toUpperCase()}</div>
        <div className="profileName">
          <p className="eyebrow">ATHLETE</p>
          <h2>{userName}</h2>
          <div className="levelRow"><span className="levelChip"><Zap /> Level {stats.level}</span><small>{fmt(stats.xp)} / {fmt(stats.nextLevelXp)} XP</small></div>
          <div className="bar xp"><i style={{ width: `${stats.levelProgress}%` }} /></div>
        </div>
      </section>
      <section className="statGrid">
        <div><Target /><b>{fmt(stats.lifetimeReps)}</b><span>lifetime reps</span></div>
        <div><Flame /><b>{stats.currentStreak}</b><span>day streak</span></div>
        <div><Crown /><b>{stats.longestStreak}</b><span>best streak</span></div>
        <div><CalendarDays /><b>{stats.activeDays}</b><span>active days</span></div>
        <div><Sparkles /><b>{fmt(stats.totalSets)}</b><span>sets logged</span></div>
        <div><Trophy /><b>{stats.completedChallenges}</b><span>challenges won</span></div>
      </section>
      {stats.bestDay && <p className="bestDay">🔥 Best day: <b>{fmt(stats.bestDay.reps)} reps</b> on {format(parseISO(stats.bestDay.date), "MMM d, yyyy")}</p>}
      {stats.byActivity.length > 0 && (
        <section className="panel">
          <p className="eyebrow">BY MOVEMENT</p>
          <div className="activityBars">{stats.byActivity.map((a) => <div key={a.activity}><span>{a.label}</span><div className="bar"><i style={{ width: `${(a.reps / maxActivity) * 100}%` }} /></div><b>{fmt(a.reps)}</b></div>)}</div>
        </section>
      )}
      <section className="panel">
        <div className="sectionTitle"><div><p className="eyebrow">TROPHY CASE</p><h2>{badges.length} {badges.length === 1 ? "badge" : "badges"}</h2></div></div>
        {badges.length ? (
          <div className="badgeWall">{badges.map((b) => <button key={b.id} className="badgeTile" onClick={() => onShareBadge(b)} title="Share this badge"><BadgeMedal badge={b} /><b>{b.title}</b><small>{format(new Date(b.awardedAt), "MMM d")}</small><Share2 className="shareHint" /></button>)}</div>
        ) : <p className="muted">Log your first set to unlock your first badge.</p>}
        {goals.length > 0 && <><p className="eyebrow goalsTitle">UP NEXT</p><div className="goalList">{goals.map((g) => <div key={g.title} className="goal"><div className="badgeMedal locked"><Lock /></div><div><b>{g.title}</b><div className="bar"><i style={{ width: `${Math.min(100, (g.current / g.target) * 100)}%` }} /></div><small>{fmt(g.current)} / {fmt(g.target)}</small></div></div>)}</div></>}
      </section>
      <button className="inviteCard" onClick={onInvite}><UserPlus /><span><b>Invite friends</b><small>Share a link — they join your leaderboard instantly</small></span><ChevronRight /></button>
      <section className="panel links">
        <Link className="dataAction" href="/activity"><History /><span><b>History</b><small>Every set, including removed ones</small></span><ChevronRight /></Link>
        <Link className="dataAction" href="/settings"><SettingsIcon /><span><b>Settings</b><small>Preferences, backup and sign out</small></span><ChevronRight /></Link>
      </section>
    </div>
  );
}

interface Row { rank: number; userId: string; name: string; reps: number; sets: number; days: number; badges: number; isMe: boolean; targetReps?: number; completed?: boolean }
interface Board { friends: number; activities: string[]; groups: { id: string; name: string; members: number }[]; rows: Row[] }

export function LeaderboardView({ challenges, onInvite }: { challenges: Challenge[]; onInvite: (challengeId?: string) => void }) {
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  // A just-accepted invite opens straight onto that challenge's group ranking.
  const [scope, setScope] = useState<string>(() => { if (typeof window === "undefined") return ""; const joined = localStorage.getItem("reps-invite-challenge"); return joined ? `challenge:${joined}` : ""; });
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { localStorage.removeItem("reps-invite-challenge"); }, []);
  useEffect(() => {
    const q = new URLSearchParams({ period, today: toLocalDate() });
    if (scope.startsWith("challenge:")) q.set("challenge", scope.slice(10)); else if (scope) q.set("activity", scope);
    fetch(`/api/leaderboard?${q}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((b) => { setBoard(b); setError(""); }).catch(() => setError(navigator.onLine ? "Couldn’t load the leaderboard." : "You’re offline — the leaderboard will load when you reconnect."));
  }, [period, scope]);
  const groupScope = scope.startsWith("challenge:");
  const rows = board?.rows || [];
  const podium = rows.slice(0, 3);
  return (
    <div className="leaderPage">
      <div className="segmented">{(["week", "month", "all"] as const).map((p) => <button key={p} disabled={groupScope} className={period === p && !groupScope ? "active" : ""} onClick={() => setPeriod(p)}>{p === "week" ? "This week" : p === "month" ? "This month" : "All time"}</button>)}</div>
      <label className="scopeSelect">Ranking
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">All movements</option>
          {board?.activities.map((a) => <option key={a} value={a}>{a}</option>)}
          {board?.groups.length ? <optgroup label="Shared challenges">{board.groups.map((g) => { const mine = challenges.find((c) => c.id === g.id || c.sourceChallengeId === g.id); return <option key={g.id} value={`challenge:${mine?.id || g.id}`}>{g.name} · {g.members} people</option>; })}</optgroup> : null}
        </select>
      </label>
      {error && <p className="formError">{error}</p>}
      {board && rows.length > 1 && (
        <section className="podium">{[1, 0, 2].map((i) => podium[i] && <div key={podium[i].userId} className={`step p${i + 1} ${podium[i].isMe ? "me" : ""}`}><div className="avatar">{podium[i].name.slice(0, 1).toUpperCase()}</div><b>{podium[i].name}</b><span>{fmt(podium[i].reps)}</span><div className="block">{i === 0 ? <Crown /> : i + 1}</div></div>)}</section>
      )}
      {board && (
        <section className="panel">
          <ol className="rankList">{rows.map((r) => (
            <li key={r.userId} className={r.isMe ? "me" : ""}>
              <span className="rank">{r.rank}</span>
              <div className="avatar small">{r.name.slice(0, 1).toUpperCase()}</div>
              <div className="who"><b>{r.name}{r.isMe && " (you)"}</b><small>{r.days} active {r.days === 1 ? "day" : "days"} · {r.badges} 🏅{r.completed ? " · ✅ done" : ""}</small>{groupScope && r.targetReps ? <div className="bar"><i style={{ width: `${Math.min(100, (r.reps / r.targetReps) * 100)}%` }} /></div> : null}</div>
              <b className="score">{fmt(r.reps)}</b>
            </li>))}
          </ol>
        </section>
      )}
      {board && board.friends === 0 && (
        <section className="emptyBoard"><p className="eyebrow">BETTER TOGETHER</p><h2>Bring your crew</h2><p className="muted">Send an invite link. Friends who join appear here and you can race the same challenge.</p></section>
      )}
      <div className="inviteRow">
        <button className="primary" onClick={() => onInvite()}><UserPlus /> Invite friends</button>
        {challenges.filter((c) => c.status === "active").length > 0 && (
          <select className="outline" value="" onChange={(e) => e.target.value && onInvite(e.target.value)} aria-label="Invite to a challenge">
            <option value="">Invite to a challenge…</option>
            {challenges.filter((c) => c.status === "active").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
