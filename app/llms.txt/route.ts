import { GUIDES } from "@/lib/guides"
import { SITE_URL, SITE_TAGLINE, PRICE_LINE } from "@/lib/site"

// llms.txt (https://llmstxt.org): a plain-text map of the site for AI assistants.
export const dynamic = "force-static"

export function GET() {
  const body = [
    `# TaxSnap`,
    ``,
    `> ${SITE_TAGLINE}. Snap or email-import receipts, log business mileage at the IRS rate, catch audit risks, and export a CSV or PDF for Schedule C. ${PRICE_LINE}.`,
    ``,
    `TaxSnap is for freelancers, independent contractors, sole proprietors and gig workers (rideshare and delivery drivers) who file Schedule C in the United States.`,
    ``,
    `Features: AI receipt scanning from a photo; Gmail and Outlook receipt import; CSV and Google Sheets import; mileage log with the IRS standard rate for each trip's date; 50% meal limit applied automatically; audit-risk flags; duplicate receipt blocking; CSV and PDF export for tax software or an accountant.`,
    ``,
    `## Product`,
    `- [Home](${SITE_URL}/landing): what TaxSnap does and pricing`,
    `- [Demo](${SITE_URL}/explore): try the app with sample data, no sign-up`,
    ``,
    `## Guides`,
    ...GUIDES.map(g => `- [${g.question}](${SITE_URL}/guides/${g.slug}): ${g.description}`),
    ``,
  ].join("\n")
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
