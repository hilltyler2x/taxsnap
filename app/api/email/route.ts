import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listGmailReceiptCandidates } from "@/lib/googleOAuth"
import { listOutlookReceiptCandidates, refreshMicrosoftToken } from "@/lib/microsoftOAuth"
import { BUSINESS_PURPOSES } from "@/lib/irs"
import { applyLearnedClassification } from "@/lib/learnedCategory"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

type Candidate = { id: string; from: string; subject: string; date: string; snippet: string; provider: "google" | "azure-ad" }

async function extractReceipts(userId: string, items: Candidate[]) {
  if (!items.length) return []
  const listText = items.map((it, i) => `${i}. From: ${it.from}\nSubject: ${it.subject}\nDate: ${it.date}\nPreview: ${it.snippet}`).join("\n\n")

  let text = ""
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Below are ${items.length} emails from an inbox search for purchase-related messages. For each one that is genuinely a receipt, invoice, order confirmation, or payment confirmation, extract structured data. Skip any that are clearly not purchase-related (newsletters, notifications, social updates, etc).\n\nReturn ONLY a JSON array, no markdown, no commentary. Each item: {"index":0,"amount":0.00,"category":"Travel|Meals|Office|Software|Home|Medical|Business|Other","purpose":"one of: ${BUSINESS_PURPOSES.join(" | ")}"}\n\nPick the single closest matching purpose from that list — do not invent a new one.\n\nEmails:\n${listText}`,
      }],
    })
    text = message.content[0].type === "text" ? message.content[0].text : "[]"
  } catch (err) {
    console.error("Email receipt extraction failed:", err)
    return []
  }

  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as { index: number; amount: number; category: string; purpose: string }[]
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
  const candidates: Candidate[] = []

  for (const token of tokens) {
    try {
      if (token.provider === "google") {
        const { items, refreshedTokens } = await listGmailReceiptCandidates({ accessToken: token.accessToken, refreshToken: token.refreshToken })
        candidates.push(...items.map(it => ({ ...it, provider: "google" as const })))
        if (refreshedTokens?.access_token) {
          await prisma.emailToken.update({
            where: { id: token.id },
            data: { accessToken: refreshedTokens.access_token, expiresAt: refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : undefined },
          })
        }
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
        candidates.push(...items.map(it => ({ ...it, provider: "azure-ad" as const })))
      }
    } catch (err) {
      console.error(`Failed to fetch emails for provider ${token.provider}:`, err)
    }
  }

  const emails = await extractReceipts(user.id, candidates)
  return NextResponse.json({ emails, connected: tokens.map(t => t.provider) })
}
