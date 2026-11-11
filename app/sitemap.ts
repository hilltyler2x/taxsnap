import type { MetadataRoute } from "next"
import { GUIDES } from "@/lib/guides"
import { SITE_URL } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  const latest = GUIDES.map(g => g.updated).sort().at(-1)
  return [
    { url: `${SITE_URL}/landing`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/explore`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/guides`, lastModified: latest, changeFrequency: "weekly", priority: 0.8 },
    ...GUIDES.map(g => ({
      url: `${SITE_URL}/guides/${g.slug}`,
      lastModified: g.updated,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ]
}
