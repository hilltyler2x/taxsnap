import Link from "next/link"
import { PRICE_LINE } from "@/lib/site"

const wrap: React.CSSProperties = { maxWidth: "760px", margin: "0 auto", padding: "0 16px" }

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", color: "#111", fontFamily: "sans-serif", lineHeight: 1.6 }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #eee" }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", height: "56px" }}>
          <Link href="/landing" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "#111", fontWeight: 600 }}>
            <span style={{ width: "28px", height: "28px", background: "#1D9E75", borderRadius: "7px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>📄</span>
            TaxSnap
          </Link>
          <nav style={{ display: "flex", gap: "16px", alignItems: "center", fontSize: "14px" }}>
            <Link href="/guides" style={{ color: "#555", textDecoration: "none" }}>Guides</Link>
            <Link href="/login" style={{ background: "#1D9E75", color: "#fff", padding: "7px 14px", borderRadius: "8px", textDecoration: "none", fontWeight: 500 }}>Start free trial</Link>
          </nav>
        </div>
      </header>
      <main style={{ ...wrap, paddingTop: "32px", paddingBottom: "48px" }}>{children}</main>
      <footer style={{ borderTop: "1px solid #eee", background: "#fff" }}>
        <div style={{ ...wrap, padding: "20px 16px", fontSize: "12px", color: "#888" }}>
          <p style={{ margin: "0 0 6px" }}>TaxSnap is an IRS-ready receipt and mileage tracker for the self-employed, {PRICE_LINE}.</p>
          <p style={{ margin: 0 }}>These guides are general information, not tax advice. Check the linked IRS sources or ask a tax professional about your situation.</p>
        </div>
      </footer>
    </div>
  )
}
