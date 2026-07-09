import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(req: NextRequest, { params }: { params: { provider: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.emailToken.deleteMany({ where: { userId: user.id, provider: params.provider } })
  return NextResponse.json({ ok: true })
}
