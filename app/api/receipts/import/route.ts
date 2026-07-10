import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { parseCsv } from "@/lib/csv"
import { extractExpensesFromTable } from "@/lib/expenseExtraction"

function extractSheetId(url: string) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m?.[1] ?? null
}

function extractGid(url: string) {
  const m = url.match(/[?#&]gid=(\d+)/)
  return m?.[1] ?? null
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Bulk import requires Pro." }, { status: 403 })

  const contentType = req.headers.get("content-type") ?? ""
  let csvText = ""
  let contextHint: string | undefined

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    csvText = await file.text()
    contextHint = file.name
  } else {
    const body = await req.json()
    const sheetUrl = body.sheetUrl as string | undefined
    if (!sheetUrl) return NextResponse.json({ error: "No file or sheet link provided" }, { status: 400 })
    const sheetId = extractSheetId(sheetUrl)
    if (!sheetId) return NextResponse.json({ error: "Could not find a spreadsheet ID in that link" }, { status: 400 })
    const gid = extractGid(sheetUrl)
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}`
    const res = await fetch(exportUrl)
    if (!res.ok) return NextResponse.json({ error: 'Could not access that sheet. Make sure it\'s shared as "Anyone with the link can view".' }, { status: 400 })
    csvText = await res.text()
    if (/^\s*<(!doctype html|html)/i.test(csvText)) {
      return NextResponse.json({ error: 'That link isn\'t publicly viewable. In Google Sheets, click Share → change to "Anyone with the link" → Viewer, then try again.' }, { status: 400 })
    }
  }

  const rows = parseCsv(csvText)
  if (!rows.length) {
    return NextResponse.json({ error: "No rows found in that file. If your data is on a specific tab, open that tab in your browser first so the URL includes #gid=..., then paste that exact URL." }, { status: 400 })
  }

  try {
    const { items, truncated } = await extractExpensesFromTable(user.id, rows, contextHint)
    return NextResponse.json({ items, truncated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Could not process that file." }, { status: 502 })
  }
}
