import type { Metadata } from "next"
import Link from "next/link"
import { GUIDES } from "@/lib/guides"
import { SITE_URL, SITE_NAME } from "@/lib/site"

export const metadata: Metadata = {
  title: "TaxSnap: IRS-ready receipt and mileage tracker for Schedule C",
  description:
    "Snap or email-import receipts, log business miles at the IRS rate, catch audit risks, and export for Schedule C. $5/month after a 7-day free trial.",
  alternates: { canonical: "/landing" },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: `${SITE_URL}/landing`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "Receipt and mileage tracker for freelancers, contractors and gig workers who file Schedule C. AI receipt scanning, Gmail and Outlook import, IRS-rate mileage log, audit-risk flags, and CSV/PDF export.",
  offers: { "@type": "Offer", price: "5.00", priceCurrency: "USD", description: "Pro plan, monthly, after a 7-day free trial" },
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
      <nav aria-label="Guides" style={{ background: "#f9fafb", padding: "0 16px 32px", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: "400px", margin: "0 auto", borderTop: "1px solid #eee", paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 8px" }}>
            <Link href="/guides" style={{ color: "#888", textDecoration: "none" }}>Tax record guides</Link>
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {GUIDES.map(g => (
              <li key={g.slug} style={{ marginBottom: "6px" }}>
                <Link href={`/guides/${g.slug}`} style={{ fontSize: "12px", color: "#0F6E56", textDecoration: "none" }}>{g.question}</Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  )
}
