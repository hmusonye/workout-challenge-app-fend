import { describe,expect,it } from "vitest"; import { computeStats,evaluateBadges,isChallengeComplete,levelFor,streaks } from "./gamification"; import type { Challenge,ExerciseSet } from "@/types";
const c:Challenge={id:"c",userId:"u",name:"10K Push-Up Challenge",activityName:"Push-up",activityLabelPlural:"Push-ups",unitLabel:"reps",targetMode:"total",targetReps:10000,defaultRepsPerSet:10,quickSetSizes:[5],activeWeekdays:[0,1,2,3,4,5,6],startDate:"2026-01-01",openingReps:0,status:"active",createdAt:"",updatedAt:""};
const set=(reps:number,localDate="2026-01-01",deletedAt?:string):ExerciseSet=>({id:crypto.randomUUID(),userId:"u",challengeId:"c",reps,performedAt:`${localDate}T10:00:00Z`,localDate,deletedAt,createdAt:"",updatedAt:""});
describe("streaks",()=>{it("counts back from today or yesterday",()=>{expect(streaks(["2026-01-01","2026-01-02","2026-01-03"],"2026-01-04")).toEqual({current:3,longest:3});expect(streaks(["2026-01-01","2026-01-03"],"2026-01-03")).toEqual({current:1,longest:1})});it("breaks after a missed day",()=>expect(streaks(["2026-01-01"],"2026-01-03").current).toBe(0))});
describe("levels",()=>{it("starts at level 1",()=>expect(levelFor(0).level).toBe(1));it("levels up at 250",()=>expect(levelFor(250).level).toBe(2))});
describe("badges",()=>{
 it("awards completion at the target, ignoring deleted sets",()=>{expect(isChallengeComplete(c,[set(9999),set(5,"2026-01-01","x")],"2026-01-02")).toBe(false);const b=evaluateBadges([c],[set(6000),set(4000,"2026-01-02")],"2026-01-02");expect(b.map(x=>x.code)).toEqual(expect.arrayContaining(["first-set","challenge:c","lifetime:push-up:10000","big-day:1000"]));expect(b.find(x=>x.code==="challenge:c")?.tier).toBe("gold")});
 it("counts opening reps toward lifetime stats",()=>expect(computeStats([{...c,openingReps:1000}],[set(10)],"2026-01-01").lifetimeReps).toBe(1010));
 it("is idempotent",()=>{const b=evaluateBadges([c],[set(10)],"2026-01-01");expect(new Set(b.map(x=>x.code)).size).toBe(b.length)});
});
