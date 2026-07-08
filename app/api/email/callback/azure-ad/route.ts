import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { exchangeMicrosoftCode } from "@/lib/microsoftOAuth"
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
    const tokens = await exchangeMicrosoftCode(code)
    await prisma.emailToken.upsert({
      where: { userId_provider: { userId: user.id, provider: "azure-ad" } },
      create: {
        userId: user.id,
        provider: "azure-ad",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    })
  } catch (err) {
    console.error("Microsoft OAuth token exchange failed:", err)
    return NextResponse.redirect(new URL("/dashboard?tab=account&email_error=1", process.env.APP_URL!))
  }

  const res = NextResponse.redirect(new URL("/dashboard?tab=account&email_connected=azure-ad", process.env.APP_URL!))
  res.cookies.delete("email_oauth_state")
  return res
}
