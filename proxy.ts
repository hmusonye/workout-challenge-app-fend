import{NextResponse}from"next/server";import{auth}from"@/auth";
export default auth(req=>{if(process.env.E2E_BYPASS_AUTH==="true"||req.auth)return NextResponse.next();return NextResponse.redirect(new URL("/login",req.url))});
export const config={matcher:["/","/calendar/:path*","/challenges/:path*","/activity/:path*","/settings/:path*","/onboarding/:path*"]};