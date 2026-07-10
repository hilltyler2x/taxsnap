import { BUSINESS_PURPOSES } from "@/lib/irs"
import { applyLearnedClassification } from "@/lib/learnedCategory"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()
const MAX_ROWS = 60

export async function extractExpensesFromTable(userId: string, rows: string[][], contextHint?: string) {
  if (!rows.length) return { items: [] as any[], truncated: false }

  const truncated = rows.length > MAX_ROWS + 1
  const sample = rows.slice(0, MAX_ROWS + 1)
  const tableText = sample.map(r => r.join(" | ")).join("\n")
  const hintLine = contextHint ? `This data comes from something titled "${contextHint}" — use that for context, e.g. if dates in the data don't include a year, infer it from a year mentioned there rather than assuming the current year.\n\n` : ""

  let text = ""
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `Below is data exported from a spreadsheet someone used to track business expenses/receipts before switching to this app. The first row is likely a header, but column names and layout can vary widely — infer what each column means from context.\n\n${hintLine}For each row that represents a real expense/receipt (skip blank rows, totals, or non-expense rows), extract:\n{"name":"merchant/vendor","amount":0.00,"date":"YYYY-MM-DD","category":"Travel|Meals|Office|Software|Home|Medical|Business|Other","place":"","purpose":"one of: ${BUSINESS_PURPOSES.join(" | ")}"}\n\nPick the single closest matching purpose from that list for each row — do not invent a new one. Return ONLY a JSON array, no markdown, no commentary. If a field other than purpose truly isn't inferable, use an empty string for it.\n\nData:\n${tableText}`,
      }],
    })
    const textBlock = message.content.find((b: any) => b.type === "text") as any
    text = textBlock?.text ?? "[]"
  } catch (err) {
    console.error("Expense table extraction failed:", err)
    throw new Error("Could not process that data. Try again in a moment.")
  }

  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  let parsed: any[]
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned)
  } catch (err) {
    console.error("Could not parse expense extraction response:", text)
    throw new Error("Could not read that data. Try a simpler export.")
  }

  const items = await Promise.all(parsed.map(item => applyLearnedClassification(userId, item)))
  return { items, truncated }
}
