import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

// AI search and answer engines we explicitly welcome on public pages. A crawler that matches a
// named group ignores the "*" group, so each group repeats the same disallow list.
const AI_AND_SEARCH_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Googlebot", "Bingbot", "Applebot", "Applebot-Extended", "DuckDuckBot",
]
const PRIVATE = ["/dashboard", "/api/", "/login"]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_AND_SEARCH_BOTS, allow: "/", disallow: PRIVATE },
      { userAgent: "*", allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
