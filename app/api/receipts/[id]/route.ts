import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcDeductible } from "@/lib/irs"
import { z } from "zod"

const ReceiptUpdateSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  date: z.string(),
  category: z.string(),
  place: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  homePct: z.number().nullable().optional(),
  attendees: z.any().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.receipt.findUnique({ where: { id: params.id } })
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const parsed = ReceiptUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const receipt = await prisma.receipt.update({
    where: { id: params.id },
    data: {
      name: data.name,
      amount: data.amount,
      date: new Date(data.date),
      category: data.category,
      place: data.place,
      purpose: data.purpose,
      notes: data.notes,
      homePct: data.homePct,
      deductible: calcDeductible(data.amount, data.category, data.homePct),
      attendees: data.attendees ?? existing.attendees ?? [],
    },
  })
  return NextResponse.json({ receipt })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.receipt.findUnique({ where: { id: params.id } })
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.receipt.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
