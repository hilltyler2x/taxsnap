"use client"
// Wires up the phone app shell: status bar style and the taxsnap:// links that bring the
// user back from the system browser after sign-in or email connect.
import { useEffect } from "react"
import toast from "react-hot-toast"
import { decryptHandoff, isNativeApp } from "@/lib/native"

export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return
    let removed = false
    const handles: { remove: () => Promise<void> }[] = []

    ;(async () => {
      const { App } = await import("@capacitor/app")
      const { Browser } = await import("@capacitor/browser")
      const { StatusBar, Style } = await import("@capacitor/status-bar")
      StatusBar.setStyle({ style: Style.Light }).catch(() => {})

      const h = await App.addListener("appUrlOpen", async ({ url }) => {
        const link = new URL(url)
        Browser.close().catch(() => {})
        if (link.host === "auth") {
          const token = await decryptHandoff(link.searchParams.get("c") ?? "")
          if (!token) { toast.error("Sign-in didn't finish. Please try again."); return }
          window.location.href = `/native/ticket#t=${encodeURIComponent(token)}`
        } else if (link.host === "open") {
          const path = link.searchParams.get("path") ?? "/dashboard"
          window.location.href = path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard"
        }
      })
      if (removed) h.remove(); else handles.push(h)
    })()

    return () => { removed = true; handles.forEach(h => h.remove()) }
  }, [])

  return null
}
