"use client"
import { SignIn } from "@clerk/nextjs"
import { useState } from "react"
import { startNativeSignIn, usePlatform } from "@/lib/native"

export default function LoginPage() {
  const platform = usePlatform()
  const [opening, setOpening] = useState(false)

  // Google blocks its sign-in page inside app web views, so the phone app signs in
  // through the system browser and gets handed back (see /native/start).
  if (platform !== "web") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 pt-safe pb-safe">
        <div className="max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">📄</div>
          <h1 className="text-2xl font-semibold mb-2">TaxSnap</h1>
          <p className="text-sm text-gray-500 mb-8">Sign in or create an account to scan receipts and track mileage.</p>
          <button
            onClick={async () => { setOpening(true); try { await startNativeSignIn() } finally { setOpening(false) } }}
            disabled={opening}
            className="w-full bg-emerald-500 text-white py-3.5 rounded-xl text-base font-medium disabled:opacity-60"
          >
            {opening ? "Opening..." : "Sign in or sign up"}
          </button>
          <p className="text-xs text-gray-400 mt-4">Opens a secure sign-in page. You'll come straight back here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  )
}
