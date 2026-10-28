import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { auditCheckReceipts } from "@/lib/auditCheck"

export const maxDuration = 60

// Most receipts per request; the client calls again while `remaining` > 0.
const MAX_PER_REQUEST = 150

// Backfills audit-risk flags on receipts that were never reviewed. auditNote doubles as the
// "reviewed" marker without a schema change: null = never checked, "" = checked and clean.
// Existing flags are never cleared here — only unreviewed receipts are touched.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const year = String(body?.year ?? new Date().getFullYear())
  if (!/^\d{4}$/.test(year)) return NextResponse.json({ error: "Invalid year" }, { status: 400 })

  const where = {
    userId: user.id,
    auditFlag: false,
    auditNote: null,
    date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
  }
  const unchecked = await prisma.receipt.findMany({ where, orderBy: { date: "desc" }, take: MAX_PER_REQUEST })
  if (!unchecked.length) return NextResponse.json({ checked: 0, flagged: 0, remaining: 0 })

  const verdicts = await auditCheckReceipts(unchecked)
  await prisma.$transaction(verdicts.map(v => prisma.receipt.update({
    where: { id: v.id },
    data: v.auditFlag ? { auditFlag: true, auditNote: v.auditNote } : { auditNote: "" },
  })))

  const remaining = await prisma.receipt.count({ where })
  return NextResponse.json({ checked: verdicts.length, flagged: verdicts.filter(v => v.auditFlag).length, remaining })
}
