import Anthropic from "@anthropic-ai/sdk"
import { BUSINESS_PURPOSES } from "@/lib/irs"

const client = new Anthropic()

export type AuditInput = {
  id: string; name: string; amount: number; date: Date; category: string
  place: string | null; purpose: string | null; notes: string | null; attendees: unknown; imageUrl: string | null
}
export type AuditVerdict = { id: string; auditFlag: boolean; auditNote: string }

const BATCH_SIZE = 30

// Receipts saved before audit flags existed (or added by hand) were never reviewed.
// Text-only judgement on the saved fields, so Haiku is fast enough to batch these.
async function checkBatch(batch: AuditInput[]): Promise<AuditVerdict[]> {
  const listText = batch.map((r, i) => {
    const attendees = Array.isArray(r.attendees) ? r.attendees.length : 0
    return `${i}. ${r.name} · $${r.amount.toFixed(2)} · ${r.date.toISOString().slice(0, 10)} · ${r.category}` +
      `\n   Place: ${r.place || "(none)"} · Purpose: ${r.purpose || "(none)"} · Attendees: ${attendees} · Receipt image: ${r.imageUrl ? "yes" : "no"}` +
      (r.notes ? `\n   Notes: ${r.notes.slice(0, 300)}` : "")
  }).join("\n")

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Below are ${batch.length} business expenses already recorded for a Schedule C deduction. Think like an IRS auditor. For each one, set auditFlag to true if it is likely to draw scrutiny or be disallowed as recorded: e.g. no receipt image or itemized description, a vague or stretched purpose, a meal with no attendees, a payment to an individual with no detail, or anything that reads as possibly personal. If flagged, auditNote must be one short, specific, actionable sentence telling the user what to do to protect the deduction. If it is well-documented and defensible, set auditFlag to false and auditNote to "".\n\nValid purposes are: ${BUSINESS_PURPOSES.join(" | ")}\n\nReturn ONLY a JSON array, no markdown: [{"index":0,"auditFlag":false,"auditNote":""}]\n\nExpenses:\n${listText}`,
    }],
  })
  const textBlock = message.content.find((b: any) => b.type === "text") as any
  const text: string = textBlock?.text ?? "[]"
  const match = text.replace(/```json\n?|\n?```/g, "").match(/\[[\s\S]*\]/)
  const parsed = JSON.parse(match ? match[0] : "[]") as { index: number; auditFlag?: boolean; auditNote?: string }[]
  return parsed
    .filter(p => batch[p.index])
    .map(p => ({ id: batch[p.index].id, auditFlag: !!p.auditFlag && !!p.auditNote, auditNote: p.auditFlag ? String(p.auditNote ?? "") : "" }))
}

export async function auditCheckReceipts(receipts: AuditInput[]): Promise<AuditVerdict[]> {
  const batches: AuditInput[][] = []
  for (let i = 0; i < receipts.length; i += BATCH_SIZE) batches.push(receipts.slice(i, i + BATCH_SIZE))
  const results = await Promise.all(batches.map(b => checkBatch(b).catch(err => {
    console.error("Audit check batch failed:", err)
    return [] as AuditVerdict[]
  })))
  return results.flat()
}
