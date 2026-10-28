import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

export type PdfAttachment = { filename: string; base64: string }

// Some senders (EasyPost, many SaaS invoices) put the charged amount only in an attached
// PDF and the email body just says "your receipt is attached". These limits keep the
// extra fetch + Claude call inside the email route's 60s budget.
export const PDF_MAX_BYTES = 4 * 1024 * 1024
export const PDF_MAX_PER_EMAIL = 2
export const PDF_MAX_EMAILS_PER_REQUEST = 5

export function isPdfPart(mimeType?: string | null, filename?: string | null): boolean {
  return mimeType === "application/pdf" || !!filename?.toLowerCase().endsWith(".pdf")
}

export type PdfExtraction = { amount: number; auditFlag: boolean; auditNote: string }

export async function extractAmountFromPdfs(
  pdfs: PdfAttachment[],
  context: { from: string; subject: string }
): Promise<PdfExtraction | null> {
  if (!pdfs.length) return null
  let text = ""
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{
        role: "user",
        // The pinned SDK predates document blocks in its types; the API accepts them.
        content: [
          ...pdfs.map(p => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 } })),
          {
            type: "text",
            text: `These PDF(s) were attached to an email from ${context.from} with subject "${context.subject}". If they are a receipt, invoice, or payment confirmation, find the final total actually charged or due (after tax, discounts and credits), in USD.\n\nReturn ONLY JSON, no markdown: {"amount":0.00,"auditFlag":false,"auditNote":""}\n\nUse amount 0 if there is no charge or you can't find one. For auditFlag/auditNote, think like an IRS auditor: flag it if the document lacks an itemized description or reads as possibly personal, with one short, specific, actionable sentence in auditNote. Otherwise auditFlag false and auditNote empty.`,
          },
        ] as any,
      }],
    }, { timeout: 25_000 })
    const textBlock = message.content.find((b: any) => b.type === "text") as any
    text = textBlock?.text ?? ""
  } catch (err) {
    console.error("PDF attachment extraction failed:", err)
    return null
  }

  const match = text.replace(/```json\n?|\n?```/g, "").match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    const amount = Number(parsed.amount)
    if (!isFinite(amount) || amount <= 0) return null
    return { amount: Math.round(amount * 100) / 100, auditFlag: !!parsed.auditFlag, auditNote: String(parsed.auditNote ?? "") }
  } catch {
    console.error("Could not parse PDF extraction response:", text)
    return null
  }
}
