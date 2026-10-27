// IRS business standard mileage rate per mile, by tax year. Add next year's rate when the
// IRS announces it (usually mid-December). Years without an entry use the latest rate.
export const IRS_MILEAGE_RATES: Record<number, number> = {
  2024: 0.67,
  2025: 0.70,
  2026: 0.725,
}

const LATEST_RATE_YEAR = Math.max(...Object.keys(IRS_MILEAGE_RATES).map(Number))

export function mileageRateFor(year: number): number {
  return IRS_MILEAGE_RATES[year] ?? IRS_MILEAGE_RATES[LATEST_RATE_YEAR]
}

export const IRS_MILEAGE_RATE = mileageRateFor(new Date().getFullYear())

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

// date is the trip date, so a trip keeps the rate of the year it was driven.
export function calcMileageDeductible(miles: number, date?: Date): number {
  const year = date ? date.getUTCFullYear() : new Date().getFullYear()
  return Math.round(miles * mileageRateFor(year) * 100) / 100
}

// IRS required fields per category
export function irsRequiredFields(category: string): string[] {
  const base = ["name", "amount", "date", "place", "purpose"]
  if (category === "Meals") return [...base, "attendees"]
  if (category === "Home") return [...base, "homePct"]
  return base
}
