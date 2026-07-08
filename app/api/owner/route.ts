import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { passcode } = await req.json()
  if (!passcode || passcode !== process.env.OWNER_PASSCODE) {
    await new Promise(r => setTimeout(r, 800))
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 })
  }
  await prisma.user.update({ where: { id: user.id }, data: { isOwner: true, plan: "OWNER" as any } })
  return NextResponse.json({ ok: true, plan: "OWNER" })
}
