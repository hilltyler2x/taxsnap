import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", { apiVersion: "2024-04-10" })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = (session!.user as any).id
  const { priceId } = await req.json()
  if (!priceId) return NextResponse.json({ error: "No price ID" }, { status: 400 })

  let customerId = (await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } }))?.stripeCustomerId ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({ email: session!.user!.email!, metadata: { userId } })
    customerId = customer.id
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
  }

  const isLifetime = priceId === process.env.STRIPE_LIFETIME_PRICE_ID
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: isLifetime ? "payment" : "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/account?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/account?canceled=true`,
    metadata: { userId },
  })
  return NextResponse.json({ url: checkoutSession.url })
}
