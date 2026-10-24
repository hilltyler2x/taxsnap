import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { signUserToken } from "@/lib/nativeHandoff"

// The phone app opens email connect in the system browser, which has no TaxSnap session.
// Hand it a link that says who the user is for the next 5 minutes.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const to = req.nextUrl.searchParams.get("to")
  if (!to || !/^\/api\/email\/connect\/(google|azure-ad)$/.test(to)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 })
  }
  const url = new URL(to, process.env.APP_URL)
  url.searchParams.set("h", signUserToken(user.id, 300))
  return NextResponse.json({ url: url.toString() })
}
