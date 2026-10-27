"use client"
// Opened by the phone app in the system browser (Safari sheet / Chrome custom tab), where
// Google and Apple sign-in are allowed. After sign-in it hands a one-time token back to the app.
import { SignIn, useClerk, useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react"

export default function NativeStart() {
  const { isLoaded, isSignedIn, user } = useUser()
  const { signOut } = useClerk()
  const [params, setParams] = useState<{ k: string; done: boolean } | null>(null)
  const [returnUrl, setReturnUrl] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setParams({ k: p.get("k") ?? "", done: p.get("done") === "1" })
  }, [])

  const handBack = async () => {
    if (!params) return
    setError("")
    const res = await fetch("/api/native/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ k: params.k }),
    })
    if (!res.ok) { setError("Something went wrong. Close this and try again from the app."); return }
    const { c } = await res.json()
    const url = `taxsnap://auth?c=${c}`
    setReturnUrl(url)
    window.location.href = url
  }

  // Just finished signing in here: go straight back to the app.
  useEffect(() => {
    if (isLoaded && isSignedIn && params?.done && !returnUrl) handBack()
  }, [isLoaded, isSignedIn, params])

  if (!isLoaded || !params) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">Loading...</div>
  }

  if (!params.k) {
    return <Shell><p className="text-sm text-gray-500">Open TaxSnap on your phone and tap Sign in.</p></Shell>
  }

  if (!isSignedIn) {
    const back = `/native/start?k=${encodeURIComponent(params.k)}&done=1`
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <SignIn routing="hash" forceRedirectUrl={back} signUpForceRedirectUrl={back} />
      </div>
    )
  }

  return (
    <Shell>
      {returnUrl ? (
        <>
          <p className="text-sm text-gray-500 mb-4">You're signed in. Head back to the app to continue.</p>
          <a href={returnUrl} className="block w-full bg-emerald-500 text-white py-3 rounded-xl text-sm font-medium no-underline">Open TaxSnap</a>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">Signed in as {user?.primaryEmailAddress?.emailAddress}</p>
          <button onClick={handBack} className="w-full bg-emerald-500 text-white py-3 rounded-xl text-sm font-medium mb-2">Continue to TaxSnap</button>
          <button onClick={() => signOut({ redirectUrl: `/native/start?k=${encodeURIComponent(params.k)}` })} className="w-full border border-gray-200 py-3 rounded-xl text-sm text-gray-600">Use a different account</button>
        </>
      )}
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white border border-gray-100 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-xl mx-auto mb-3">📄</div>
        <p className="font-medium mb-2">TaxSnap</p>
        {children}
      </div>
    </div>
  )
}
