import { prisma } from "@/lib/prisma"

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export type LearnedClassification = { category: string; purpose: string | null }

// If the user has already categorized this merchant before (even on a
// different day, different receipt), reuse that same category/purpose
// instead of letting the AI guess fresh every time.
export async function getLearnedClassification(userId: string, merchantName: string): Promise<LearnedClassification | null> {
  if (!merchantName) return null
  const norm = normalize(merchantName)
  if (!norm) return null

  const receipts = await prisma.receipt.findMany({
    where: { userId },
    select: { name: true, category: true, purpose: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  })

  const matches = receipts.filter(r => {
    const rn = normalize(r.name)
    return rn.length > 0 && (rn === norm || rn.includes(norm) || norm.includes(rn))
  })
  if (!matches.length) return null

  const counts = new Map<string, { category: string; purpose: string | null; count: number }>()
  for (const m of matches) {
    const key = `${m.category}::${m.purpose ?? ""}`
    const existing = counts.get(key)
    if (existing) existing.count++
    else counts.set(key, { category: m.category, purpose: m.purpose, count: 1 })
  }

  const best = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0]
  return best ? { category: best.category, purpose: best.purpose } : null
}

export async function applyLearnedClassification<T extends { name?: string; category?: string; purpose?: string }>(
  userId: string,
  item: T
): Promise<T> {
  if (!item.name) return item
  const learned = await getLearnedClassification(userId, item.name)
  if (!learned) return item
  return { ...item, category: learned.category, purpose: learned.purpose ?? item.purpose }
}
