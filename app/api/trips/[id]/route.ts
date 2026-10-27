import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TripInputSchema, tripData } from "@/lib/tripInput"

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.trip.findUnique({ where: { id: params.id } })
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const parsed = TripInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  // Saving an edit confirms the trip as business, so it leaves the review list.
  // GPS details the form doesn't show are kept from the original trip.
  const result = tripData({
    ...parsed.data,
    needsReview: false,
    source: parsed.data.source ?? existing.source as any,
    startPlace: parsed.data.startPlace !== undefined ? parsed.data.startPlace : existing.startPlace,
    startLat: existing.startLat, startLng: existing.startLng,
    endLat: existing.endLat, endLng: existing.endLng,
    startedAt: existing.startedAt?.toISOString() ?? null,
    endedAt: existing.endedAt?.toISOString() ?? null,
  })
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })

  const trip = await prisma.trip.update({ where: { id: params.id }, data: result.data })
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
