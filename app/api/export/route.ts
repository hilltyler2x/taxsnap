import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { IRS_MILEAGE_RATE } from "@/lib/irs"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Export requires Pro. Upgrade for $5/month." }, { status: 403 })

  const year = new URL(req.url).searchParams.get("year") ?? new Date().getFullYear().toString()
  const [receipts, trips] = await Promise.all([
    prisma.receipt.findMany({ where: { userId, date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } }, orderBy: { date: "asc" } }),
    prisma.trip.findMany({ where: { userId, date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } }, orderBy: { date: "asc" } }),
  ])

  const rows: string[][] = [["Type","Date","Vendor","Place","Purpose","Category","Amount","Deductible","Attendees","Odo Start","Odo End"]]
  receipts.forEach(r => {
    const att = Array.isArray(r.attendees) ? (r.attendees as any[]).map((a:any) => `${a.name} (${a.relationship})`).join("; ") : ""
    rows.push(["Receipt", r.date.toISOString().split("T")[0], r.name, r.place ?? "", r.purpose ?? "", r.category, r.amount.toFixed(2), (r.deductible ?? 0).toFixed(2), att, "", ""])
  })
  trips.forEach(t => rows.push(["Mileage", t.date.toISOString().split("T")[0], "", t.destination, t.purpose, "Travel", (t.miles * IRS_MILEAGE_RATE).toFixed(2), t.deductible.toFixed(2), "", t.odoStart.toString(), t.odoEnd.toString()]))

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="taxsnap_${year}.csv"` } })
}
