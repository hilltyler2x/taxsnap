import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Email import requires Pro." }, { status: 403 })

  const tokens = await prisma.emailToken.findMany({ where: { userId: user.id } })
  // Return connected providers — actual email scanning happens after OAuth tokens are set up
  return NextResponse.json({ emails: [], connected: tokens.map(t => t.provider) })
}
