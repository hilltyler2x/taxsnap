import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { BUSINESS_PURPOSES } from "@/lib/irs"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
  const mediaType = SUPPORTED_TYPES.includes(file.type as any) ? (file.type as (typeof SUPPORTED_TYPES)[number]) : "image/jpeg"

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString("base64")

  let text = ""
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: `You're extracting data from a photo of a business expense document — this could be a receipt, invoice, bill, order confirmation, statement, or similar. Read every visible field carefully, even if the photo is angled, blurry, dim, low-resolution, or partially cropped — always give your best-effort extraction rather than giving up.\n\nReturn ONLY valid JSON, no markdown, no commentary:\n{"name":"merchant or vendor name","amount":0.00,"date":"YYYY-MM-DD","place":"city or online","category":"Travel|Meals|Office|Software|Home|Medical|Business|Other","purpose":"one of: ${BUSINESS_PURPOSES.join(" | ")}","notes":""}\n\nPick the single closest matching purpose from that list — do not invent a new one. Only return {"error":"not a business document"} if the photo is clearly unrelated to any purchase, expense, invoice, or receipt (e.g. a selfie, landscape, random object, or blank page). Do not reject a real document just because it's blurry, low quality, or an unusual format.` }
        ]
      }]
    })
    text = message.content[0].type === "text" ? message.content[0].text : ""
  } catch (err) {
    console.error("Anthropic receipt scan request failed:", err)
    return NextResponse.json({ error: "Receipt scanning is temporarily unavailable. Try again in a moment." }, { status: 502 })
  }

  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned)
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    return NextResponse.json({ extracted: parsed })
  } catch (err) {
    console.error("Could not parse receipt scan response:", text)
    return NextResponse.json({ error: "Could not parse receipt" }, { status: 400 })
  }
}
