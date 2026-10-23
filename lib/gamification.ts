import { addDays, format, parseISO } from "date-fns";
import { dailyProgress, totalProgress } from "./challenge-math";
import type { BadgeTier, Challenge, ExerciseSet } from "@/types";

export interface BadgeAward { code:string; challengeId?:string; title:string; description:string; tier:BadgeTier; icon:string; value:number }
export interface UserStats { lifetimeReps:number; totalSets:number; activeDays:number; currentStreak:number; longestStreak:number; bestDay:{date:string;reps:number}|null; byActivity:{activity:string;label:string;reps:number}[]; completedChallenges:number; xp:number; level:number; levelProgress:number; nextLevelXp:number }

const live=(sets:ExerciseSet[])=>sets.filter(s=>!s.deletedAt);
const shift=(date:string,days:number)=>format(addDays(parseISO(date),days),"yyyy-MM-dd");
const fmt=(n:number)=>new Intl.NumberFormat("en").format(n);
export const LIFETIME_MILESTONES=[1000,5000,10000,25000,50000,100000];
export const STREAK_MILESTONES=[3,7,14,30,60,100];
export const BIG_DAY_MILESTONES=[250,500,1000];
export const EXPLORER_MILESTONES=[3,5];
const tierFor=(i:number,len:number):BadgeTier=>(["bronze","silver","gold","platinum"] as const)[Math.min(3,Math.floor(i/Math.max(1,len-1)*3))];
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

/** Per-day rep totals for live sets. */
export function dayTotals(sets:ExerciseSet[]){const totals=new Map<string,number>();for(const s of live(sets))totals.set(s.localDate,(totals.get(s.localDate)||0)+s.reps);return totals}

/** Streak of consecutive days with at least one set; today may still be empty without breaking it. */
export function streaks(dates:Iterable<string>,today:string){const days=new Set(dates);let current=0;let cursor=days.has(today)?today:shift(today,-1);while(days.has(cursor)){current++;cursor=shift(cursor,-1)}let longest=0,run=0,prev="";for(const d of [...days].sort()){run=prev&&shift(prev,1)===d?run+1:1;longest=Math.max(longest,run);prev=d}return{current,longest}}

/** XP: 1 per rep, 25 per training day, 500 per completed challenge. Level n needs 250·n² XP. */
export function levelFor(xp:number){const level=Math.floor(Math.sqrt(xp/250))+1;const base=250*(level-1)**2,next=250*level**2;return{level,levelProgress:(xp-base)/(next-base)*100,nextLevelXp:next}}

export function isChallengeComplete(c:Challenge,sets:ExerciseSet[],today:string){if(c.targetMode==="total")return totalProgress(c,sets,today).currentTotal>=c.targetReps;if(!c.endDate||c.endDate>=today)return false;const p=dailyProgress(c,sets,today);return p.missedDays===0&&p.successfulDays>0}

export function computeStats(challenges:Challenge[],sets:ExerciseSet[],today:string):UserStats{
 const liveSets=live(sets);const totals=dayTotals(liveSets);const{current,longest}=streaks(totals.keys(),today);
 const byChallenge=new Map(challenges.map(c=>[c.id,c]));const activity=new Map<string,{activity:string;label:string;reps:number}>();
 for(const s of liveSets){const c=byChallenge.get(s.challengeId);const key=c?.activityName||"Other";const row=activity.get(key)||{activity:key,label:c?.activityLabelPlural||key,reps:0};row.reps+=s.reps;activity.set(key,row)}
 for(const c of challenges)if(c.openingReps){const row=activity.get(c.activityName)||{activity:c.activityName,label:c.activityLabelPlural,reps:0};row.reps+=c.openingReps;activity.set(c.activityName,row)}
 let bestDay:UserStats["bestDay"]=null;for(const[date,reps]of totals)if(!bestDay||reps>bestDay.reps)bestDay={date,reps};
 const lifetimeReps=[...activity.values()].reduce((n,r)=>n+r.reps,0);const completedChallenges=challenges.filter(c=>c.status==="completed").length;
 const xp=lifetimeReps+totals.size*25+completedChallenges*500;
 return{lifetimeReps,totalSets:liveSets.length,activeDays:totals.size,currentStreak:current,longestStreak:longest,bestDay,byActivity:[...activity.values()].sort((a,b)=>b.reps-a.reps),completedChallenges,xp,...levelFor(xp)};
}

/** Every badge the user has earned given their data. Codes are stable so awarding is idempotent. */
export function evaluateBadges(challenges:Challenge[],sets:ExerciseSet[],today:string):BadgeAward[]{
 const out:BadgeAward[]=[];const stats=computeStats(challenges,sets,today);
 if(stats.totalSets>0)out.push({code:"first-set",title:"First Rep",description:"Logged the very first set. Every journey starts here.",tier:"bronze",icon:"spark",value:1});
 for(const c of challenges){if(c.status!=="completed"&&!isChallengeComplete(c,sets.filter(s=>s.challengeId===c.id),today))continue;const tier:BadgeTier=c.targetReps>=10000||c.targetMode==="daily"?"gold":c.targetReps>=5000?"silver":"bronze";out.push({code:`challenge:${c.id}`,challengeId:c.id,title:`${c.name} Conquered`,description:c.targetMode==="total"?`Completed the ${c.name} — ${fmt(c.targetReps)} ${c.activityLabelPlural.toLowerCase()} done.`:`Hit ${fmt(c.targetReps)} ${c.activityLabelPlural.toLowerCase()} every scheduled day of ${c.name}.`,tier,icon:"trophy",value:c.targetReps})}
 for(const a of stats.byActivity)LIFETIME_MILESTONES.forEach((m,i)=>{if(a.reps>=m)out.push({code:`lifetime:${slug(a.activity)}:${m}`,title:`${fmt(m)} ${a.label}`,description:`${fmt(m)} lifetime ${a.label.toLowerCase()} across all challenges.`,tier:tierFor(i,LIFETIME_MILESTONES.length),icon:"medal",value:m})});
 STREAK_MILESTONES.forEach((m,i)=>{if(stats.longestStreak>=m)out.push({code:`streak:${m}`,title:`${m}-Day Streak`,description:`Trained ${m} days in a row without a break.`,tier:tierFor(i,STREAK_MILESTONES.length),icon:"flame",value:m})});
 BIG_DAY_MILESTONES.forEach((m,i)=>{if((stats.bestDay?.reps||0)>=m)out.push({code:`big-day:${m}`,title:`${fmt(m)}-Rep Day`,description:`Moved ${fmt(m)}+ reps in a single day.`,tier:tierFor(i,BIG_DAY_MILESTONES.length+1),icon:"bolt",value:m})});
 const tried=new Set(live(sets).map(s=>challenges.find(c=>c.id===s.challengeId)?.activityName).filter(Boolean)).size;
 EXPLORER_MILESTONES.forEach((m,i)=>{if(tried>=m)out.push({code:`explorer:${m}`,title:i?"All-Rounder":"Explorer",description:`Trained ${m} different movements. Variety builds resilience.`,tier:i?"gold":"silver",icon:"compass",value:m})});
 return out;
}
