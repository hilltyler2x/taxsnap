import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getGoogleAuthUrl } from "@/lib/googleOAuth"
import { randomUUID } from "crypto"
import { verifyUserToken } from "@/lib/nativeHandoff"

export async function GET(req: NextRequest) {
  // From the phone app this opens in the system browser with a signed `h` link
  // instead of a Clerk session (see /api/native/link).
  const handoff = req.nextUrl.searchParams.get("h")
  const handoffUserId = verifyUserToken(handoff)
  const user = handoffUserId ? { id: handoffUserId } : await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/login", process.env.APP_URL))

  const state = randomUUID()
  const res = NextResponse.redirect(getGoogleAuthUrl(state))
  res.cookies.set("email_oauth_state", state, { httpOnly: true, secure: true, maxAge: 600, path: "/" })
  if (handoffUserId) res.cookies.set("email_oauth_native", handoff!, { httpOnly: true, secure: true, maxAge: 600, path: "/" })
  return res
}
