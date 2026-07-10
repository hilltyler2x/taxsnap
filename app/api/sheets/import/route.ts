import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getSheetValues } from "@/lib/googleOAuth"
import { extractExpensesFromTable } from "@/lib/expenseExtraction"

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Bulk import requires Pro." }, { status: 403 })

  const { spreadsheetId, sheetName } = await req.json()
  if (!spreadsheetId || !sheetName) return NextResponse.json({ error: "Missing spreadsheet or tab" }, { status: 400 })

  const token = await prisma.emailToken.findUnique({ where: { userId_provider: { userId: user.id, provider: "google" } } })
  if (!token) return NextResponse.json({ error: "Connect your Google account first." }, { status: 400 })

  try {
    const { rows, refreshedTokens } = await getSheetValues({ accessToken: token.accessToken, refreshToken: token.refreshToken }, spreadsheetId, sheetName)
    if (refreshedTokens?.access_token) {
      await prisma.emailToken.update({
        where: { id: token.id },
        data: { accessToken: refreshedTokens.access_token, expiresAt: refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : undefined },
      })
    }
    if (!rows.length) return NextResponse.json({ error: "That tab appears to be empty." }, { status: 400 })

    const { items, truncated } = await extractExpensesFromTable(user.id, rows)
    return NextResponse.json({ items, truncated })
  } catch (err: any) {
    console.error("Sheets import failed:", err)
    return NextResponse.json({ error: err.message ?? "Could not import that sheet." }, { status: 502 })
  }
}
