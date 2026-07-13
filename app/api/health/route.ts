import { NextResponse } from "next/server"; import { getSql } from "@/db/client";
export async function GET(){try{await getSql()`select 1`;return NextResponse.json({status:"ok",database:"connected"})}catch{return NextResponse.json({status:"degraded",database:"unavailable"},{status:503})}}
