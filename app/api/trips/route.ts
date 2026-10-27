import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TripInputSchema, tripData } from "@/lib/tripInput"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id
  const year = new URL(req.url).searchParams.get("year") ?? new Date().getFullYear().toString()
  const all = await prisma.trip.findMany({
    where: { userId, date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
    orderBy: { date: "desc" },
  })
  // Auto-detected drives aren't business trips until the user says so.
  const trips = all.filter(t => !t.needsReview)
  const toReview = all.filter(t => t.needsReview)
  const totalMiles = trips.reduce((s, t) => s + t.miles, 0)
  const totalDeductible = trips.reduce((s, t) => s + t.deductible, 0)
  return NextResponse.json({ trips, toReview, totalMiles, totalDeductible })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Mileage tracking requires Pro. Upgrade for $5/month." }, { status: 403 })

  const body = await req.json()
  const parsed = TripInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const result = tripData(parsed.data)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })

  const trip = await prisma.trip.create({ data: { userId, ...result.data } })
  return NextResponse.json({ trip })
}
