// Required by the App Store and Google Play. Keep it in step with what the app actually does.
export const metadata = { title: "Privacy policy — TaxSnap" }

const UPDATED = "October 24, 2026"
// Set NEXT_PUBLIC_SUPPORT_EMAIL in Vercel to the address you want public.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 pt-safe pb-safe">
      <div className="max-w-2xl mx-auto px-5 py-10 text-sm text-gray-700 leading-relaxed">
        <a href="/" className="text-xs text-emerald-600 no-underline">← TaxSnap</a>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4 mb-1">Privacy policy</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated {UPDATED}</p>

        <Section title="What TaxSnap does">
          TaxSnap helps you keep IRS-ready records of business expenses and mileage. This policy covers the TaxSnap website
          and the TaxSnap iPhone and Android apps.
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Account details:</b> your name, email address and profile picture from your sign-in.</li>
            <li><b>Receipts and trips you add:</b> merchant, amount, date, place, category, business purpose, notes, attendees, home-office details, and trip destinations and odometer readings.</li>
            <li><b>Receipt photos</b> you take or upload.</li>
            <li><b>Email and spreadsheet data, only if you connect them:</b> read-only access to Gmail or Outlook to find receipts, and read-only access to Google Sheets and your Drive file list to import expense spreadsheets.</li>
            <li><b>Billing status</b> if you subscribe on the website. Card details are handled by Stripe and never reach our servers.</li>
          </ul>
        </Section>

        <Section title="How we use it">
          Only to run TaxSnap for you: reading receipts, categorizing expenses, calculating deductions, and building your exports.
          We do not sell your data, show ads, or track you across other apps or websites.
        </Section>

        <Section title="Services that process your data">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Anthropic</b> (Claude AI) reads receipt photos, receipt emails and imported spreadsheets to pull out the details. Anthropic does not use this data to train its models.</li>
            <li><b>Supabase</b> stores your account, receipts and trips.</li>
            <li><b>Vercel</b> hosts the app and stores receipt photos.</li>
            <li><b>Clerk</b> handles sign-in.</li>
            <li><b>Google and Microsoft</b>, only when you connect Gmail, Google Sheets or Outlook.</li>
            <li><b>OpenStreetMap (Nominatim)</b> suggests addresses as you type a trip destination.</li>
            <li><b>Stripe</b> processes payments made on the website.</li>
          </ul>
        </Section>

        <Section title="Email access">
          When you connect Gmail or Outlook, TaxSnap reads messages that look like receipts so you can import them. We don't send
          email, change your mailbox, or keep the contents of messages you don't import. TaxSnap's use of information received from
          Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. You can disconnect
          at any time in Account.
        </Section>

        <Section title="Camera and photos">
          The apps use your camera and photo library only when you choose to scan a receipt.
        </Section>

        <Section title="Keeping and deleting your data">
          Your records stay until you delete them, since the IRS expects you to keep them for at least three years. You can delete a
          single receipt or trip at any time, or delete your whole account in Account → Delete account. That removes your receipts,
          trips, photos, connected email access and sign-in, and cancels any active subscription.
        </Section>

        <Section title="Contact">
          {SUPPORT_EMAIL
            ? <>Questions about your data: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-emerald-600">{SUPPORT_EMAIL}</a></>
            : "Questions about your data: contact us through the TaxSnap website."}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
      <div>{children}</div>
    </section>
  )
}
