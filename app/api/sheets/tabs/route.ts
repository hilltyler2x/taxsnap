import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listSheetTabs } from "@/lib/googleOAuth"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const spreadsheetId = new URL(req.url).searchParams.get("id")
  if (!spreadsheetId) return NextResponse.json({ error: "Missing spreadsheet id" }, { status: 400 })

  const token = await prisma.emailToken.findUnique({ where: { userId_provider: { userId: user.id, provider: "google" } } })
  if (!token) return NextResponse.json({ error: "Connect your Google account first." }, { status: 400 })

  try {
    const { tabs, refreshedTokens } = await listSheetTabs({ accessToken: token.accessToken, refreshToken: token.refreshToken }, spreadsheetId)
    if (refreshedTokens?.access_token) {
      await prisma.emailToken.update({
        where: { id: token.id },
        data: { accessToken: refreshedTokens.access_token, expiresAt: refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : undefined },
      })
    }
    return NextResponse.json({ tabs })
  } catch (err) {
    console.error("Failed to list sheet tabs:", err)
    return NextResponse.json({ error: "Could not read that spreadsheet's tabs." }, { status: 502 })
  }
}
