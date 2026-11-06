import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { exchangeMicrosoftCode } from "@/lib/microsoftOAuth"
import { prisma } from "@/lib/prisma"
import { verifyUserToken } from "@/lib/nativeHandoff"

export async function GET(req: NextRequest) {
  const nativeUserId = verifyUserToken(req.cookies.get("email_oauth_native")?.value)
  const user = nativeUserId ? { id: nativeUserId } : await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/login", process.env.APP_URL))
  // Started from the phone app: finish on a page that sends the user back into the app.
  const finish = (path: string) => new URL(nativeUserId ? `/native/return?to=${encodeURIComponent(path)}` : path, process.env.APP_URL!)

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const savedState = req.cookies.get("email_oauth_state")?.value

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(finish("/dashboard?tab=account&email_error=1"))
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
    return NextResponse.redirect(finish("/dashboard?tab=account&email_error=1"))
  }

  const res = NextResponse.redirect(finish("/dashboard?tab=account&email_connected=azure-ad"))
  res.cookies.delete("email_oauth_state")
  res.cookies.delete("email_oauth_native")
  return res
}
