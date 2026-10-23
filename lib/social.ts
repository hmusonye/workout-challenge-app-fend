import { randomBytes } from "node:crypto";
import type postgres from "postgres";
export const inviteCode=()=>randomBytes(6).toString("base64url");
export const INVITE_TTL_DAYS=30;
export async function friendIds(sql:postgres.Sql,userId:string){const rows=await sql`select friend_id from friendships where user_id=${userId}`;return rows.map(r=>String(r.friend_id))}
export function originOf(req:Request){const h=req.headers;const host=h.get("x-forwarded-host")||h.get("host")||"localhost:3000";const proto=h.get("x-forwarded-proto")||(host.startsWith("localhost")?"http":"https");return`${proto}://${host}`}
