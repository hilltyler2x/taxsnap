"use client"
// App Store / Google Play review prompts. We ask through the native in-app review sheet
// right after something good happens (a receipt saved, a trip logged, an export), and
// only once someone has used the app on a few different days. Never on launch.
//
// Store rules shape this: Apple only allows its own review sheet (no custom "Rate us?"
// popups), Google forbids asking "Do you like the app?" first, and both decide on their
// own whether the sheet actually shows (iOS: at most 3 times a year). So we call it at
// every good moment that passes the checks below and let the OS do the final throttling.
import { Capacitor } from "@capacitor/core"
import { isNativeApp, nativePlatform } from "@/lib/native"

const KEY = "taxsnap_review"
const DAY = 24 * 60 * 60 * 1000

const MIN_ACTIVE_DAYS = 3        // distinct days the app was opened
const MIN_DAYS_SINCE_FIRST = 2   // and at least this long since the first open
const MIN_WINS = 3               // good moments before the first ask
const MIN_SESSION_MS = 30_000    // never in the first 30 seconds after opening
const COOLDOWN_MS = 14 * DAY     // between asks; the OS throttles further on its own
const ASK_DELAY_MS = 1500        // let the success toast and haptic land first

// Apple ID of the app from App Store Connect, needed to open the "Write a Review" page on iPhone.
const IOS_APP_ID = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID ?? ""

type State = { firstSeen: number; lastDay: string; activeDays: number; wins: number; lastAsked: number; asks: number }

const sessionStart = Date.now()
let askedThisSession = false

function load(): State {
  const blank = { firstSeen: Date.now(), lastDay: "", activeDays: 0, wins: 0, lastAsked: 0, asks: 0 }
  try { return { ...blank, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } } catch { return blank }
}

function save(s: State) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

function localDay() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// Older app builds don't have the review plugin; the site they load must not break.
export function reviewAvailable() {
  return isNativeApp() && Capacitor.isPluginAvailable("AppReview")
}

// Call once when the dashboard opens.
export function noteAppOpen() {
  if (!reviewAvailable()) return
  const s = load()
  const today = localDay()
  if (s.lastDay !== today) { s.lastDay = today; s.activeDays++ }
  save(s)
}

// Call right after a success. `wins` is how much it counts toward earning the first ask:
// a big moment like an export counts more; just viewing the deductions total counts 0
// but can still be the moment we ask.
export function reviewMoment(wins = 1) {
  if (!reviewAvailable()) return
  const s = load()
  s.wins += wins
  save(s)

  const now = Date.now()
  if (askedThisSession) return
  if (now - sessionStart < MIN_SESSION_MS) return
  if (s.activeDays < MIN_ACTIVE_DAYS || now - s.firstSeen < MIN_DAYS_SINCE_FIRST * DAY) return
  if (s.wins < MIN_WINS) return
  if (now - s.lastAsked < COOLDOWN_MS) return

  askedThisSession = true
  s.lastAsked = now
  s.asks++
  save(s)
  setTimeout(async () => {
    const { AppReview } = await import("@capawesome/capacitor-app-review")
    AppReview.requestReview().catch(() => {})
  }, ASK_DELAY_MS)
}

// "Rate TaxSnap" in Account: opens the store page. On iPhone without the App Store ID
// set yet, fall back to the in-app sheet.
export async function openStoreReview() {
  const { AppReview } = await import("@capawesome/capacitor-app-review")
  if (nativePlatform() === "ios" && !IOS_APP_ID) return AppReview.requestReview()
  return AppReview.openAppStore(nativePlatform() === "ios" ? { appId: IOS_APP_ID } : undefined)
}
