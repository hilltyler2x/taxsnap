# TaxSnap — Setup Guide

## What you're getting
A full-stack Next.js app with:
- Real Google & Microsoft OAuth (sign in with your actual accounts)
- Real Gmail + Outlook inbox scanning for receipts
- AI receipt scanning via Claude
- Stripe payments (Pro $5/mo, Business $15/mo, Lifetime $99)
- Owner bypass — your account gets full access for free
- IRS-compliant fields, mileage tracking, CSV/PDF export
- PostgreSQL database via Supabase
- Deploys to Vercel in minutes

---

## Step 1 — Install & run locally

```bash
# Clone or unzip the project, then:
npm install
cp .env.example .env.local
# Fill in .env.local with your keys (steps below)
npm run db:push     # creates database tables
npm run dev         # runs on http://localhost:3000
```

---

## Step 2 — Supabase (database)

1. Go to **supabase.com** → New project
2. Settings → Database → Connection string → copy the URI
3. Paste into `.env.local` as `DATABASE_URL`

---

## Step 3 — Google OAuth + Gmail

1. Go to **console.cloud.google.com**
2. Create a new project → Enable these APIs:
   - Gmail API
   - People API
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
   - (Add your Vercel domain too when deploying)
4. Copy Client ID → `GOOGLE_CLIENT_ID`
5. Copy Client Secret → `GOOGLE_CLIENT_SECRET`

---

## Step 4 — Microsoft OAuth + Outlook

1. Go to **portal.azure.com** → Azure Active Directory → App registrations → New registration
2. Name: TaxSnap
3. Supported account types: Accounts in any organizational directory and personal Microsoft accounts
4. Redirect URI: `http://localhost:3000/api/auth/callback/azure-ad`
5. After creating:
   - Overview → copy Application (client) ID → `AZURE_AD_CLIENT_ID`
   - Certificates & secrets → New client secret → copy value → `AZURE_AD_CLIENT_SECRET`
   - `AZURE_AD_TENANT_ID` = "common"
6. API permissions → Add: `Mail.Read`, `offline_access`, `openid`, `profile`, `email`

---

## Step 5 — Stripe (payments)

1. Go to **dashboard.stripe.com** → Developers → API keys
2. Copy Secret key → `STRIPE_SECRET_KEY`
3. Copy Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
4. Products → Create 5 products:
   - Pro Monthly ($5/mo recurring) → copy Price ID → `STRIPE_PRO_MONTHLY_PRICE_ID`
   - Pro Annual ($36/yr = $3/mo recurring) → `STRIPE_PRO_ANNUAL_PRICE_ID`
   - Business Monthly ($15/mo) → `STRIPE_BUSINESS_MONTHLY_PRICE_ID`
   - Business Annual ($120/yr = $10/mo) → `STRIPE_BUSINESS_ANNUAL_PRICE_ID`
   - Lifetime ($99 one-time payment) → `STRIPE_LIFETIME_PRICE_ID`
5. Webhooks → Add endpoint:
   - URL: `https://yourdomain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy signing secret → `STRIPE_WEBHOOK_SECRET`

---

## Step 6 — Anthropic API (AI scanning)

1. Go to **console.anthropic.com** → API Keys → Create key
2. Paste → `ANTHROPIC_API_KEY`

---

## Step 7 — Owner access (your free account)

In `.env.local`:
```
OWNER_PASSCODE=choose-any-secret-code
OWNER_EMAIL=your@actualemail.com
```

When you sign in with that email, you're automatically granted owner access. You can also type the passcode in the Account tab. No payment required.

---

## Step 8 — Deploy to Vercel

```bash
npm install -g vercel
vercel
# Follow prompts, then add all env vars in Vercel dashboard
```

Or connect your GitHub repo to Vercel and it auto-deploys on every push.

**After deploying:**
- Update `NEXTAUTH_URL` to your Vercel domain
- Update Google OAuth redirect URI to include `https://yourdomain.vercel.app/api/auth/callback/google`
- Update Azure redirect URI similarly
- Update Stripe webhook endpoint URL

---

## File structure

```
taxsnap/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   ← OAuth
│   │   ├── receipts/route.ts             ← CRUD receipts
│   │   ├── receipts/scan/route.ts        ← AI scanning
│   │   ├── trips/route.ts                ← Mileage
│   │   ├── email/route.ts                ← Gmail + Outlook
│   │   ├── export/route.ts               ← CSV + PDF
│   │   ├── stripe/route.ts               ← Checkout
│   │   ├── stripe/webhook/route.ts       ← Payment events
│   │   └── owner/route.ts                ← Owner bypass
│   ├── dashboard/page.tsx                ← Main app
│   ├── login/page.tsx                    ← Sign in page
│   └── layout.tsx
├── lib/
│   ├── prisma.ts                         ← Database client
│   └── irs.ts                            ← Tax rules
├── prisma/
│   └── schema.prisma                     ← Database schema
└── .env.example                          ← Copy to .env.local
```

---

## Cost to run

| Service | Free tier | After that |
|---------|-----------|------------|
| Vercel | Unlimited hobby | $20/mo pro |
| Supabase | 500MB, 50k rows | $25/mo |
| Anthropic | Pay per use | ~$0.01/scan |
| Stripe | No monthly fee | 2.9% + 30¢/transaction |
| Google/Microsoft OAuth | Free | Free |

For the first few hundred users, total cost is effectively $0.
