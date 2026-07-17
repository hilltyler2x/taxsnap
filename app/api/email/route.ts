import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listGmailReceiptCandidates } from "@/lib/googleOAuth"
import { listOutlookReceiptCandidates, refreshMicrosoftToken } from "@/lib/microsoftOAuth"
import { BUSINESS_PURPOSES } from "@/lib/irs"
import { applyLearnedClassification } from "@/lib/learnedCategory"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

// Fetching candidates touches Gmail/Outlook APIs per email plus a Claude call;
// the 10s Vercel default has been observed to cut this off mid-request.
export const maxDuration = 60

type Candidate = { id: string; from: string; subject: string; date: string; snippet: string; provider: "google" | "azure-ad" }

async function extractReceipts(userId: string, items: Candidate[]) {
  if (!items.length) return []
  const listText = items.map((it, i) => `${i}. From: ${it.from}\nSubject: ${it.subject}\nDate: ${it.date}\nPreview: ${it.snippet}`).join("\n\n")

  let text = ""
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Below are ${items.length} emails from an inbox search for purchase-related messages. For each one that is genuinely a receipt, invoice, order confirmation, or payment confirmation, extract structured data. Skip any that are clearly not purchase-related (newsletters, notifications, social updates, etc).\n\nReturn ONLY a JSON array, no markdown, no commentary. Each item: {"index":0,"amount":0.00,"category":"Travel|Meals|Office|Software|Home|Medical|Business|Other","purpose":"one of: ${BUSINESS_PURPOSES.join(" | ")}","auditFlag":true,"auditNote":""}\n\nPick the single closest matching purpose from that list — do not invent a new one.\n\nFor auditFlag/auditNote, think like an IRS auditor. Set auditFlag to true if this is likely to draw scrutiny as recorded (e.g. no itemized description, reads as possibly personal). If flagged, auditNote must be one short, specific, actionable sentence. Otherwise set auditFlag to false and leave auditNote empty.\n\nEmails:\n${listText}`,
      }],
    })
    const textBlock = message.content.find((b: any) => b.type === "text") as any
    text = textBlock?.text ?? "[]"
  } catch (err) {
    console.error("Email receipt extraction failed:", err)
    return []
  }

  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as { index: number; amount: number; category: string; purpose: string; auditFlag?: boolean; auditNote?: string }[]
    const results = parsed
      .filter(p => items[p.index])
      .map(p => {
        const source = items[p.index]
        return {
          from: source.from,
          subject: source.subject,
          date: source.date,
          amount: p.amount,
          category: p.category,
          purpose: p.purpose,
          auditFlag: p.auditFlag ?? false,
          auditNote: p.auditNote ?? "",
          ...(source.provider === "google" ? { gmailId: source.id } : { outlookId: source.id }),
        }
      })
    return Promise.all(results.map(r => applyLearnedClassification(userId, { ...r, name: r.from })))
  } catch (err) {
    console.error("Could not parse email extraction response:", text)
    return []
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const plan = user.plan ?? "FREE"
  if (plan === "FREE") return NextResponse.json({ error: "Email import requires Pro." }, { status: 403 })

  const tokens = await prisma.emailToken.findMany({ where: { userId: user.id } })

  const perTokenCandidates = await Promise.all(tokens.map(async (token): Promise<Candidate[]> => {
    try {
      if (token.provider === "google") {
        const { items, refreshedTokens } = await listGmailReceiptCandidates({ accessToken: token.accessToken, refreshToken: token.refreshToken })
        if (refreshedTokens?.access_token) {
          await prisma.emailToken.update({
            where: { id: token.id },
            data: { accessToken: refreshedTokens.access_token, expiresAt: refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : undefined },
          })
        }
        return items.map(it => ({ ...it, provider: "google" as const }))
      } else if (token.provider === "azure-ad") {
        let accessToken = token.accessToken
        if (token.expiresAt && token.expiresAt < new Date() && token.refreshToken) {
          const refreshed = await refreshMicrosoftToken(token.refreshToken)
          accessToken = refreshed.access_token
          await prisma.emailToken.update({
            where: { id: token.id },
            data: { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token ?? token.refreshToken, expiresAt: new Date(Date.now() + refreshed.expires_in * 1000) },
          })
        }
        const items = await listOutlookReceiptCandidates(accessToken)
        return items.map(it => ({ ...it, provider: "azure-ad" as const }))
      }
      return []
    } catch (err) {
      console.error(`Failed to fetch emails for provider ${token.provider}:`, err)
      return []
    }
  }))
  const candidates: Candidate[] = perTokenCandidates.flat()

  const emails = await extractReceipts(user.id, candidates)
  return NextResponse.json({ emails, connected: tokens.map(t => t.provider) })
}
