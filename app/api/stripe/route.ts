import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", { apiVersion: "2024-04-10" })

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id
  const { priceId } = await req.json()
  if (!priceId) return NextResponse.json({ error: "No price ID" }, { status: 400 })

  let customerId = user.stripeCustomerId ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email!, metadata: { userId } })
    customerId = customer.id
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
  }

  const isLifetime = priceId === process.env.STRIPE_LIFETIME_PRICE_ID
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: isLifetime ? "payment" : "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/account?success=true`,
    cancel_url: `${process.env.APP_URL}/account?canceled=true`,
    metadata: { userId },
  })
  return NextResponse.json({ url: checkoutSession.url })
}
