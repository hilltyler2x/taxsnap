"use client"
// GPS mileage tracking. Two ways to use it:
//  - Start trip / End trip: the user taps Start, drives, taps End and adds the purpose.
//  - Automatic trips (opt-in, phone app only): the app notices when you start driving and
//    when you park, then saves the drive to a review list for the user to mark business or
//    delete as personal. It needs "Always" location so it keeps working with the phone locked.
// Inside the app the native background-geolocation plugin keeps updates coming while the
// screen is off. In a browser, Start/End trip uses the web Geolocation API and only measures
// while the page stays open.
import { isNativeApp, nativePlatform } from "@/lib/native"

export type Fix = { lat: number; lng: number; time: number; accuracy: number; speed: number | null }

export type ActiveTrip = {
  mode: "manual" | "auto"
  startedAt: number
  start: { lat: number; lng: number }
  last: Fix
  lastMovingAt: number
  meters: number
}

export type FinishedTrip = {
  miles: number
  startedAt: string
  endedAt: string
  startLat: number
  startLng: number
  endLat: number
  endLng: number
}

export type TrackerState = {
  active: ActiveTrip | null
  starting: boolean // Start was tapped, waiting for the first GPS fix
  autoEnabled: boolean
  watching: boolean
  error: string | null
}

const ACTIVE_KEY = "taxsnap_active_trip"
const AUTO_KEY = "taxsnap_auto_trips"
const ASKED_KEY = "taxsnap_location_asked"
const OUTBOX_KEY = "taxsnap_trip_outbox"

const METERS_PER_MILE = 1609.344
const MAX_ACCURACY_M = 65          // ignore fuzzy fixes (wifi/cell guesses)
const DRIVING_SPEED_MS = 4.5       // about 10 mph
const MOVING_SPEED_MS = 1.5
const PARKED_AFTER_MS = 5 * 60_000 // no movement this long ends an automatic trip
const MIN_AUTO_MILES = 0.5         // shorter automatic drives are dropped

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v) } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function tripMiles(t: ActiveTrip) {
  return Math.round((t.meters / METERS_PER_MILE) * 10) / 10
}

// Trip date as a local calendar day, stored like every other date (UTC midnight of that day).
export function localDay(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export async function placeName(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`)
    if (!res.ok) return null
    return (await res.json()).label ?? null
  } catch { return null }
}

class TripTracker {
  private state: TrackerState = { active: null, starting: false, autoEnabled: false, watching: false, error: null }
  private listeners = new Set<(s: TrackerState) => void>()
  private watcherId: string | number | null = null
  private prevFix: Fix | null = null
  private drivingFixes = 0
  private timer: any = null
  private allowed = false
  private onAutoSaved: (() => void) | null = null

  // Called once the dashboard knows the user's plan. Automatic trips only run for users
  // who can log mileage.
  init(opts: { allowed: boolean; onAutoSaved?: () => void }) {
    this.allowed = opts.allowed
    this.onAutoSaved = opts.onAutoSaved ?? null
    this.state.active = read<ActiveTrip | null>(ACTIVE_KEY, null)
    this.state.autoEnabled = isNativeApp() && read<string>(AUTO_KEY, "off") === "on"
    this.emit()
    if (!this.timer && typeof window !== "undefined") {
      this.timer = setInterval(() => this.checkParked(Date.now()), 60_000)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") { this.checkParked(Date.now()); this.flushOutbox() }
      })
    }
    this.flushOutbox()
    this.syncWatcher()
  }

  subscribe(fn: (s: TrackerState) => void) {
    this.listeners.add(fn)
    fn(this.state)
    return () => { this.listeners.delete(fn) }
  }

  private emit() {
    const snapshot = { ...this.state, starting: this.pendingStart }
    this.listeners.forEach(fn => fn(snapshot))
  }

  // ─── Settings ───
  hasAsked() { return read<boolean>(ASKED_KEY, false) }
  markAsked() { write(ASKED_KEY, true) }

  async setAutoEnabled(on: boolean) {
    write(AUTO_KEY, on ? "on" : "off")
    this.state.autoEnabled = on && isNativeApp()
    this.state.error = null
    if (on) await requestNotificationPermission()
    // An automatic trip in progress ends when the feature is switched off.
    if (!on && this.state.active?.mode === "auto") await this.finishAuto()
    this.emit()
    await this.syncWatcher()
  }

  // ─── Start / End trip ───
  async startTrip() {
    if (this.state.active?.mode === "manual") return
    // A drive automatic tracking already picked up becomes the manual trip, keeping its miles.
    if (this.state.active?.mode === "auto") {
      this.state.active = { ...this.state.active, mode: "manual" }
    } else {
      this.pendingStart = true
    }
    this.state.error = null
    this.persist()
    await this.syncWatcher()
    // The watcher was already running (automatic trips on), so start from its last fix.
    if (this.pendingStart && this.prevFix && Date.now() - this.prevFix.time < 60_000) this.onFix(this.prevFix)
  }

  // Returns the measured trip so the UI can ask for purpose and destination.
  async endTrip(): Promise<FinishedTrip | null> {
    const t = this.state.active
    this.pendingStart = false
    this.state.active = null
    this.persist()
    await this.syncWatcher()
    if (!t || t.mode !== "manual") return null
    return finished(t, t.last.time)
  }

  cancelTrip() {
    this.pendingStart = false
    this.state.active = null
    this.persist()
    this.syncWatcher()
  }

  private pendingStart = false

  private persist() {
    write(ACTIVE_KEY, this.state.active)
    this.emit()
  }

  // ─── Location updates ───
  private wantsWatcher() {
    return this.pendingStart || this.state.active != null || (this.allowed && this.state.autoEnabled)
  }

  private async syncWatcher() {
    const want = this.wantsWatcher()
    if (want && this.watcherId == null) await this.startWatcher()
    else if (!want && this.watcherId != null) await this.stopWatcher()
  }

  private async startWatcher() {
    this.watcherId = "starting"
    try {
      if (isNativeApp()) {
        const { registerPlugin } = await import("@capacitor/core")
        const BG = registerPlugin<any>("BackgroundGeolocation")
        this.watcherId = await BG.addWatcher(
          {
            backgroundTitle: "TaxSnap is logging your trip",
            backgroundMessage: "Measuring business miles. Turn off automatic trips in TaxSnap settings.",
            requestPermissions: true,
            stale: false,
            distanceFilter: 25,
          },
          (loc: any, err: any) => {
            if (err) return this.onError(err.code === "NOT_AUTHORIZED" ? "denied" : err.message)
            if (loc) this.onFix({ lat: loc.latitude, lng: loc.longitude, time: loc.time ?? Date.now(), accuracy: loc.accuracy, speed: loc.speed })
          }
        )
      } else if (typeof navigator !== "undefined" && navigator.geolocation) {
        this.watcherId = navigator.geolocation.watchPosition(
          p => this.onFix({ lat: p.coords.latitude, lng: p.coords.longitude, time: p.timestamp, accuracy: p.coords.accuracy, speed: p.coords.speed }),
          e => this.onError(e.code === e.PERMISSION_DENIED ? "denied" : e.message),
          { enableHighAccuracy: true, maximumAge: 5000 }
        )
      } else {
        this.watcherId = null
        return this.onError("This browser can't share your location")
      }
      this.state.watching = true
      this.emit()
    } catch (err: any) {
      this.watcherId = null
      this.onError(err?.message ?? "Couldn't start location")
    }
  }

  private async stopWatcher() {
    const id = this.watcherId
    this.watcherId = null
    this.prevFix = null
    this.drivingFixes = 0
    this.state.watching = false
    this.emit()
    try {
      if (isNativeApp()) {
        const { registerPlugin } = await import("@capacitor/core")
        await registerPlugin<any>("BackgroundGeolocation").removeWatcher({ id })
      } else if (typeof id === "number") {
        navigator.geolocation.clearWatch(id)
      }
    } catch {}
  }

  private onError(message: string) {
    this.state.error = message === "denied" ? "Location access is off for TaxSnap" : message
    this.pendingStart = false
    this.emit()
  }

  async openSettings() {
    if (!isNativeApp()) return
    const { registerPlugin } = await import("@capacitor/core")
    await registerPlugin<any>("BackgroundGeolocation").openSettings().catch(() => {})
  }

  private onFix(fix: Fix) {
    if (fix.accuracy > MAX_ACCURACY_M) return
    this.state.error = null
    const prev = this.prevFix
    this.prevFix = fix

    if (this.pendingStart) {
      this.pendingStart = false
      this.state.active = { mode: "manual", startedAt: fix.time, start: { lat: fix.lat, lng: fix.lng }, last: fix, lastMovingAt: fix.time, meters: 0 }
      return this.persist()
    }

    const t = this.state.active
    if (t) {
      // Parked long enough that this fix is the start of a different drive.
      if (t.mode === "auto" && fix.time - t.lastMovingAt > PARKED_AFTER_MS) {
        this.finishAuto()
        return
      }
      const d = distanceMeters(t.last, fix)
      // Skip GPS jitter: only count a move bigger than the fix's own uncertainty.
      if (d < Math.max(20, fix.accuracy)) return
      const speed = fix.speed != null && fix.speed >= 0 ? fix.speed : d / Math.max(1, (fix.time - t.last.time) / 1000)
      t.meters += d
      t.last = fix
      if (speed >= MOVING_SPEED_MS || d > 75) t.lastMovingAt = fix.time
      return this.persist()
    }

    if (!this.allowed || !this.state.autoEnabled || !prev) return
    const gapS = Math.max(1, (fix.time - prev.time) / 1000)
    const speed = fix.speed != null && fix.speed >= 0 ? fix.speed : distanceMeters(prev, fix) / gapS
    this.drivingFixes = speed >= DRIVING_SPEED_MS ? this.drivingFixes + 1 : 0
    // Two driving-speed fixes in a row: a drive has started, measured from the fix before.
    if (this.drivingFixes >= 2) {
      this.drivingFixes = 0
      this.state.active = { mode: "auto", startedAt: prev.time, start: { lat: prev.lat, lng: prev.lng }, last: fix, lastMovingAt: fix.time, meters: distanceMeters(prev, fix) }
      this.persist()
    }
  }

  private checkParked(now: number) {
    const t = this.state.active
    if (t?.mode === "auto" && now - t.lastMovingAt > PARKED_AFTER_MS) this.finishAuto()
  }

  // Saves an automatic drive to the review list. If the phone is offline it waits in an
  // outbox and is sent next time the app opens.
  private async finishAuto() {
    const t = this.state.active
    if (!t || t.mode !== "auto") return
    this.state.active = null
    this.persist()
    if (tripMiles(t) < MIN_AUTO_MILES) return
    const f = finished(t, t.lastMovingAt)
    const [from, to] = await Promise.all([placeName(f.startLat, f.startLng), placeName(f.endLat, f.endLng)])
    const body = {
      purpose: "",
      destination: to ?? "",
      startPlace: from,
      miles: f.miles,
      date: localDay(t.startedAt),
      source: "auto",
      needsReview: true,
      startLat: f.startLat, startLng: f.startLng, endLat: f.endLat, endLng: f.endLng,
      startedAt: f.startedAt, endedAt: f.endedAt,
    }
    write(OUTBOX_KEY, [...read<any[]>(OUTBOX_KEY, []), body])
    await this.flushOutbox()
  }

  private flushing = false
  private async flushOutbox() {
    if (this.flushing || !this.allowed) return
    const queue = read<any[]>(OUTBOX_KEY, [])
    if (!queue.length) return
    this.flushing = true
    const left: any[] = []
    for (const body of queue) {
      try {
        const res = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        // 4xx won't succeed on retry (e.g. plan changed), so drop it; keep network/server errors.
        if (!res.ok && res.status >= 500) left.push(body)
      } catch { left.push(body) }
    }
    write(OUTBOX_KEY, left.length ? left : null)
    this.flushing = false
    if (left.length < queue.length) this.onAutoSaved?.()
  }
}

function finished(t: ActiveTrip, endTime: number): FinishedTrip {
  return {
    miles: tripMiles(t),
    startedAt: new Date(t.startedAt).toISOString(),
    endedAt: new Date(endTime).toISOString(),
    startLat: t.start.lat, startLng: t.start.lng,
    endLat: t.last.lat, endLng: t.last.lng,
  }
}

// Android 13+ hides the "logging your trip" notification without this, and the user
// should always be able to see when TaxSnap is using location in the background.
async function requestNotificationPermission() {
  if (nativePlatform() !== "android") return
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications")
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== "granted") await LocalNotifications.requestPermissions()
  } catch {}
}

export const tripTracker = new TripTracker()
