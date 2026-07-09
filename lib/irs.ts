export const IRS_MILEAGE_RATE = 0.67 // 2025 rate per mile

export const DEDUCT_RATES: Record<string, number> = {
  Travel: 1.0,
  Meals: 0.5,
  Office: 1.0,
  Software: 1.0,
  Home: 0, // calculated from sq ft
  Medical: 0.5,
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

export function calcMileageDeductible(miles: number): number {
  return miles * IRS_MILEAGE_RATE
}

// IRS required fields per category
export function irsRequiredFields(category: string): string[] {
  const base = ["name", "amount", "date", "place", "purpose"]
  if (category === "Meals") return [...base, "attendees"]
  if (category === "Home") return [...base, "homePct"]
  return base
}
