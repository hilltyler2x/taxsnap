"use client"
// End of email connect started from the phone app: send the user back into the app.
import { useEffect, useState } from "react"

export default function NativeReturn() {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get("to") ?? "/dashboard"
    const path = to.startsWith("/") && !to.startsWith("//") ? to : "/dashboard"
    const appUrl = `taxsnap://open?path=${encodeURIComponent(path)}`
    setUrl(appUrl)
    window.location.href = appUrl
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white border border-gray-100 rounded-2xl p-6 text-center">
        <p className="font-medium mb-2">All set</p>
        <p className="text-sm text-gray-500 mb-4">Head back to the app to continue.</p>
        {url && <a href={url} className="block w-full bg-emerald-500 text-white py-3 rounded-xl text-sm font-medium no-underline">Open TaxSnap</a>}
      </div>
    </div>
  )
}
