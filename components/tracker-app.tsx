"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import { Activity, AlertTriangle, CalendarDays, Cloud, CloudOff, Crown, Dumbbell, Monitor, Moon, RefreshCw, Settings as SettingsIcon, Sun, Trophy, UserRound, X } from "lucide-react";
import { Celebration, LeaderboardView, ProfileView, shareBadge } from "@/components/social-views";
import { ChallengeEditor, ChallengeWizard } from "@/components/tracker/challenge-form";
import { ActivityView, CalendarView, ChallengesView, SettingsView } from "@/components/tracker/other-views";
import { ImportSheet } from "@/components/tracker/import-sheet";
import { CustomSetSheet, SetEditorSheet, SyncSheet } from "@/components/tracker/sheets";
import { TodayView } from "@/components/tracker/today-view";
import { useTracker } from "@/components/tracker/use-tracker";
import { TimerPill, WorkoutTimer, readTimer } from "@/components/tracker/workout-timer";
import type { ThemePref } from "@/lib/theme";
import type { Challenge, ExerciseSet } from "@/types";

type View = "today" | "calendar" | "challenges" | "settings" | "activity" | "profile" | "leaderboard";
const TITLES: Record<View, string> = { today: "", calendar: "Calendar", challenges: "Challenges", settings: "Settings", activity: "History", profile: "Profile", leaderboard: "Leaderboard" };
const NAV: [string, typeof Activity, string][] = [["/", Activity, "Today"], ["/calendar", CalendarDays, "Calendar"], ["/challenges", Trophy, "Challenges"], ["/leaderboard", Crown, "Leaders"], ["/profile", UserRound, "Profile"]];
const NEXT_THEME: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

export default function TrackerApp({ userId, userName = "Athlete" }: { userId: string; userName?: string }) {
  const t = useTracker(userId);
  const pathname = usePathname();
  const segment = pathname.split("/")[1] || "today";
  const view: View = segment === "onboarding" ? "today" : (segment in TITLES ? segment : "today") as View;
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState<{ challengeId: string; date?: string; reps: number } | null>(null);
  const [editingSet, setEditingSet] = useState<ExerciseSet | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [importing, setImporting] = useState<{ challengeId?: string } | null>(null);

  if (!t.ready) return <main className="loading"><div className="pulseLogo"><Dumbbell /></div><p>Warming up your tracker…</p></main>;
  if (!t.settings?.onboardingComplete || !t.challenges.length) return <ChallengeWizard userId={t.USER} defaultReps={t.settings?.fallbackDefaultRepsPerSet} onFinish={(c) => t.createChallenge(c, true)} />;

  const active = t.active;
  const path = view === "today" ? "/" : `/${view}`;
  const openCustom = (date?: string, challengeId?: string) => { const c = t.challenges.find((x) => x.id === challengeId) || active; if (c) setCustom({ challengeId: c.id, date, reps: c.defaultRepsPerSet }); };
  const train = (c: Challenge) => { t.activate(c.id, false); router.push("/"); };
  // A running workout stays attached to its own challenge even if you switch.
  const timerChallenge = t.challenges.find((c) => c.id === readTimer()?.challengeId) || active;
  const ThemeIcon = THEME_ICON[t.theme];
  const syncLabel = t.sync.status === "syncing" ? "Syncing" : t.sync.status === "offline" ? "Offline · saved" : t.sync.status === "error" ? "Sync paused" : t.sync.pending ? `${t.sync.pending} waiting` : "Saved";

  return (
    <main className="app">
      <header>
        <div>
          <p className="eyebrow">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1>{view === "today" ? <>Ready to <em>move?</em></> : TITLES[view]}</h1>
        </div>
        <div className="headerActions">
          <button className={`sync ${t.sync.status}`} title={t.sync.status} aria-label={`Sync status: ${syncLabel}`} onClick={() => setSyncOpen(true)}>
            {t.sync.status === "offline" ? <CloudOff /> : t.sync.status === "error" ? <AlertTriangle /> : t.sync.status === "syncing" ? <RefreshCw className="spin" /> : <Cloud />}
            <span>{syncLabel}</span>
          </button>
          <button className="iconButton" aria-label={`Theme: ${t.theme}. Switch to ${NEXT_THEME[t.theme]}`} title={`Theme: ${t.theme}`} onClick={() => void t.updateSettings({ theme: NEXT_THEME[t.theme] })}><ThemeIcon /></button>
          <Link href="/settings" className="iconButton" aria-label="Settings"><SettingsIcon /></Link>
        </div>
      </header>

      {view === "today" && (active
        ? <TodayView t={t} onCustom={() => openCustom()} onEditSet={setEditingSet} onEditChallenge={setEditingChallenge} onNew={() => setCreating(true)} onTimer={() => setTimerOpen(true)} />
        : <section className="emptyState"><p className="eyebrow">NOTHING ACTIVE</p><h2>All your challenges are archived.</h2><p>Reactivate one or start something new.</p><button className="primary" onClick={() => setCreating(true)}>New challenge</button><Link className="outline" href="/challenges">View challenges</Link></section>)}
      {view === "calendar" && <CalendarView t={t} onEditSet={setEditingSet} onAdd={openCustom} />}
      {view === "challenges" && <ChallengesView t={t} onNew={() => setCreating(true)} onEdit={setEditingChallenge} onTrain={train} />}
      {view === "settings" && <SettingsView t={t} onImport={() => setImporting({})} />}
      {view === "activity" && <ActivityView t={t} />}
      {view === "profile" && <ProfileView challenges={t.challenges} sets={t.sets} badges={t.badges} userName={userName} onInvite={() => void t.invite()} onShareBadge={(b) => void shareBadge(b).then((m) => m && t.showToast(m))} />}
      {view === "leaderboard" && <LeaderboardView challenges={t.challenges} onInvite={(id) => void t.invite(id)} />}

      {timerChallenge && !timerOpen && view === "today" && <TimerPill challenge={timerChallenge} onOpen={() => setTimerOpen(true)} />}

      <nav className="bottomNav">
        {NAV.map(([href, Icon, label]) => <Link href={href} key={href} className={path === href ? "active" : ""} aria-current={path === href ? "page" : undefined}><Icon /><span>{label}</span></Link>)}
      </nav>

      {creating && (
        <div className="builderBackdrop">
          <button className="builderClose" onClick={() => setCreating(false)} aria-label="Close challenge builder"><X /></button>
          <ChallengeWizard compact userId={t.USER} defaultReps={t.settings.fallbackDefaultRepsPerSet} onFinish={async (c) => { await t.createChallenge(c); setCreating(false); }} />
        </div>
      )}
      {editingChallenge && (
        <ChallengeEditor challenge={t.challenges.find((c) => c.id === editingChallenge.id) || editingChallenge} onClose={() => setEditingChallenge(null)}
          onSave={(next) => t.updateChallenge(editingChallenge, next)}
          onDelete={async () => { if (await t.deleteChallenge(editingChallenge)) setEditingChallenge(null); }}
          onImport={() => { setImporting({ challengeId: editingChallenge.id }); setEditingChallenge(null); }} />
      )}
      {custom && <CustomSetSheet challenges={t.challenges} initial={custom} onClose={() => setCustom(null)} onRecord={(reps, challengeId, date, notes) => void t.record(reps, { date, notes, challenge: t.challenges.find((c) => c.id === challengeId) })} />}
      {editingSet && <SetEditorSheet entry={editingSet} challenges={t.challenges} onClose={() => setEditingSet(null)} onSave={(patch) => void t.updateSet(editingSet, patch)} onDelete={() => void t.softDelete(editingSet, "delete")} />}
      {importing && <ImportSheet t={t} initialChallengeId={importing.challengeId} onClose={() => setImporting(null)} />}
      {syncOpen && <SyncSheet sync={t.sync} onSync={() => void t.runSync()} onClose={() => setSyncOpen(false)} />}
      {timerOpen && timerChallenge && <WorkoutTimer challenge={timerChallenge} onMinimize={() => setTimerOpen(false)} onSave={async (reps, notes) => { await t.record(reps, { notes, challenge: timerChallenge }); setTimerOpen(false); }} />}
      {t.celebrating[0] && <Celebration badge={t.celebrating[0]} onClose={() => t.setCelebrating((q) => q.slice(1))} onShare={() => void shareBadge(t.celebrating[0]).then((m) => m && t.showToast(m))} />}
      {t.toast && (
        <div className="toast" role="status" key={t.toast.id}>
          <span>{t.toast.message}</span>
          {t.toast.action && <button onClick={() => { t.toast?.action?.run(); t.setToast(null); }}>{t.toast.action.label}</button>}
        </div>
      )}
    </main>
  );
}
