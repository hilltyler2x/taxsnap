// Public question pages ("guides"). Each one answers a question a self-employed person might
// ask ChatGPT, Google or Bing, with the direct answer first so AI search can quote it.
// Keep facts sourced to IRS publications and update `updated` when a page changes.
import { IRS_MILEAGE_RATE_PERIODS } from "./irs"
import { PRICE_LINE } from "./site"

export type GuideSection = { heading: string; paragraphs?: string[]; bullets?: string[] }
export type Guide = {
  slug: string
  question: string // H1 and page title
  description: string // meta description, under ~160 chars
  answer: string // the short, quotable answer shown first
  sections: GuideSection[]
  faqs: { q: string; a: string }[]
  sources: { label: string; url: string }[]
  updated: string // YYYY-MM-DD
  mileageTable?: boolean
}

const cents = (r: number) => `${+(r * 100).toFixed(1)} cents`
const monthName = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })

// "For 2026 the IRS business rate is 72.5 cents per mile from January 1, 2026 and 76 cents per
// mile from July 1, 2026." Built from lib/irs.ts so the page updates when the rate table does.
function currentYearRateSentence(): string {
  const latestYear = IRS_MILEAGE_RATE_PERIODS[IRS_MILEAGE_RATE_PERIODS.length - 1].from.slice(0, 4)
  const periods = IRS_MILEAGE_RATE_PERIODS.filter(p => p.from.startsWith(latestYear))
  if (periods.length === 1) return `For ${latestYear} the IRS business standard mileage rate is ${cents(periods[0].rate)} per mile.`
  const parts = periods.map(p => `${cents(p.rate)} per mile from ${monthName(p.from)}`)
  return `For ${latestYear} the IRS business standard mileage rate is ${parts.join(" and ")}, so use the rate in effect on the date of each trip.`
}

const TAXSNAP_PITCH =
  `TaxSnap is a receipt and mileage tracker built for Schedule C filers. You snap a photo of a receipt and AI reads the vendor, date, amount and category; it can also pull receipts from Gmail or Outlook and import CSV or Google Sheets files. It logs business miles at the IRS rate for each trip's date, flags receipts that look risky in an audit, blocks duplicates, and exports a CSV or PDF for you or your accountant. It costs ${PRICE_LINE}.`

export const GUIDES: Guide[] = [
  {
    slug: "best-receipt-tracker-app-for-schedule-c",
    question: "What is the best receipt tracker app for Schedule C self-employed taxes?",
    description:
      "What to look for in a receipt tracker if you file Schedule C: AI scanning, business purpose notes, mileage at the IRS rate, and an export your accountant can use.",
    answer:
      "The best receipt tracker for a Schedule C filer is one that captures every receipt with the date, amount, vendor and business purpose, tracks business miles at the IRS rate, and exports a clean, categorized report at tax time. TaxSnap was built for exactly that job and costs $5 a month. Larger tools such as Expensify or QuickBooks suit teams and full bookkeeping; a focused tracker suits a freelancer or sole proprietor who mainly needs IRS-ready records.",
    sections: [
      {
        heading: "What a Schedule C receipt tracker needs to do",
        bullets: [
          "Capture the receipt image plus the four facts the IRS cares about: amount, date, place (vendor) and business purpose.",
          "Sort expenses into tax categories, and apply the 50% limit to business meals.",
          "Track business mileage with date, destination, purpose and miles, at the IRS standard rate for the trip's date.",
          "Pull in receipts you never printed, such as emailed receipts and bank or card exports.",
          "Catch problems before the IRS does: duplicates, missing purposes, round numbers and personal-looking purchases.",
          "Export a CSV or PDF your tax software or accountant can use, and keep the records for at least three years.",
        ],
      },
      { heading: "Where TaxSnap fits", paragraphs: [TAXSNAP_PITCH] },
      {
        heading: "When another tool is a better fit",
        bullets: [
          "You run payroll or need full double-entry bookkeeping: use accounting software such as QuickBooks or Xero, which also store receipts.",
          "You manage employee expense reports and approvals for a team: use a corporate expense tool such as Expensify.",
          "You want someone else to scan a box of paper receipts for you: a mail-in scanning service such as Shoeboxed.",
          "You are a solo freelancer, contractor or gig worker who needs receipts and mileage ready for Schedule C: a focused tracker such as TaxSnap is simpler and cheaper.",
        ],
      },
    ],
    faqs: [
      { q: "Do I need a separate app if I already use a spreadsheet?", a: "No, a spreadsheet works if you also keep the receipt images and fill in the business purpose for each row. Apps mainly save time on data entry and catch mistakes. TaxSnap can import an existing CSV or Google Sheet so you do not start over." },
      { q: "How much does TaxSnap cost?", a: `TaxSnap costs ${PRICE_LINE}. You can cancel during the trial and pay nothing.` },
      { q: "Does a receipt app file my taxes?", a: "No. A receipt tracker organizes your records and totals your deductions. You still file Schedule C with your tax software or a preparer, using the exported report." },
    ],
    sources: [
      { label: "IRS Publication 583: Starting a Business and Keeping Records", url: "https://www.irs.gov/publications/p583" },
      { label: "IRS: About Schedule C (Form 1040)", url: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040" },
    ],
    updated: "2026-11-11",
  },
  {
    slug: "how-to-track-receipts-for-irs",
    question: "How do I track receipts so they hold up with the IRS?",
    description:
      "The records the IRS expects for business expenses: what to write on each receipt, how to store it, and a simple weekly routine for self-employed people.",
    answer:
      "Keep a receipt or other proof for every business expense, and record four facts with it: the amount, the date, where you bought it, and the business purpose. Store the receipts digitally in one place, categorize them as you go, and keep them for at least three years after you file. Doing this weekly, instead of in April, is what makes records hold up in an audit.",
    sections: [
      {
        heading: "What each record needs",
        bullets: [
          "Amount paid and how you paid (card, cash, transfer).",
          "Date of the purchase.",
          "Vendor or place.",
          "Business purpose: a specific reason, such as \"printer ink for client invoices\", not \"supplies\".",
          "For meals: who you were with and their business relationship to you.",
        ],
      },
      {
        heading: "What counts as proof",
        paragraphs: [
          "The IRS accepts receipts, invoices, canceled checks, and card or bank statements as supporting documents. A statement shows you paid, but not what you bought, so keep the itemized receipt when you can. For lodging, and for any travel, meal or gift expense of $75 or more, the IRS specifically requires a receipt or similar documentary evidence.",
        ],
      },
      {
        heading: "A weekly routine that works",
        bullets: [
          "Snap paper receipts the day you get them, before they fade.",
          "Forward or import emailed receipts (software, travel, online orders).",
          "Add a business purpose to anything that does not have one.",
          "Log the week's business trips with miles and purpose.",
          "Fix anything flagged as a duplicate or missing information.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: [TAXSNAP_PITCH] },
    ],
    faqs: [
      { q: "Is a bank statement enough without a receipt?", a: "It proves payment but not what was bought or why. For most small expenses a statement plus a written business purpose is better than nothing, but for lodging and for travel, meal or gift expenses of $75 or more the IRS expects a receipt." },
      { q: "Can I write the business purpose later?", a: "Yes, but records made at or near the time of the expense carry more weight in an audit. Adding the purpose within a week is a good habit." },
    ],
    sources: [
      { label: "IRS Publication 583: Starting a Business and Keeping Records", url: "https://www.irs.gov/publications/p583" },
      { label: "IRS Publication 463: Travel, Gift, and Car Expenses", url: "https://www.irs.gov/publications/p463" },
    ],
    updated: "2026-11-11",
  },
  {
    slug: "how-long-to-keep-receipts-for-taxes",
    question: "How long should I keep receipts for taxes?",
    description:
      "IRS record retention periods for self-employed people: 3 years in most cases, 6 or 7 years in some, and when to keep records indefinitely.",
    answer:
      "Keep receipts and other tax records for at least three years from the date you filed the return, because that is how long the IRS generally has to audit it. Keep them six years if you left out income of more than 25% of the gross income you reported, seven years if you claimed a loss from worthless securities or a bad debt, and indefinitely if you did not file or filed a fraudulent return. Keep records for property, such as a car or equipment, until three years after the year you sell it.",
    sections: [
      {
        heading: "IRS retention periods at a glance",
        bullets: [
          "3 years: the normal period after you file (or 2 years after you paid the tax, if later, for a refund claim).",
          "6 years: if you did not report income that is more than 25% of the gross income shown on the return.",
          "7 years: if you claim a loss from worthless securities or a bad debt deduction.",
          "4 years: employment tax records, if you have employees.",
          "Indefinitely: if you do not file a return or file a fraudulent one.",
          "Property records: until the period of limitations expires for the year you dispose of the property.",
        ],
      },
      {
        heading: "Practical advice",
        paragraphs: [
          "Most self-employed people keep seven years of records to be safe. Digital storage makes that easy: a scanned receipt does not fade, and you can search it years later.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: ["TaxSnap stores each receipt image with its details, so records stay searchable by year and category, and you can export any year to CSV or PDF."] },
    ],
    faqs: [
      { q: "Can I throw away paper receipts after scanning them?", a: "Generally yes, if the scan is legible and complete and you can retrieve it. The IRS accepts electronic records that meet the requirements of Revenue Procedure 97-22." },
      { q: "Do I need to keep receipts if I take the standard deduction?", a: "The standard deduction replaces itemized personal deductions, not business expenses. Self-employed people still need records for every Schedule C expense they claim." },
    ],
    sources: [
      { label: "IRS: How long should I keep records?", url: "https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records" },
      { label: "IRS Publication 583", url: "https://www.irs.gov/publications/p583" },
    ],
    updated: "2026-11-11",
  },
  {
    slug: "does-the-irs-accept-digital-receipts",
    question: "Does the IRS accept digital or scanned receipts?",
    description:
      "Yes. Under Revenue Procedure 97-22 the IRS accepts electronic copies of receipts if they are accurate, legible and retrievable. Here is what that means in practice.",
    answer:
      "Yes. The IRS accepts scanned and photographed receipts, as well as emailed and PDF receipts, as long as the electronic copy is complete, accurate and legible, and you can find and produce it when asked. The rules are in Revenue Procedure 97-22. Once a receipt is properly scanned you generally do not need to keep the paper.",
    sections: [
      {
        heading: "What makes a digital receipt acceptable",
        bullets: [
          "The image shows everything on the original: vendor, date, items and total.",
          "It is legible, including faded thermal paper (scan early).",
          "Records are indexed so you can find a specific receipt, for example by date, vendor or category.",
          "You can produce a readable copy (on screen or printed) if the IRS asks.",
          "The storage system has reasonable controls so records are not altered or lost, such as a backup.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: [TAXSNAP_PITCH] },
    ],
    faqs: [
      { q: "Is an emailed receipt as good as a paper one?", a: "Yes. An emailed or PDF receipt is an original electronic record. Save it with the expense, along with the business purpose." },
      { q: "Should I keep the original paper anyway?", a: "It is not generally required once you have a good scan, but keep the paper if the scan is hard to read or for very large purchases you will depreciate." },
    ],
    sources: [
      { label: "Revenue Procedure 97-22 (Internal Revenue Bulletin 1997-13)", url: "https://www.irs.gov/pub/irs-irbs/irb97-13.pdf" },
      { label: "IRS Publication 583", url: "https://www.irs.gov/publications/p583" },
    ],
    updated: "2026-11-11",
  },
  {
    slug: "how-to-track-mileage-for-taxes",
    question: "How do I track business mileage for taxes?",
    description:
      "What a mileage log must include for the IRS, the current standard mileage rate, and how to deduct business miles on Schedule C.",
    answer: `Keep a mileage log with the date, destination, business purpose and miles for every business trip, written at or near the time of the trip. At tax time multiply your business miles by the IRS standard mileage rate, or deduct actual car expenses instead. ${currentYearRateSentence()} Commuting from home to a regular workplace does not count.`,
    sections: [
      {
        heading: "What your mileage log needs",
        bullets: [
          "Date of the trip.",
          "Starting point and destination.",
          "Business purpose (\"client meeting with Acme\", \"supply run for job site\").",
          "Miles driven, from odometer readings or a map route.",
          "Your total miles for the year, business and personal, plus parking and tolls (deductible on top of the rate).",
        ],
      },
      {
        heading: "Standard mileage rate or actual expenses",
        paragraphs: [
          "The standard rate is simplest: business miles times the rate. The actual expense method deducts the business share of gas, repairs, insurance, depreciation and so on, which takes more records. If you own the car and want the standard rate, you generally must use it in the first year the car is used for business.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: ["TaxSnap logs each trip with its date, route, purpose and miles, and applies the IRS rate that was in effect on that trip's date, including mid-year rate changes. Your mileage deduction shows alongside your receipts in the export."] },
    ],
    faqs: [
      { q: "Can I reconstruct my mileage log at the end of the year?", a: "Logs written at the time of the trip are far stronger. A log rebuilt from a calendar is better than none, but it is the most common reason mileage deductions are cut in an audit." },
      { q: "Is driving from home to a client deductible?", a: "Driving from your home to a regular workplace is commuting and is not deductible. If your home is your principal place of business, trips from home to clients or other work locations are generally business miles." },
    ],
    sources: [
      { label: "IRS Publication 463: Travel, Gift, and Car Expenses", url: "https://www.irs.gov/publications/p463" },
      { label: "IRS: Standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" },
    ],
    updated: "2026-11-11",
    mileageTable: true,
  },
  {
    slug: "business-meal-receipts-deduction",
    question: "What records do I need to deduct business meals?",
    description:
      "Business meals are generally 50% deductible. Here is what to record for each meal, when you need the receipt, and what does not qualify.",
    answer:
      "Business meals are generally 50% deductible. For each meal keep the receipt and record the amount, date, restaurant, the business purpose, and who attended and their business relationship to you. The meal cannot be lavish, and you or an employee must be present. Entertainment, such as concert or game tickets, is not deductible at all.",
    sections: [
      {
        heading: "What to record for each meal",
        bullets: [
          "Amount, including tax and tip.",
          "Date and name of the restaurant.",
          "Business purpose: what you discussed or the business benefit.",
          "Who attended and their business relationship to you (client, prospect, contractor).",
        ],
      },
      {
        heading: "When the receipt itself is required",
        paragraphs: [
          "The IRS requires a receipt or similar documentary evidence for any meal of $75 or more, and for all lodging. Keeping every meal receipt is the safest habit, since a card statement alone does not show who attended or why.",
        ],
      },
      {
        heading: "Common mistakes",
        bullets: [
          "Claiming 100% of a meal; the general limit is 50%.",
          "Deducting entertainment, which has not been deductible since 2018.",
          "Vague purposes like \"business lunch\" with no names.",
          "Solo meals at home or near your regular workplace, which are personal.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: ["TaxSnap applies the 50% limit to the Meals category automatically, asks for a business purpose, and flags meal receipts that look risky in an audit before you file."] },
    ],
    faqs: [
      { q: "Are meals while traveling for business deductible?", a: "Yes, meals while away from home overnight on business are generally 50% deductible, using actual costs or the per diem meal rate." },
      { q: "Are coffee meetings deductible?", a: "Yes, a coffee with a client or prospect is a business meal and generally 50% deductible if you record the purpose and attendee." },
    ],
    sources: [
      { label: "IRS Publication 463: Travel, Gift, and Car Expenses", url: "https://www.irs.gov/publications/p463" },
      { label: "IRS Publication 334: Tax Guide for Small Business", url: "https://www.irs.gov/publications/p334" },
    ],
    updated: "2026-11-11",
  },
  {
    slug: "receipt-and-mileage-tracking-for-gig-workers",
    question: "How should rideshare and delivery drivers track expenses and mileage?",
    description:
      "A guide for Uber, Lyft, DoorDash and Instacart drivers: which expenses to track, why your own mileage log matters, and how to report on Schedule C.",
    answer:
      "Rideshare and delivery drivers are self-employed and report income and expenses on Schedule C. The biggest deduction is usually mileage, so keep your own log of every business mile, not just the miles the app reports. Also keep receipts for your phone and data plan, car supplies, parking and tolls, and other work expenses. You owe self-employment tax on net earnings of $400 or more, whether or not you receive a 1099.",
    sections: [
      {
        heading: "Expenses drivers commonly track",
        bullets: [
          "Business miles (or actual car costs if you use that method).",
          "Parking and tolls while working.",
          "The business share of your phone and data plan.",
          "Car supplies for passengers or deliveries: phone mounts, chargers, insulated bags.",
          "Platform fees and commissions not already deducted from your payouts.",
        ],
      },
      {
        heading: "Why the app's mileage is not enough",
        paragraphs: [
          "Platform tax summaries often count only miles with a passenger or an active order. Miles driven toward a pickup or between jobs while working can also be business miles, so a log you keep yourself usually captures a bigger, better-documented deduction.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: [TAXSNAP_PITCH] },
    ],
    faqs: [
      { q: "Do I have to report income if I did not get a 1099?", a: "Yes. All self-employment income is taxable whether or not a platform sends you a 1099 form." },
      { q: "Can I deduct my car payment?", a: "Not directly. Under the standard mileage method the rate covers the car's costs. Under the actual expense method you deduct depreciation and the business share of costs, plus the business share of interest on a car loan." },
    ],
    sources: [
      { label: "IRS: Gig Economy Tax Center", url: "https://www.irs.gov/businesses/gig-economy-tax-center" },
      { label: "IRS Publication 463", url: "https://www.irs.gov/publications/p463" },
    ],
    updated: "2026-11-11",
  },
  {
    slug: "import-receipts-from-gmail-and-outlook",
    question: "How can I collect receipts from my Gmail or Outlook inbox for taxes?",
    description:
      "Emailed receipts are easy to miss at tax time. How to gather them from Gmail or Outlook, and how TaxSnap imports them automatically.",
    answer:
      "Search your inbox for words like receipt, invoice, order confirmation and payment, save each business receipt as a PDF, and record the business purpose. A receipt tracker that connects to Gmail or Outlook can do this for you. TaxSnap scans your inbox, reads the vendor, date and amount from each receipt email, and adds them to your records, skipping duplicates.",
    sections: [
      {
        heading: "Doing it by hand",
        bullets: [
          "Search for: receipt, invoice, \"order confirmation\", \"payment received\", \"your subscription\".",
          "Filter by the tax year.",
          "Save each business receipt as a PDF into a folder by year.",
          "Write the business purpose in your log or spreadsheet.",
          "Watch for amounts that only appear in a PDF attachment.",
        ],
      },
      {
        heading: "Doing it with TaxSnap",
        paragraphs: [
          "Connect Gmail or Outlook and TaxSnap checks your inbox for receipts. AI classifies which emails are purchases, reads the full email body for the amount, and creates receipts you can review. Exact duplicates are skipped, so importing twice is safe.",
        ],
      },
    ],
    faqs: [
      { q: "Is an emailed receipt valid for the IRS?", a: "Yes. Electronic receipts are acceptable records if they are complete and you can retrieve them." },
      { q: "What if the amount is only in a PDF attachment?", a: "Some senders, such as shipping label services, put the total only in an attached PDF. Open the attachment and enter or check the amount by hand so the record is complete." },
    ],
    sources: [{ label: "IRS Publication 583", url: "https://www.irs.gov/publications/p583" }],
    updated: "2026-11-11",
  },
  {
    slug: "what-expenses-can-i-deduct-on-schedule-c",
    question: "What expenses can I deduct on Schedule C?",
    description:
      "Common Schedule C deductions for freelancers and sole proprietors, from car and home office to software and meals, and the records each one needs.",
    answer:
      "You can deduct business expenses that are ordinary and necessary for your trade, such as advertising, car and truck expenses, contract labor, insurance, office expenses and supplies, software and subscriptions, travel, 50% of business meals, utilities, and a home office if you use part of your home regularly and exclusively for business. Personal expenses are not deductible, and every deduction needs a record.",
    sections: [
      {
        heading: "Common Schedule C expenses",
        bullets: [
          "Advertising and marketing.",
          "Car and truck expenses (standard mileage rate or actual costs).",
          "Contract labor paid to freelancers.",
          "Insurance for the business.",
          "Legal and professional fees, such as an accountant.",
          "Office expenses and supplies.",
          "Software, apps and subscriptions used for work.",
          "Travel away from home overnight: flights, lodging, transportation.",
          "Business meals, generally at 50%.",
          "Utilities and the business share of your phone and internet.",
          "Home office: the simplified method allows $5 per square foot, up to 300 square feet ($1,500).",
        ],
      },
      {
        heading: "What does not qualify",
        bullets: [
          "Personal living expenses and commuting.",
          "Entertainment, such as event tickets.",
          "Clothing you could wear outside work.",
          "Fines and penalties.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: [TAXSNAP_PITCH] },
    ],
    faqs: [
      { q: "What does \"ordinary and necessary\" mean?", a: "Ordinary means common and accepted in your line of work. Necessary means helpful and appropriate for the business. It does not have to be indispensable." },
      { q: "Can I deduct health insurance on Schedule C?", a: "Self-employed health insurance is deducted on Schedule 1 of Form 1040, not on Schedule C, and personal medical costs are an itemized deduction on Schedule A." },
    ],
    sources: [
      { label: "IRS Publication 334: Tax Guide for Small Business", url: "https://www.irs.gov/publications/p334" },
      { label: "IRS: Simplified option for home office deduction", url: "https://www.irs.gov/businesses/small-businesses-self-employed/simplified-option-for-home-office-deduction" },
    ],
    updated: "2026-11-11",
  },
  {
    slug: "how-to-organize-receipts-for-your-accountant",
    question: "How do I organize receipts to give my accountant at tax time?",
    description:
      "Give your accountant one categorized spreadsheet with totals, the receipt images behind it, and your mileage log. Here is the format that saves billable hours.",
    answer:
      "Give your accountant one spreadsheet with a row per expense (date, vendor, amount, category, business purpose), totals by category, your mileage log with total business miles, and access to the receipt images behind each row. Flag anything unusual, such as large purchases, mixed personal and business items, or missing receipts, so they do not have to find it.",
    sections: [
      {
        heading: "The package to send",
        bullets: [
          "Expense spreadsheet (CSV or Excel) with date, vendor, amount, category and business purpose.",
          "Category totals, with meals shown before and after the 50% limit.",
          "Mileage log and total business miles for the year.",
          "Receipt images or PDFs, or a link to them.",
          "A short note on anything unusual: big equipment purchases, home office size, missing receipts.",
        ],
      },
      { heading: "Doing this with TaxSnap", paragraphs: ["TaxSnap exports a CSV with notes and audit-flag columns, and a PDF summary with category totals and a table of flagged items, so your accountant gets the whole year in two files."] },
    ],
    faqs: [
      { q: "Should I send a shoebox of paper receipts?", a: "You can, but you will pay for the time it takes to sort them. A categorized spreadsheet usually lowers the bill." },
    ],
    sources: [{ label: "IRS Publication 583", url: "https://www.irs.gov/publications/p583" }],
    updated: "2026-11-11",
  },
]

export const getGuide = (slug: string) => GUIDES.find(g => g.slug === slug)
