import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = new URL(req.url).searchParams.get("q")?.trim()
  if (!q || q.length < 3) return NextResponse.json({ results: [] })

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
  })

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "TaxSnap/1.0 (expense tracking app; contact via app owner)" },
    })
    if (!res.ok) return NextResponse.json({ results: [] })
    const data = await res.json()
    const results = (Array.isArray(data) ? data : []).map((r: any) => ({
      label: r.display_name as string,
      lat: r.lat,
      lon: r.lon,
    }))
    return NextResponse.json({ results })
  } catch (err) {
    console.error("Geocode lookup failed:", err)
    return NextResponse.json({ results: [] })
  }
}
