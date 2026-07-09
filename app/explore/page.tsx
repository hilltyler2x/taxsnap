"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

const DEMO_RECEIPTS = [
  { id: 1, name: "Delta Airlines", amount: 487.50, date: "2025-06-10", category: "Travel", purpose: "NYC conference" },
  { id: 2, name: "Zoom Pro Annual", amount: 149.90, date: "2025-01-10", category: "Software", purpose: "Video conferencing" },
  { id: 3, name: "The Smith Restaurant", amount: 186.40, date: "2025-04-08", category: "Meals", purpose: "Client dinner" },
  { id: 4, name: "Staples", amount: 54.32, date: "2025-02-22", category: "Office", purpose: "Printer supplies" },
  { id: 5, name: "Marriott Chicago", amount: 428.00, date: "2025-03-15", category: "Travel", purpose: "Client summit" },
  { id: 6, name: "Adobe CC", amount: 59.99, date: "2025-05-01", category: "Software", purpose: "Design tools" },
]

const CC: Record<string, string> = {
  Travel: "#1D9E75", Meals: "#BA7517", Office: "#185FA5",
  Software: "#534AB7", Home: "#3B6D11", Medical: "#A32D2D", Business: "#0F766E", Other: "#888780",
}

function ReceiptCard({ r }: { r: any }) {
  const col = CC[r.category] ?? "#888"
  const d = new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: "12px", padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: col + "22", color: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>
        {{ Travel: "✈", Meals: "🍽", Office: "📦", Software: "💻", Home: "🏠", Medical: "⚕", Business: "💼", Other: "📎" }[r.category] ?? "📎"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
        <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{d} · {r.purpose}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: "600" }}>${r.amount.toFixed(2)}</p>
        <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "10px", background: col + "22", color: col }}>{r.category}</span>
      </div>
    </div>
  )
}

export default function ExplorePage() {
  const router = useRouter()
  const [tab, setTab] = useState("home")
  const totalDed = DEMO_RECEIPTS.reduce((s, r) => s + r.amount * (r.category === "Meals" ? 0.5 : 1), 0)

  return (
    <div style={{ maxWidth: "430px", margin: "0 auto", minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
      
      <div style={{ background: "#1D9E75", color: "#fff", padding: "10px 16px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>✦ Explore mode — demo data only</span>
        <button onClick={() => router.push("/landing")} style={{ background: "#fff", color: "#1D9E75", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}>Sign up free</button>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "24px", height: "24px", background: "#1D9E75", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>📄</div>
          <span style={{ fontWeight: "600", fontSize: "14px" }}>TaxSnap</span>
        </div>
        <span style={{ fontSize: "14px", fontWeight: "500", color: "#555" }}>{{ home: "Home", receipts: "Receipts", taxes: "Taxes" }[tab]}</span>
        <span style={{ fontSize: "10px", background: "#F1EFE8", color: "#888", padding: "2px 8px", borderRadius: "10px" }}>Demo</span>
      </div>

      <div style={{ flex: 1, padding: "12px", paddingBottom: "80px", overflowY: "auto" }}>
        {tab === "home" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              <div style={{ background: "#f1f1f1", borderRadius: "12px", padding: "12px" }}>
                <p style={{ fontSize: "11px", color: "#888", margin: "0 0 2px" }}>Receipts</p>
                <p style={{ fontSize: "22px", fontWeight: "600", margin: "0 0 2px" }}>{DEMO_RECEIPTS.length}</p>
                <p style={{ fontSize: "10px", color: "#aaa", margin: 0 }}>stored this year</p>
              </div>
              <div style={{ background: "#f1f1f1", borderRadius: "12px", padding: "12px" }}>
                <p style={{ fontSize: "11px", color: "#888", margin: "0 0 2px" }}>Est. savings</p>
                <p style={{ fontSize: "22px", fontWeight: "600", margin: "0 0 2px" }}>${Math.round(totalDed * 0.22).toLocaleString()}</p>
                <p style={{ fontSize: "10px", color: "#aaa", margin: 0 }}>at 22% bracket</p>
              </div>
            </div>
            <div style={{ background: "#fff", border: "2px dashed #ddd", borderRadius: "14px", padding: "20px", textAlign: "center", marginBottom: "12px" }}>
              <p style={{ fontSize: "24px", margin: "0 0 6px" }}>📷</p>
              <p style={{ fontWeight: "600", fontSize: "14px", margin: "0 0 4px" }}>Scan a receipt</p>
              <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px" }}>AI reads and fills in all details automatically</p>
              <button onClick={() => router.push("/landing")} style={{ background: "#1D9E75", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 18px", fontSize: "13px", fontWeight: "500", cursor: "pointer" }}>Sign up to scan real receipts →</button>
            </div>
            <p style={{ fontWeight: "600", fontSize: "13px", marginBottom: "8px" }}>Recent receipts (demo)</p>
            {DEMO_RECEIPTS.slice(0, 3).map(r => <ReceiptCard key={r.id} r={r} />)}
          </div>
        )}
        {tab === "receipts" && <div>{DEMO_RECEIPTS.map(r => <ReceiptCard key={r.id} r={r} />)}</div>}
        {tab === "taxes" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              <div style={{ background: "#f1f1f1", borderRadius: "12px", padding: "12px" }}>
                <p style={{ fontSize: "11px", color: "#888", margin: "0 0 2px" }}>Total deductible</p>
                <p style={{ fontSize: "22px", fontWeight: "600", margin: 0 }}>${Math.round(totalDed).toLocaleString()}</p>
              </div>
              <div style={{ background: "#f1f1f1", borderRadius: "12px", padding: "12px" }}>
                <p style={{ fontSize: "11px", color: "#888", margin: "0 0 2px" }}>Est. savings</p>
                <p style={{ fontSize: "22px", fontWeight: "600", margin: 0 }}>${Math.round(totalDed * 0.22).toLocaleString()}</p>
              </div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: "12px", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee", fontWeight: "600", fontSize: "13px" }}>Breakdown</div>
              {Object.entries(DEMO_RECEIPTS.reduce((acc: any, r) => { acc[r.category] = (acc[r.category] || 0) + r.amount * (r.category === "Meals" ? 0.5 : 1); return acc }, {}))
                .sort((a: any, b: any) => b[1] - a[1])
                .map(([cat, amt]: any) => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: CC[cat] ?? "#888", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: "12px" }}>{cat}</span>
                    <span style={{ fontSize: "12px", fontWeight: "600" }}>${amt.toFixed(0)}</span>
                  </div>
                ))}
            </div>
            <div style={{ marginTop: "12px", background: "#fff", border: "1px solid #eee", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
              <p style={{ fontSize: "13px", color: "#666", margin: "0 0 10px" }}>Export IRS-ready CSV — sign up to unlock</p>
              <button onClick={() => router.push("/landing")} style={{ background: "#1D9E75", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 18px", fontSize: "13px", fontWeight: "500", cursor: "pointer" }}>Start free trial →</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "430px", background: "#fff", borderTop: "1px solid #eee", display: "flex" }}>
        {[["home", "⌂", "Home"], ["receipts", "🧾", "Receipts"], ["taxes", "📊", "Taxes"]].map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "10px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", border: "none", background: "transparent", cursor: "pointer", color: tab === t ? "#1D9E75" : "#aaa" }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span style={{ fontSize: "10px", fontWeight: tab === t ? "600" : "400" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}