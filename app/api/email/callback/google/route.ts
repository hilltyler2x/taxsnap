import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getGoogleOAuthClient } from "@/lib/googleOAuth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/login", process.env.APP_URL))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const savedState = req.cookies.get("email_oauth_state")?.value

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/dashboard?tab=account&email_error=1", process.env.APP_URL!))
  }

  try {
    const client = getGoogleOAuthClient()
    const { tokens } = await client.getToken(code)
    if (!tokens.access_token) throw new Error("No access token returned")

    await prisma.emailToken.upsert({
      where: { userId_provider: { userId: user.id, provider: "google" } },
      create: {
        userId: user.id,
        provider: "google",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
      update: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    })
  } catch (err) {
    console.error("Google OAuth token exchange failed:", err)
    return NextResponse.redirect(new URL("/dashboard?tab=account&email_error=1", process.env.APP_URL!))
  }

  const res = NextResponse.redirect(new URL("/dashboard?tab=account&email_connected=google", process.env.APP_URL!))
  res.cookies.delete("email_oauth_state")
  return res
}
