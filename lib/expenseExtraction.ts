import { BUSINESS_PURPOSES } from "@/lib/irs"
import { applyLearnedClassificationBatch } from "@/lib/learnedCategory"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()
const BATCH_SIZE = 20

// Salvage whatever complete {...} objects we can from a response that got
// cut off mid-array (e.g. hit max_tokens) instead of losing the whole batch.
function parseJsonArrayLenient(text: string): any[] {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  const candidate = jsonMatch ? jsonMatch[0] : cleaned
  try {
    return JSON.parse(candidate)
  } catch {
    const objMatches = candidate.match(/\{[^{}]*\}/g)
    if (!objMatches) return []
    const recovered: any[] = []
    for (const m of objMatches) {
      try { recovered.push(JSON.parse(m)) } catch { /* skip incomplete trailing fragment */ }
    }
    return recovered
  }
}

function buildPrompt(tableText: string, hintLine: string) {
  return `Below is data exported from a spreadsheet someone used to track business expenses/receipts before switching to this app. The first row is likely a header, but column names and layout can vary widely — infer what each column means from context.

${hintLine}For each row that represents a real expense/receipt (skip blank rows, totals, or non-expense rows), extract:
{"name":"merchant/vendor","amount":0.00,"date":"YYYY-MM-DD","category":"Travel|Meals|Office|Software|Home|Medical|Business|Other","place":"","purpose":"one of: ${BUSINESS_PURPOSES.join(" | ")}","notes":"carry through any description/notes from the source row that adds useful context, beyond what's already captured in name/purpose","auditFlag":true,"auditNote":""}

Pick the single closest matching purpose from that list for each row — do not invent a new one.

For auditFlag/auditNote, think like an IRS auditor reviewing this expense for a deduction. Set auditFlag to true if it's likely to draw scrutiny or get disallowed as recorded — e.g. a payment to an individual person rather than a registered business with no itemized description of what was actually bought, a vague or generic purpose, anything that reads as possibly personal rather than business, or unusual patterns (round numbers, repeated identical payments with no detail). If flagged, auditNote must be one short, specific, actionable sentence telling the user exactly what to do to protect the deduction (e.g. "Keep an itemized receipt or invoice for this payment — a bare P2P transfer to a person's name has no proof of what was purchased." or "Note who attended and the business discussion topic to justify this as a business meal."). If the expense is already well-documented and defensible, set auditFlag to false and leave auditNote as an empty string.

Return ONLY a JSON array, no markdown, no commentary. If a field other than purpose/auditNote truly isn't inferable, use an empty string for it.

Data:
${tableText}`
}

async function extractBatch(rows: string[][], contextHint?: string): Promise<any[]> {
  const tableText = rows.map(r => r.join(" | ")).join("\n")
  const hintLine = contextHint ? `This data comes from something titled "${contextHint}" — use that for context, e.g. if dates in the data don't include a year, infer it from a year mentioned there rather than assuming the current year.\n\n` : ""

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: buildPrompt(tableText, hintLine) }],
    })
    const textBlock = message.content.find((b: any) => b.type === "text") as any
    const text = textBlock?.text ?? "[]"
    return parseJsonArrayLenient(text)
  } catch (err) {
    console.error("Batch expense extraction failed:", err)
    return []
  }
}

export async function extractExpensesFromTable(userId: string, rows: string[][], contextHint?: string) {
  if (!rows.length) return { items: [] as any[], truncated: false }

  const header = rows[0]
  const dataRows = rows.slice(1)
  const batches: string[][][] = []
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    batches.push([header, ...dataRows.slice(i, i + BATCH_SIZE)])
  }

  const results = await Promise.all(batches.map(batch => extractBatch(batch, contextHint)))
  const allParsed = results.flat()

  const items = await applyLearnedClassificationBatch(userId, allParsed)
  return { items, truncated: false }
}
