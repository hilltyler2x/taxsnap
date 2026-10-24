import { NextResponse } from "next/server"
import { clerkClient } from "@clerk/nextjs/server"
import { del } from "@vercel/blob"
import Stripe from "stripe"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ plan: user.plan, isOwner: user.isOwner })
}

// Delete account (required by the App Store): cancel billing, remove receipt photos,
// delete all rows (receipts, trips and email tokens cascade from User), then the Clerk user.
export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (user.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" })
      await stripe.subscriptions.cancel(user.stripeSubscriptionId)
    } catch (err) {
      console.error("Account delete: Stripe cancel failed:", err)
    }
  }

  const photos = await prisma.receipt.findMany({
    where: { userId: user.id, imageUrl: { not: null } },
    select: { imageUrl: true },
  })
  const urls = photos.map(p => p.imageUrl!).filter(u => u.includes("blob.vercel-storage.com"))
  if (urls.length) {
    try { await del(urls) } catch (err) { console.error("Account delete: blob cleanup failed:", err) }
  }

  await prisma.user.delete({ where: { id: user.id } })

  try {
    const client = await clerkClient()
    await client.users.deleteUser(user.id)
  } catch (err) {
    console.error("Account delete: Clerk delete failed:", err)
    return NextResponse.json({ error: "Your data was deleted, but sign-in removal failed. Contact support." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
