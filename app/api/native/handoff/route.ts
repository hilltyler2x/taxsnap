import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { encryptForApp } from "@/lib/nativeHandoff"

// Called from /native/start in the system browser after sign-in. Returns a one-time
// Clerk sign-in token encrypted with the key only the app knows.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { k } = await req.json().catch(() => ({}))
  if (typeof k !== "string" || k.length < 32 || k.length > 128) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 })
  }

  const client = await clerkClient()
  const { token } = await client.signInTokens.createSignInToken({ userId, expiresInSeconds: 300 })
  return NextResponse.json({ c: encryptForApp(k, token) })
}
