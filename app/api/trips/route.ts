import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcMileageDeductible } from "@/lib/irs"
import { z } from "zod"

const TripSchema = z.object({
  purpose: z.string().min(1),
  destination: z.string().min(1),
  odoStart: z.number().int().positive(),
  odoEnd: z.number().int().positive(),
  date: z.string(),
})

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id
  const year = new URL(req.url).searchParams.get("year") ?? new Date().getFullYear().toString()
  const trips = await prisma.trip.findMany({
    where: { userId, date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
    orderBy: { date: "desc" },
  })
  const totalMiles = trips.reduce((s, t) => s + t.miles, 0)
  return NextResponse.json({ trips, totalMiles, totalDeductible: calcMileageDeductible(totalMiles) })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Mileage tracking requires Pro. Upgrade for $5/month." }, { status: 403 })

  const body = await req.json()
  const parsed = TripSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const data = parsed.data
  if (data.odoEnd <= data.odoStart) return NextResponse.json({ error: "Odometer end must be greater than start" }, { status: 400 })

  const miles = data.odoEnd - data.odoStart
  const trip = await prisma.trip.create({
    data: { userId, purpose: data.purpose, destination: data.destination, odoStart: data.odoStart, odoEnd: data.odoEnd, miles, date: new Date(data.date), deductible: calcMileageDeductible(miles) },
  })
  return NextResponse.json({ trip })
}
