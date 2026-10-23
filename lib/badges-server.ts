import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { evaluateBadges, isChallengeComplete } from "./gamification";
import { toBadge, toChallenge, toSet } from "./serialize";
import { toLocalDate } from "./date-utils";
import type { Badge } from "@/types";

export const shareSlug=()=>randomBytes(9).toString("base64url");
const isDate=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v);

/** Closes challenges that reached their target and mints any newly earned badges. Returns only new badges. */
export async function awardBadges(sql:postgres.Sql,userId:string,clientToday?:string):Promise<Badge[]>{
 const today=isDate(clientToday)?clientToday:toLocalDate();
 const [challengeRows,setRows]=await Promise.all([sql`select * from challenges where user_id=${userId} and deleted_at is null`,sql`select * from exercise_sets where user_id=${userId} and deleted_at is null`]);
 const challenges=challengeRows.map(toChallenge),sets=setRows.map(toSet);
 for(const c of challenges)if(c.status==="active"&&isChallengeComplete(c,sets.filter(s=>s.challengeId===c.id),today)){await sql`update challenges set status='completed',completed_at=now(),updated_at=now() where id=${c.id} and user_id=${userId} and status='active'`;c.status="completed"}
 const awards=evaluateBadges(challenges,sets,today);if(!awards.length)return[];
 const inserted=await sql`insert into badges ${sql(awards.map(a=>({user_id:userId,code:a.code,challenge_id:a.challengeId||null,title:a.title,description:a.description,tier:a.tier,icon:a.icon,value:a.value,share_slug:shareSlug()})))} on conflict (user_id,code) do nothing returning *`;
 return inserted.map(toBadge);
}
