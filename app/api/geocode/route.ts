import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const lat = Number(url.searchParams.get("lat"))
  const lon = Number(url.searchParams.get("lon"))
  if (url.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lon)) return reverse(lat, lon)

  const q = url.searchParams.get("q")?.trim()
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

// Turns a GPS point from a tracked trip into a short address for the trip log.
async function reverse(lat: number, lon: number) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), format: "jsonv2", addressdetails: "1", zoom: "18" })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { "User-Agent": "TaxSnap/1.0 (expense tracking app; contact via app owner)" },
    })
    if (!res.ok) return NextResponse.json({ label: null })
    const r = await res.json()
    const a = r?.address ?? {}
    const street = [a.house_number, a.road].filter(Boolean).join(" ")
    const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county
    const place = r?.name && r.name !== a.road ? r.name : null
    const label = [place, street, city, a.state].filter(Boolean).join(", ") || r?.display_name || null
    return NextResponse.json({ label })
  } catch (err) {
    console.error("Reverse geocode failed:", err)
    return NextResponse.json({ label: null })
  }
}
