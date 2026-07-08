import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getGoogleAuthUrl } from "@/lib/googleOAuth"
import { randomUUID } from "crypto"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/login", process.env.APP_URL))

  const state = randomUUID()
  const res = NextResponse.redirect(getGoogleAuthUrl(state))
  res.cookies.set("email_oauth_state", state, { httpOnly: true, secure: true, maxAge: 600, path: "/" })
  return res
}
