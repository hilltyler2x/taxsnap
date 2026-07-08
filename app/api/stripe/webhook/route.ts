import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-04-10" })

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const PRICE_TO_PLAN: Record<string, string> = {
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "x"]: "PRO",
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "x"]: "PRO",
    [process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID ?? "x"]: "BUSINESS",
    [process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID ?? "x"]: "BUSINESS",
    [process.env.STRIPE_LIFETIME_PRICE_ID ?? "x"]: "LIFETIME",
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      if (!userId) break
      if (session.mode === "payment") {
        await prisma.user.update({ where: { id: userId }, data: { plan: "LIFETIME" as any } })
      }
      break
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription
      const priceId = sub.items.data[0]?.price.id
      const plan = PRICE_TO_PLAN[priceId] ?? "FREE"
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: sub.customer as string } })
      if (!user) break
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: plan as any,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: new Date((sub as any).current_period_end * 1000),
        },
      })
      break
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: sub.customer as string } })
      if (!user) break
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: "FREE" as any, stripeSubscriptionId: null, stripePriceId: null, stripeCurrentPeriodEnd: null },
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
