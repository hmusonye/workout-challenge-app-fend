import{redirect}from"next/navigation";import{auth}from"@/auth";import TrackerApp from"@/components/tracker-app";
// One persistent tracker for every tab: switching tabs no longer reloads data or drops in-flight taps.
export default async function TrackerLayout({children}:{children:React.ReactNode}){const session=await auth();if(!session&&process.env.E2E_BYPASS_AUTH!=="true")redirect("/login");return <><TrackerApp userId={session?.user.id||"e2e-user"} userName={session?.user.name||session?.user.email?.split("@")[0]||"Athlete"}/>{children}</>}
