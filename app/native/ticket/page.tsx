"use client"
// Inside the phone app: finishes sign-in with the one-time token handed back from the browser.
import { useSignIn, useUser } from "@clerk/nextjs"
import { useEffect, useRef, useState } from "react"

export default function NativeTicket() {
  const { signIn } = useSignIn()
  const { isLoaded, isSignedIn } = useUser()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!isLoaded || !signIn || started.current) return
    started.current = true
    if (isSignedIn) { window.location.replace("/dashboard"); return }
    const ticket = new URLSearchParams(window.location.hash.slice(1)).get("t")
    window.history.replaceState({}, "", "/native/ticket")
    if (!ticket) { setFailed(true); return }
    ;(async () => {
      const { error } = await signIn.ticket({ ticket })
      if (error) { setFailed(true); return }
      const done = await signIn.finalize()
      if (done.error) { setFailed(true); return }
      window.location.replace("/dashboard")
    })()
  }, [isLoaded, isSignedIn, signIn])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-center">
      {failed ? (
        <div>
          <p className="text-sm text-gray-600 mb-4">Sign-in didn't finish. Please try again.</p>
          <a href="/login" className="inline-block bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium no-underline">Back to sign in</a>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Signing you in...</p>
      )}
    </div>
  )
}
