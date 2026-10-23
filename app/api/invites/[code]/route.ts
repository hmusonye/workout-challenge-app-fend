import{NextResponse}from"next/server";import{getInvite}from"@/lib/invites";
export async function GET(_:Request,{params}:{params:Promise<{code:string}>}){const invite=await getInvite((await params).code);if(!invite)return NextResponse.json({error:{code:"NOT_FOUND",message:"Invite not found"}},{status:404});const{inviterId:_id,...rest}=invite;void _id;return NextResponse.json(rest)}
