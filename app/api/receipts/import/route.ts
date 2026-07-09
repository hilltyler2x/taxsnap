import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { parseCsv } from "@/lib/csv"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()
const MAX_ROWS = 60

function extractSheetId(url: string) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m?.[1] ?? null
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Bulk import requires Pro." }, { status: 403 })

  const contentType = req.headers.get("content-type") ?? ""
  let csvText = ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    csvText = await file.text()
  } else {
    const body = await req.json()
    const sheetUrl = body.sheetUrl as string | undefined
    if (!sheetUrl) return NextResponse.json({ error: "No file or sheet link provided" }, { status: 400 })
    const sheetId = extractSheetId(sheetUrl)
    if (!sheetId) return NextResponse.json({ error: "Could not find a spreadsheet ID in that link" }, { status: 400 })
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`)
    if (!res.ok) return NextResponse.json({ error: 'Could not access that sheet. Make sure it\'s shared as "Anyone with the link can view".' }, { status: 400 })
    csvText = await res.text()
  }

  const rows = parseCsv(csvText)
  if (!rows.length) return NextResponse.json({ error: "No rows found in that file" }, { status: 400 })

  const truncated = rows.length > MAX_ROWS + 1
  const sample = rows.slice(0, MAX_ROWS + 1)
  const tableText = sample.map(r => r.join(" | ")).join("\n")

  let text = ""
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Below is data exported from a spreadsheet someone used to track business expenses/receipts before switching to this app. The first row is likely a header, but column names and layout can vary widely — infer what each column means from context.\n\nFor each row that represents a real expense/receipt (skip blank rows, totals, or non-expense rows), extract:\n{"name":"merchant/vendor","amount":0.00,"date":"YYYY-MM-DD","category":"Travel|Meals|Office|Software|Home|Medical|Business|Other","place":"","purpose":""}\n\nReturn ONLY a JSON array, no markdown, no commentary. If a field truly isn't inferable, use an empty string for it.\n\nData:\n${tableText}`,
      }],
    })
    text = message.content[0].type === "text" ? message.content[0].text : "[]"
  } catch (err) {
    console.error("CSV import extraction failed:", err)
    return NextResponse.json({ error: "Could not process that file. Try again in a moment." }, { status: 502 })
  }

  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  try {
    const items = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned)
    return NextResponse.json({ items, truncated })
  } catch (err) {
    console.error("Could not parse CSV import response:", text)
    return NextResponse.json({ error: "Could not read that data. Try a simpler export." }, { status: 400 })
  }
}
