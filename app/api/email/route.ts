import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const plan = (session!.user as any).plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Email import requires Pro." }, { status: 403 })

  const tokens = await prisma.emailToken.findMany({ where: { userId: (session!.user as any).id } })
  // Return connected providers — actual email scanning happens after OAuth tokens are set up
  return NextResponse.json({ emails: [], connected: tokens.map(t => t.provider) })
}
