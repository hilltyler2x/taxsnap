import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcMileageDeductible } from "@/lib/irs"
import { z } from "zod"

const TripUpdateSchema = z.object({
  purpose: z.string().min(1),
  destination: z.string().min(1),
  odoStart: z.number().int().positive(),
  odoEnd: z.number().int().positive(),
  date: z.string(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.trip.findUnique({ where: { id: params.id } })
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const parsed = TripUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const data = parsed.data
  if (data.odoEnd <= data.odoStart) return NextResponse.json({ error: "Odometer end must be greater than start" }, { status: 400 })

  const miles = data.odoEnd - data.odoStart
  const trip = await prisma.trip.update({
    where: { id: params.id },
    data: {
      purpose: data.purpose,
      destination: data.destination,
      odoStart: data.odoStart,
      odoEnd: data.odoEnd,
      miles,
      date: new Date(data.date),
      deductible: calcMileageDeductible(miles),
    },
  })
  return NextResponse.json({ trip })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.trip.findUnique({ where: { id: params.id } })
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.trip.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
