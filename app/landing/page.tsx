"use client"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function LandingPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: "400px", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ width: "56px", height: "56px", background: "#1D9E75", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "24px" }}>📄</div>
          <h1 style={{ fontSize: "28px", fontWeight: "600", color: "#111", margin: "0 0 8px" }}>TaxSnap</h1>
          <p style={{ fontSize: "15px", color: "#666", margin: 0 }}>IRS-ready receipt tracker. Scan receipts, track mileage, and save on taxes.</p>
        </div>

        <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", border: "1px solid #eee", marginBottom: "12px" }}>
          <div style={{ background: "#E1F5EE", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px" }}>
            <p style={{ fontSize: "13px", color: "#0F6E56", fontWeight: "500", margin: "0 0 2px" }}>✦ 7-day free trial</p>
            <p style={{ fontSize: "12px", color: "#0F6E56", margin: 0 }}>Full access · Cancel anytime · Card required</p>
          </div>
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            style={{ width: "100%", padding: "13px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "500", cursor: "pointer", marginBottom: "8px" }}
          >
            Start free trial with Google
          </button>
          <button
            onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
            style={{ width: "100%", padding: "13px", background: "#fff", color: "#333", border: "1px solid #ddd", borderRadius: "10px", fontSize: "15px", fontWeight: "500", cursor: "pointer" }}
          >
            Start free trial with Microsoft
          </button>
        </div>

        <button
          onClick={() => router.push("/explore")}
          style={{ width: "100%", padding: "13px", background: "transparent", color: "#666", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}
        >
          Explore without signing in →
        </button>

        <p style={{ textAlign: "center", fontSize: "11px", color: "#aaa", marginTop: "16px" }}>
          After trial, Pro is $5/month. Cancel anytime before 7 days and pay nothing.
        </p>
      </div>
    </div>
  )
}