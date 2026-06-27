import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcDeductible } from "@/lib/irs"
import { z } from "zod"

const ReceiptSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  date: z.string(),
  category: z.string(),
  place: z.string().optional(),
  purpose: z.string().optional(),
  notes: z.string().optional(),
  homePct: z.number().optional(),
  attendees: z.any().optional(),
  source: z.string().optional(),
  imageUrl: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = (session!.user as any).id
  const year = new URL(req.url).searchParams.get("year") ?? new Date().getFullYear().toString()
  const receipts = await prisma.receipt.findMany({
    where: { userId, date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
    orderBy: { date: "desc" },
  })
  return NextResponse.json({ receipts })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = (session!.user as any).id
  const plan = (session!.user as any).plan ?? "FREE"

  if (plan === "FREE") {
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0)
    const count = await prisma.receipt.count({ where: { userId, createdAt: { gte: thisMonth } } })
    if (count >= 10) return NextResponse.json({ error: "Monthly receipt limit reached. Upgrade to Pro." }, { status: 403 })
  }

  const body = await req.json()
  const parsed = ReceiptSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const receipt = await prisma.receipt.create({
    data: {
      userId,
      name: data.name,
      amount: data.amount,
      date: new Date(data.date),
      category: data.category,
      place: data.place,
      purpose: data.purpose,
      notes: data.notes,
      homePct: data.homePct,
      deductible: calcDeductible(data.amount, data.category, data.homePct),
      attendees: data.attendees ?? [],
      source: data.source ?? "manual",
      imageUrl: data.imageUrl,
    },
  })
  return NextResponse.json({ receipt })
}
