import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { GUIDES, getGuide } from "@/lib/guides"
import { IRS_MILEAGE_RATE_PERIODS } from "@/lib/irs"
import { SITE_URL, SITE_NAME } from "@/lib/site"

type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false
export function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = getGuide((await params).slug)
  if (!g) return {}
  return {
    title: `${g.question} | TaxSnap`,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { title: g.question, description: g.description, type: "article", url: `/guides/${g.slug}` },
  }
}

const h2: React.CSSProperties = { fontSize: "21px", lineHeight: 1.3, margin: "32px 0 10px" }
const p: React.CSSProperties = { margin: "0 0 12px" }

export default async function GuidePage({ params }: Props) {
  const g = getGuide((await params).slug)
  if (!g) notFound()

  const url = `${SITE_URL}/guides/${g.slug}`
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: g.question,
      description: g.description,
      dateModified: g.updated,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ q: g.question, a: g.answer }, ...g.faqs].map(f => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ]
  const others = GUIDES.filter(o => o.slug !== g.slug).slice(0, 4)

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <p style={{ fontSize: "13px", margin: "0 0 8px" }}>
        <Link href="/guides" style={{ color: "#0F6E56", textDecoration: "none" }}>← All guides</Link>
      </p>
      <h1 style={{ fontSize: "30px", lineHeight: 1.25, margin: "0 0 8px" }}>{g.question}</h1>
      <p style={{ fontSize: "12px", color: "#888", margin: "0 0 20px" }}>Updated <time dateTime={g.updated}>{g.updated}</time></p>

      <section aria-label="Short answer" style={{ background: "#E1F5EE", borderRadius: "12px", padding: "16px 18px", marginBottom: "8px" }}>
        <p style={{ margin: 0, fontSize: "16px", color: "#0b3d30" }}><strong>Short answer: </strong>{g.answer}</p>
      </section>

      {g.mileageTable && (
        <>
          <h2 style={h2}>IRS business standard mileage rates</h2>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff", fontSize: "14px" }}>
            <thead>
              <tr><th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>In effect from</th><th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Rate per business mile</th></tr>
            </thead>
            <tbody>
              {[...IRS_MILEAGE_RATE_PERIODS].reverse().map(r => (
                <tr key={r.from}><td style={{ padding: "8px", borderBottom: "1px solid #f0f0f0" }}>{r.from}</td><td style={{ padding: "8px", borderBottom: "1px solid #f0f0f0" }}>${r.rate.toFixed(3).replace(/0$/, "")}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {g.sections.map(s => (
        <section key={s.heading}>
          <h2 style={h2}>{s.heading}</h2>
          {s.paragraphs?.map((t, i) => <p key={i} style={p}>{t}</p>)}
          {s.bullets && <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>{s.bullets.map((b, i) => <li key={i} style={{ marginBottom: "4px" }}>{b}</li>)}</ul>}
        </section>
      ))}

      <h2 style={h2}>Frequently asked questions</h2>
      {g.faqs.map(f => (
        <div key={f.q} style={{ marginBottom: "14px" }}>
          <h3 style={{ fontSize: "16px", margin: "0 0 4px" }}>{f.q}</h3>
          <p style={p}>{f.a}</p>
        </div>
      ))}

      <h2 style={h2}>Sources</h2>
      <ul style={{ paddingLeft: "20px", margin: 0 }}>
        {g.sources.map(s => <li key={s.url}><a href={s.url} rel="noopener" style={{ color: "#0F6E56" }}>{s.label}</a></li>)}
      </ul>

      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: "14px", padding: "20px", marginTop: "36px", textAlign: "center" }}>
        <p style={{ fontWeight: 600, fontSize: "17px", margin: "0 0 6px" }}>Keep IRS-ready records without the shoebox</p>
        <p style={{ color: "#555", fontSize: "14px", margin: "0 0 14px" }}>Snap receipts, import them from email, and log mileage at the IRS rate. $5/month after a 7-day free trial.</p>
        <Link href="/login" style={{ display: "inline-block", background: "#1D9E75", color: "#fff", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: 500 }}>Start free trial</Link>
        <span style={{ margin: "0 10px", color: "#ccc" }}>|</span>
        <Link href="/explore" style={{ color: "#0F6E56", textDecoration: "none", fontSize: "14px" }}>Try the demo</Link>
      </div>

      <h2 style={h2}>Related guides</h2>
      <ul style={{ paddingLeft: "20px", margin: 0 }}>
        {others.map(o => <li key={o.slug}><Link href={`/guides/${o.slug}`} style={{ color: "#0F6E56" }}>{o.question}</Link></li>)}
      </ul>
    </article>
  )
}
