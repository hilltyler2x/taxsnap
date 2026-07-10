import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listGoogleSheets } from "@/lib/googleOAuth"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Bulk import requires Pro." }, { status: 403 })

  const token = await prisma.emailToken.findUnique({ where: { userId_provider: { userId: user.id, provider: "google" } } })
  if (!token) return NextResponse.json({ error: "Connect your Google account first." }, { status: 400 })

  try {
    const { files, refreshedTokens } = await listGoogleSheets({ accessToken: token.accessToken, refreshToken: token.refreshToken })
    if (refreshedTokens?.access_token) {
      await prisma.emailToken.update({
        where: { id: token.id },
        data: { accessToken: refreshedTokens.access_token, expiresAt: refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : undefined },
      })
    }
    return NextResponse.json({ files })
  } catch (err) {
    console.error("Failed to list Google Sheets:", err)
    return NextResponse.json({ error: "Could not list your Google Sheets. Try disconnecting and reconnecting Google in Account." }, { status: 502 })
  }
}
