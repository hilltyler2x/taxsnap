import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString("base64")
  const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif"

  let text = ""
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: `Extract receipt info. Return ONLY valid JSON, no markdown:\n{"name":"merchant","amount":0.00,"date":"YYYY-MM-DD","place":"city or online","category":"Travel|Meals|Office|Software|Home|Medical|Other","purpose":"business reason","notes":""}\nIf not a receipt: {"error":"not a receipt"}` }
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
