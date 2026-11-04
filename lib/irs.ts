// IRS business standard mileage rate, as dated periods (oldest first). The IRS usually sets one
// rate per year in December, but occasionally changes it mid-year when fuel spikes (2011, 2022,
// 2026), so look the rate up by the trip's date, not just its year. Add each new period here.
const IRS_MILEAGE_RATE_PERIODS: { from: string; rate: number }[] = [
  { from: "2023-01-01", rate: 0.655 },
  { from: "2024-01-01", rate: 0.67 },
  { from: "2025-01-01", rate: 0.70 },
  { from: "2026-01-01", rate: 0.725 }, // IRS Notice 2026-10
  { from: "2026-07-01", rate: 0.76 }, // IRS Announcement 2026-11 (midyear increase)
]

// Trip dates are stored as UTC midnight, so compare on the UTC calendar day.
export function mileageRateOn(date: Date | string): number {
  const day = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10)
  let rate = IRS_MILEAGE_RATE_PERIODS[0].rate
  for (const p of IRS_MILEAGE_RATE_PERIODS) if (day >= p.from) rate = p.rate
  return rate
}

// The rate in effect today. Use mileageRateOn(trip.date) for anything tied to a specific trip.
export const IRS_MILEAGE_RATE = mileageRateOn(new Date())

export const DEDUCT_RATES: Record<string, number> = {
  Travel: 1.0,
  Meals: 0.5,
  Office: 1.0,
  Software: 1.0,
  Home: 0, // calculated from sq ft
  // Personal medical costs are a Schedule A itemized deduction (7.5%-of-AGI floor), not
  // a Schedule C business expense — self-employed health insurance premiums get their own
  // above-the-line deduction instead. Neither is "50% of a receipt," so don't credit it here.
  Medical: 0,
  Business: 1.0,
  Other: 0.5,
}

export const PLAN_LIMITS = {
  FREE: { receipts: 10, miles: false, export: false, emailImport: false },
  PRO: { receipts: Infinity, miles: true, export: true, emailImport: true },
  BUSINESS: { receipts: Infinity, miles: true, export: true, emailImport: true, teamMembers: 5 },
  LIFETIME: { receipts: Infinity, miles: true, export: true, emailImport: true, teamMembers: 5 },
  OWNER: { receipts: Infinity, miles: true, export: true, emailImport: true, teamMembers: Infinity },
}

export const CATEGORIES = [
  "Travel",
  "Meals",
  "Office",
  "Software",
  "Home",
  "Medical",
  "Business",
  "Other",
] as const

export type Category = (typeof CATEGORIES)[number]

// IRS wants a specific, ordinary-and-necessary business reason on file —
// vague purposes ("stuff", "misc") are what get deductions thrown out in an audit.
export const BUSINESS_PURPOSES = [
  "Client meeting or consultation",
  "Business travel — client visit",
  "Business travel — conference or training",
  "Marketing and advertising",
  "Inventory purchase for resale",
  "Office supplies and equipment",
  "Professional development / continuing education",
  "Software or subscription for business use",
  "Contractor or vendor payment",
  "Business meal — client or prospect",
  "Home office expense",
  "Insurance premium (business)",
  "Legal or professional fees",
  "Shipping and postage",
  "Repairs and maintenance",
  "Other ordinary and necessary business expense",
] as const

export type BusinessPurpose = (typeof BUSINESS_PURPOSES)[number]

export function calcDeductible(
  amount: number,
  category: string,
  homePct?: number
): number {
  if (category === "Home") {
    return amount * ((homePct ?? 0) / 100)
  }
  return amount * (DEDUCT_RATES[category] ?? 0.5)
}

export function calcMileageDeductible(miles: number, date: Date | string): number {
  return Math.round(miles * mileageRateOn(date) * 100) / 100
}

// IRS required fields per category
export function irsRequiredFields(category: string): string[] {
  const base = ["name", "amount", "date", "place", "purpose"]
  if (category === "Meals") return [...base, "attendees"]
  if (category === "Home") return [...base, "homePct"]
  return base
}
