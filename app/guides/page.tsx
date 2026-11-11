import type { Metadata } from "next"
import Link from "next/link"
import { GUIDES } from "@/lib/guides"

export const metadata: Metadata = {
  title: "Receipt and mileage tax guides for the self-employed | TaxSnap",
  description: "Plain-English answers on tracking receipts, mileage and Schedule C deductions for freelancers, contractors and gig workers.",
  alternates: { canonical: "/guides" },
}

export default function GuidesIndex() {
  return (
    <>
      <h1 style={{ fontSize: "30px", lineHeight: 1.25, margin: "0 0 8px" }}>Tax record guides for the self-employed</h1>
      <p style={{ color: "#555", margin: "0 0 28px" }}>Short answers to the questions freelancers, contractors and gig workers ask about receipts, mileage and Schedule C.</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "12px" }}>
        {GUIDES.map(g => (
          <li key={g.slug} style={{ background: "#fff", border: "1px solid #eee", borderRadius: "12px", padding: "16px 18px" }}>
            <Link href={`/guides/${g.slug}`} style={{ color: "#0F6E56", fontWeight: 600, fontSize: "17px", textDecoration: "none" }}>{g.question}</Link>
            <p style={{ margin: "6px 0 0", fontSize: "14px", color: "#555" }}>{g.description}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
