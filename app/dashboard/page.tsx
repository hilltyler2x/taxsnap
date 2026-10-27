"use client"
import { useUser, useClerk } from "@clerk/nextjs"
import { useEffect, useState, useRef } from "react"
import toast from "react-hot-toast"
import { calcDeductible, IRS_MILEAGE_RATE, mileageRateFor, CATEGORIES, BUSINESS_PURPOSES } from "@/lib/irs"
import { usePlatform, takeReceiptPhoto, hapticSuccess, saveOrShareFile, openInSystemBrowser, openSignedLink } from "@/lib/native"
import { noteAppOpen, reviewMoment, reviewAvailable, openStoreReview } from "@/lib/review"
import { tripTracker, tripMiles, localDay, placeName, type TrackerState } from "@/lib/tripTracker"

const CC: Record<string, string> = {
  Travel: "#1D9E75", Meals: "#BA7517", Office: "#185FA5",
  Software: "#534AB7", Home: "#3B6D11", Medical: "#A32D2D", Business: "#0F766E", Other: "#888780",
}

// Stored dates are UTC-midnight timestamps for a calendar day (e.g. "2026-07-15T00:00:00.000Z").
// toLocaleDateString() converts to the browser's local timezone first, which shifts the displayed
// day backward for anyone west of UTC — force UTC so the calendar date shown matches what was saved.
function formatDateUTC(dateStr: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(dateStr).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })
}

// The mirror-image bug: computing "today" via toISOString() converts the current moment to UTC
// first, which rolls over to tomorrow's date once local time crosses UTC midnight (e.g. 8pm ET).
function todayLocalISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}


const DEMO_YEAR = new Date().getFullYear()
const DEMO_RECEIPTS = [
  { name: "Delta Airlines", amount: 487.50, date: `${DEMO_YEAR}-06-10`, category: "Travel", place: "Atlanta, GA", purpose: "Business travel — conference or training", notes: "" },
  { name: "Nobu Restaurant", amount: 143.20, date: `${DEMO_YEAR}-06-12`, category: "Meals", place: "New York, NY", purpose: "Business meal — client or prospect", notes: "" },
  { name: "Microsoft 365", amount: 99.99, date: `${DEMO_YEAR}-06-01`, category: "Software", place: "Online", purpose: "Software or subscription for business use", notes: "" },
  { name: "FedEx Shipping", amount: 28.40, date: `${DEMO_YEAR}-06-08`, category: "Office", place: "Decatur, GA", purpose: "Shipping and postage", notes: "" },
]

type Tab = "home" | "receipts" | "miles" | "taxes" | "account"
type ScanState = "idle" | "processing" | "confirm"

// API errors are usually a plain string, but a validation failure can come
// back as a Zod flatten() object — never hand a raw object to toast/alert.
function errMsg(err: any, fallback: string): string {
  if (typeof err?.error === "string") return err.error
  const fieldErrors = err?.error?.fieldErrors
  if (fieldErrors) {
    const first = Object.values(fieldErrors).flat().find((v: any) => typeof v === "string")
    if (first) return first as string
  }
  return fallback
}

// Trip form -> API body. Miles come from either odometer readings or a typed-in number.
function tripBody(f: any) {
  const base = { purpose: f.purpose, destination: f.destination, date: f.date, startPlace: f.startPlace || null }
  if (f.useOdo) return { ...base, odoStart: parseInt(f.odoStart), odoEnd: parseInt(f.odoEnd), miles: null, source: "odometer" }
  const source = f.source && f.source !== "odometer" ? f.source : "manual"
  return { ...base, miles: parseFloat(f.miles), odoStart: null, odoEnd: null, source }
}

function formMiles(f: any): number {
  if (f.useOdo) {
    const m = parseInt(f.odoEnd) - parseInt(f.odoStart)
    return isNaN(m) ? 0 : m
  }
  const m = parseFloat(f.miles)
  return isNaN(m) ? 0 : Math.round(m * 10) / 10
}

export default function Dashboard() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser()
  const { signOut } = useClerk()
  const [me, setMe] = useState<{ plan: string; isOwner: boolean } | null>(null)
  const [tab, setTab] = useState<Tab>("home")
  const [receipts, setReceipts] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [toReview, setToReview] = useState<any[]>([])
  const [tracker, setTracker] = useState<TrackerState | null>(null)
  const [showLocationAsk, setShowLocationAsk] = useState(false)
  const [emails, setEmails] = useState<any[]>([])
  const [emailConnected, setEmailConnected] = useState<string[]>([])
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [scanState, setScanState] = useState<ScanState>("idle")
  const [scanNote, setScanNote] = useState("")
  const [scanData, setScanData] = useState<any>(null)
  const [scanForm, setScanForm] = useState<any>(null)
  const [editingReceipt, setEditingReceipt] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const [editingTrip, setEditingTrip] = useState<any>(null)
  const [editTripForm, setEditTripForm] = useState<any>(null)
  const [emailDraft, setEmailDraft] = useState<any>(null)
  const [emailDraftForm, setEmailDraftForm] = useState<any>(null)
  const [importPreview, setImportPreview] = useState<any[] | null>(null)
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [sheetFiles, setSheetFiles] = useState<{ id: string; name: string }[] | null>(null)
  const [sheetTabs, setSheetTabs] = useState<{ file: { id: string; name: string }; tabs: string[] } | null>(null)
  const [destSuggestions, setDestSuggestions] = useState<any[]>([])
  const [destTimer, setDestTimer] = useState<any>(null)
  const [importedEmails, setImportedEmails] = useState<Set<string>>(new Set())
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [demoIdx, setDemoIdx] = useState(0)
  const [attCount, setAttCount] = useState(2)
  const [aiStatusMsg, setAiStatusMsg] = useState("Reading your receipt...")
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const platform = usePlatform()
  const isNative = platform !== "web"
  // The iPhone app can't sell or point to Stripe plans (App Store rule 3.1.1), so it
  // shows no prices or upgrade buttons. Pro bought on the website still applies.
  const isIOS = platform === "ios"

  const plan = me?.plan ?? "FREE"
  const isPro = plan !== "FREE"

  useEffect(() => { if (isNative) noteAppOpen() }, [isNative])

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchMe()
      fetchReceipts()
      fetchTrips()
    }
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("email_connected")
    const error = params.get("email_error")
    const tabParam = params.get("tab")
    if (tabParam === "account") setTab("account")
    if (connected) {
      toast.success(`${connected === "google" ? "Gmail" : "Outlook"} connected!`)
      fetchEmails()
    }
    if (error) toast.error("Could not connect email account. Try again.")
    if (connected || error || tabParam) window.history.replaceState({}, "", "/dashboard")
  }, [])

  useEffect(() => {
    if (tab === "account" && isPro) fetchEmails()
  }, [tab, isPro])

  // GPS trips. Every phone-app user who can log mileage is asked once about automatic
  // trips ("Always" location); the answer can be changed any time in Account settings.
  useEffect(() => tripTracker.subscribe(setTracker), [])
  useEffect(() => {
    if (!me) return
    tripTracker.init({ allowed: isPro, onAutoSaved: fetchTrips })
    if (isNative && isPro && !tripTracker.hasAsked()) setShowLocationAsk(true)
  }, [me, isPro, isNative])

  const answerLocationAsk = async (on: boolean) => {
    tripTracker.markAsked()
    setShowLocationAsk(false)
    await tripTracker.setAutoEnabled(on)
    if (on) toast.success("Automatic trips are on. Pick \"Always\" when your phone asks.")
  }

  const fetchMe = async () => {
    const res = await fetch("/api/me")
    if (res.ok) setMe(await res.json())
  }

  const fetchReceipts = async () => {
    const res = await fetch("/api/receipts")
    if (res.ok) setReceipts((await res.json()).receipts)
  }

  const fetchTrips = async () => {
    const res = await fetch("/api/trips")
    if (res.ok) {
      const data = await res.json()
      setTrips(data.trips)
      setToReview(data.toReview ?? [])
    }
  }

  const disconnectEmail = async (provider: string) => {
    const res = await fetch(`/api/email/disconnect/${provider}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Disconnected")
      setEmailConnected(prev => prev.filter(p => p !== provider))
      setEmails(prev => prev.filter((e: any) => provider === "google" ? !e.gmailId : !e.outlookId))
    } else {
      toast.error("Failed to disconnect")
    }
  }

  const fetchEmails = async () => {
    setEmailsLoading(true)
    try {
      const res = await fetch("/api/email")
      if (res.ok) {
        const data = await res.json()
        setEmails(data.emails ?? [])
        setEmailConnected(data.connected ?? [])
      } else {
        const err = await res.json().catch(() => null)
        toast.error(errMsg(err, res.status === 504 ? "Checking your inbox took too long — try again" : "Couldn't check your inbox"))
      }
    } catch {
      toast.error("Couldn't check your inbox — check your connection and try again")
    } finally {
      setEmailsLoading(false)
    }
  }

  // ─── REAL UPLOAD — sends image to Claude AI via API ───
  const handleRealUpload = async (file: File) => {
    setScanState("processing")
    setScanNote("")
    setScanData(null)

    const msgs = [
      "Reading your receipt...",
      "Detecting merchant and amount...",
      "Identifying location...",
      "Categorizing for taxes...",
    ]
    let mi = 0
    const iv = setInterval(() => {
      if (mi < msgs.length) { setAiStatusMsg(msgs[mi]); mi++ }
    }, 700)

    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/receipts/scan", { method: "POST", body: fd })
      clearInterval(iv)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(errMsg(err, "Could not read receipt — try a clearer photo"))
        setScanState("idle")
        return
      }

      const { extracted } = await res.json()
      setScanForm({ ...extracted })
      setScanNote("AI read your receipt — review and confirm")
      setScanState("confirm")
    } catch {
      clearInterval(iv)
      toast.error("Something went wrong. Try again.")
      setScanState("idle")
    }
  }

  const pickPhoto = async (source: "camera" | "photos") => {
    if (!isNative) {
      (source === "camera" ? cameraRef : galleryRef).current?.click()
      return
    }
    try {
      const file = await takeReceiptPhoto(source)
      if (file) handleRealUpload(file)
    } catch {
      toast.error(source === "camera" ? "Couldn't open the camera — check TaxSnap's camera access in Settings" : "Couldn't open your photos — check TaxSnap's photo access in Settings")
    }
  }

  // ─── DEMO SCAN — only fake data, no file needed ───
  const runDemoScan = () => {
    const d = DEMO_RECEIPTS[demoIdx % DEMO_RECEIPTS.length]
    setDemoIdx(i => i + 1)
    setScanState("processing")
    setScanNote("")

    const msgs = ["Running demo scan...", "Simulating AI read...", "Filling demo data..."]
    let mi = 0
    const iv = setInterval(() => {
      if (mi < msgs.length) { setAiStatusMsg(msgs[mi]); mi++ }
      else {
        clearInterval(iv)
        setScanForm({ ...d })
        setScanNote("Demo scan — this is sample data, not a real receipt")
        setScanState("confirm")
      }
    }, 600)
  }

  const saveReceipt = async () => {
    if (!scanForm) return
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanForm),
    })
    if (res.ok) {
      toast.success("Receipt saved!")
      hapticSuccess()
      reviewMoment()
      setScanState("idle")
      setScanForm(null)
      fetchReceipts()
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Failed to save"))
      if (res.status === 403) setTab("account")
    }
  }

  const openEditReceipt = (r: any) => {
    setEditingReceipt(r)
    setEditForm({ ...r, date: new Date(r.date).toISOString().split("T")[0] })
  }

  const saveReceiptEdit = async () => {
    if (!editForm || !editingReceipt) return
    const res = await fetch(`/api/receipts/${editingReceipt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      toast.success("Receipt updated!")
      setEditingReceipt(null)
      setEditForm(null)
      fetchReceipts()
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Failed to update"))
    }
  }

  const deleteReceiptEdit = async () => {
    if (!editingReceipt) return
    const res = await fetch(`/api/receipts/${editingReceipt.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Receipt deleted")
      setEditingReceipt(null)
      setEditForm(null)
      fetchReceipts()
    } else {
      toast.error("Failed to delete")
    }
  }

  const saveTrip = async (data: any) => {
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) { toast.success("Trip logged!"); fetchTrips(); reviewMoment(); return true }
    const e = await res.json(); toast.error(errMsg(e, "Failed")); return false
  }

  const openEditTrip = (t: any) => {
    setEditingTrip(t)
    setEditTripForm({
      ...t,
      date: new Date(t.date).toISOString().split("T")[0],
      useOdo: t.odoStart != null && t.odoEnd != null,
      odoStart: t.odoStart != null ? String(t.odoStart) : "",
      odoEnd: t.odoEnd != null ? String(t.odoEnd) : "",
      miles: String(t.miles),
    })
  }

  const startTrip = async () => {
    await tripTracker.startTrip()
    hapticSuccess()
  }

  // End trip: open the save form with the measured miles and where you ended up.
  const endTrip = async () => {
    const done = await tripTracker.endTrip()
    if (!done) return
    if (done.miles < 0.1) { toast("That trip was under 0.1 miles, so it wasn't saved."); return }
    hapticSuccess()
    const form = {
      purpose: "", destination: "", startPlace: "", date: localDay(new Date(done.startedAt).getTime()),
      useOdo: false, odoStart: "", odoEnd: "", miles: String(done.miles), source: "gps", gps: done,
    }
    setEditingTrip({ id: null, source: "gps" })
    setEditTripForm(form)
    const [from, to] = await Promise.all([placeName(done.startLat, done.startLng), placeName(done.endLat, done.endLng)])
    setEditTripForm((f: any) => f && f.gps === done ? { ...f, startPlace: f.startPlace || from || "", destination: f.destination || to || "" } : f)
  }

  const saveTripEdit = async () => {
    if (!editTripForm || !editingTrip) return
    const body = tripBody(editTripForm)
    if (!editingTrip.id) {
      if (await saveTrip({ ...body, ...editTripForm.gps, miles: body.miles })) { setEditingTrip(null); setEditTripForm(null) }
      return
    }
    const res = await fetch(`/api/trips/${editingTrip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      toast.success(editingTrip.needsReview ? "Saved as a business trip!" : "Trip updated!")
      if (editingTrip.needsReview) reviewMoment()
      setEditingTrip(null)
      setEditTripForm(null)
      fetchTrips()
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Failed to update"))
    }
  }

  // A trip that just ended isn't saved yet, so don't lose its miles to a stray tap.
  const closeTripModal = () => {
    if (editingTrip && !editingTrip.id && !confirm("Discard this trip? Its miles won't be saved.")) return
    setEditingTrip(null)
    setEditTripForm(null)
  }

  const deleteTripEdit = async () => {
    if (!editingTrip) return
    if (!editingTrip.id) { closeTripModal(); return }
    const res = await fetch(`/api/trips/${editingTrip.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Trip deleted")
      setEditingTrip(null)
      setEditTripForm(null)
      fetchTrips()
    } else {
      toast.error("Failed to delete")
    }
  }

  const startEmailImport = (email: any) => {
    setEmailDraft(email)
    setEmailDraftForm({
      name: email.from,
      amount: email.amount || undefined,
      date: email.date ? new Date(email.date).toISOString().split("T")[0] : todayLocalISO(),
      category: email.category,
      purpose: email.purpose,
      place: "",
      notes: email.notes ?? email.subject,
      auditFlag: email.auditFlag,
      auditNote: email.auditNote,
    })
  }

  const confirmEmailImport = async () => {
    if (!emailDraft || !emailDraftForm) return
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...emailDraftForm, source: "email" }),
    })
    if (res.ok) {
      const id = emailDraft.gmailId ?? emailDraft.outlookId
      setImportedEmails(prev => new Set(Array.from(prev).concat(id)))
      toast.success("Imported!")
      reviewMoment()
      setEmailDraft(null)
      setEmailDraftForm(null)
      fetchReceipts()
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Failed to import"))
    }
  }

  const handleCsvImport = async (file: File) => {
    setImporting(true)
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/receipts/import", { method: "POST", body: fd })
    setImporting(false)
    if (res.ok) {
      const { items } = await res.json()
      if (!items.length) { toast.error("Couldn't find any expenses in that file"); return }
      setImportPreview(items)
      setImportSelected(new Set(items.map((_: any, i: number) => i)))
      const flagged = items.filter((i: any) => i.auditFlag).length
      if (flagged) toast(`${flagged} item${flagged === 1 ? "" : "s"} flagged for weak audit protection — review before importing`, { icon: "⚠️", duration: 5000 })
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Import failed"))
      if (res.status === 403) setTab("account")
    }
  }

  const handleSheetImport = async (url: string) => {
    setImporting(true)
    const res = await fetch("/api/receipts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetUrl: url }),
    })
    setImporting(false)
    if (res.ok) {
      const { items } = await res.json()
      if (!items.length) { toast.error("Couldn't find any expenses in that sheet"); return }
      setImportPreview(items)
      setImportSelected(new Set(items.map((_: any, i: number) => i)))
      const flagged = items.filter((i: any) => i.auditFlag).length
      if (flagged) toast(`${flagged} item${flagged === 1 ? "" : "s"} flagged for weak audit protection — review before importing`, { icon: "⚠️", duration: 5000 })
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Import failed"))
      if (res.status === 403) setTab("account")
    }
  }

  const browseSheets = async () => {
    setImporting(true)
    const res = await fetch("/api/sheets/list")
    setImporting(false)
    if (res.ok) {
      const { files } = await res.json()
      if (!files.length) { toast.error("No spreadsheets found in your Google Drive"); return }
      setSheetFiles(files)
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Could not list your Google Sheets"))
      if (res.status === 403) setTab("account")
    }
  }

  const pickSheetFile = async (file: { id: string; name: string }) => {
    setImporting(true)
    const res = await fetch(`/api/sheets/tabs?id=${encodeURIComponent(file.id)}`)
    setImporting(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(errMsg(err, "Could not read that spreadsheet"))
      return
    }
    const { tabs } = await res.json()
    if (tabs.length <= 1) {
      setSheetFiles(null)
      importFromSheet(file.id, tabs[0] ?? "Sheet1")
    } else {
      setSheetFiles(null)
      setSheetTabs({ file, tabs })
    }
  }

  const importFromSheet = async (spreadsheetId: string, sheetName: string) => {
    setImporting(true)
    const res = await fetch("/api/sheets/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId, sheetName }),
    })
    setImporting(false)
    setSheetTabs(null)
    if (res.ok) {
      const { items } = await res.json()
      if (!items.length) { toast.error("Couldn't find any expenses in that tab"); return }
      setImportPreview(items)
      setImportSelected(new Set(items.map((_: any, i: number) => i)))
      const flagged = items.filter((i: any) => i.auditFlag).length
      if (flagged) toast(`${flagged} item${flagged === 1 ? "" : "s"} flagged for weak audit protection — review before importing`, { icon: "⚠️", duration: 5000 })
    } else {
      const err = await res.json()
      toast.error(errMsg(err, "Import failed"))
    }
  }

  const confirmImport = async () => {
    if (!importPreview) return
    let count = 0
    let dupes = 0
    for (const i of Array.from(importSelected)) {
      const item = importPreview[i]
      if (!item) continue
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, source: "import" }),
      })
      if (res.ok) count++
      else if (res.status === 409) dupes++
    }
    const dupeSuffix = dupes ? `, skipped ${dupes} duplicate${dupes === 1 ? "" : "s"} already on file` : ""
    toast.success(`Imported ${count} receipt${count === 1 ? "" : "s"}${dupeSuffix}`)
    if (count) reviewMoment(2)
    setImportPreview(null)
    setImportSelected(new Set())
    fetchReceipts()
  }

  const startCheckout = async (priceId: string) => {
    const res = await fetch("/api/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    })
    if (!res.ok) return
    const { url } = await res.json()
    // In the Android app, pay in the system browser and refresh the plan when it closes.
    if (isNative) openInSystemBrowser(url, fetchMe)
    else window.location.href = url
  }

  const deleteAccount = async () => {
    if (!confirm("Delete your TaxSnap account? This permanently deletes all your receipts, trips and photos, disconnects your email, and cancels any subscription. This can't be undone.")) return
    const res = await fetch("/api/me", { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      toast.error(errMsg(err, "Couldn't delete your account. Try again."))
      return
    }
    toast.success("Your account was deleted")
    await signOut({ redirectUrl: "/landing" }).catch(() => { window.location.href = "/landing" })
  }

  const onDestInput = (val: string) => {
    clearTimeout(destTimer)
    if (!val || val.trim().length < 3) { setDestSuggestions([]); return }
    setDestTimer(setTimeout(async () => {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(val)}`)
      if (res.ok) {
        const { results } = await res.json()
        setDestSuggestions(results)
      }
    }, 350))
  }

  const totalDed = receipts.reduce((s, r) => s + (r.deductible ?? 0), 0) +
    trips.reduce((s, t) => s + t.deductible, 0)

  if (!isLoaded) {
    return <div className="h-dvh bg-gray-50 flex items-center justify-center text-sm text-gray-400">Loading...</div>
  }

  const displayUser = {
    image: clerkUser?.imageUrl,
    name: clerkUser?.fullName,
    email: clerkUser?.primaryEmailAddress?.emailAddress,
  }

  return (
    // Screen-sized shell: top bar and bottom nav stay put, only the middle scrolls.
    <div className="flex flex-col h-dvh max-w-lg mx-auto bg-gray-50 overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 pt-safe flex-shrink-0 z-10">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-emerald-500 rounded-md flex items-center justify-center text-white text-xs">📄</div>
          <span className="font-medium text-sm">TaxSnap</span>
        </div>
        <span className="text-sm font-medium text-gray-600">{{ home: "Home", receipts: "Receipts", miles: "Mileage", taxes: "Taxes", account: "Account" }[tab]}</span>
        <button onClick={() => setTab("account")} className={`text-xs px-2 py-1 rounded-full font-medium ${
          plan === "OWNER" ? "bg-red-50 text-red-700" :
          plan === "LIFETIME" ? "bg-amber-50 text-amber-700" :
          plan !== "FREE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
        }`}>
          {plan === "OWNER" ? "Owner" : plan === "LIFETIME" ? "Lifetime" : plan.charAt(0) + plan.slice(1).toLowerCase()}
        </button>
      </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-4 px-3 pt-3">

        {/* HOME */}
        {tab === "home" && (
          <div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-gray-100 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Receipts</p>
                <p className="text-xl font-medium">{receipts.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">stored this year</p>
              </div>
              <div className="bg-gray-100 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Est. tax savings</p>
                <p className="text-xl font-medium">${Math.round(totalDed * 0.22).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">at 22% bracket</p>
              </div>
            </div>

            {/* Receipt limit bar for free users */}
            {plan === "FREE" && (
              <div className="bg-gray-100 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Receipts this month</span>
                  <span className="font-medium">{receipts.length} / 10</span>
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${receipts.length >= 10 ? "bg-red-500" : receipts.length >= 7 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(receipts.length / 10 * 100, 100)}%` }} />
                </div>
              </div>
            )}

            {/* SCAN ZONE */}
            {scanState === "idle" && (
              <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-5 text-center mb-3">
                <p className="text-2xl mb-2">📷</p>
                <p className="font-medium text-sm mb-1">Scan a receipt</p>
                <p className="text-xs text-gray-500 mb-4">Take a photo or upload from your gallery — AI fills in all details automatically</p>

                {/* Real upload buttons */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => pickPhoto("photos")}
                    className="bg-emerald-500 text-white rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1.5"
                  >
                    🖼 Photo library
                  </button>
                  <button
                    onClick={() => pickPhoto("camera")}
                    className="bg-emerald-500 text-white rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1.5"
                  >
                    📷 Take photo
                  </button>
                </div>

                {/* Demo scan — clearly separate and secondary */}
                <button
                  onClick={runDemoScan}
                  className="w-full py-2 border border-gray-200 rounded-xl text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                >
                  ✦ Demo scan (no real photo needed)
                </button>

                <input ref={galleryRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleRealUpload(e.target.files[0])} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => e.target.files?.[0] && handleRealUpload(e.target.files[0])} />
              </div>
            )}

            {scanState === "processing" && (
              <div className="bg-emerald-50 rounded-xl p-4 mb-3 flex items-center gap-3">
                <div className="animate-pulse text-emerald-500 text-lg">✦</div>
                <p className="text-sm text-emerald-800">{aiStatusMsg}</p>
              </div>
            )}

            {scanState === "confirm" && scanForm && (
              <ScanConfirmForm
                form={scanForm}
                note={scanNote}
                onChange={setScanForm}
                onSave={saveReceipt}
                onDiscard={() => { setScanState("idle"); setScanForm(null) }}
              />
            )}

            <p className="text-sm font-medium mb-2">Quick add</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setTab("miles")} className="bg-white border border-gray-100 rounded-xl p-3 text-center hover:bg-gray-50">
                <p className="text-lg mb-1">🚗</p>
                <p className="text-xs font-medium">Log a trip</p>
                <p className="text-xs text-gray-400">Track mileage</p>
              </button>
              <button onClick={() => { setTab("account"); setTimeout(() => document.getElementById("email-section")?.scrollIntoView({ behavior: "smooth" }), 300) }}
                className="bg-white border border-gray-100 rounded-xl p-3 text-center hover:bg-gray-50">
                <p className="text-lg mb-1">✉️</p>
                <p className="text-xs font-medium">Email import</p>
                <p className="text-xs text-gray-400">Pull from inbox</p>
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Recent receipts</p>
              <button onClick={() => setTab("receipts")} className="text-xs text-gray-400">View all</button>
            </div>
            <div className="space-y-2">
              {receipts.slice(0, 3).map(r => <ReceiptCard key={r.id} r={r} onClick={() => openEditReceipt(r)} />)}
              {!receipts.length && <p className="text-xs text-gray-400 text-center py-6">No receipts yet — scan one above</p>}
            </div>
          </div>
        )}

        {/* RECEIPTS */}
        {tab === "receipts" && (
          <div className="space-y-2">
            {receipts.map(r => <ReceiptCard key={r.id} r={r} onClick={() => openEditReceipt(r)} />)}
            {!receipts.length && <p className="text-xs text-gray-400 text-center py-10">No receipts yet</p>}
          </div>
        )}

        {/* MILES */}
        {tab === "miles" && (
          !isPro
            ? <LockScreen icon="🚗" title="Mileage tracking is Pro" sub={isIOS ? "Log IRS-compliant trips with destination and odometer readings with TaxSnap Pro." : "Log IRS-compliant trips with destination and odometer readings. Upgrade to Pro for $5/month."} onUpgrade={isIOS ? undefined : () => setTab("account")} />
            : <MilesTab trips={trips} toReview={toReview} tracker={tracker} onStartTrip={startTrip} onEndTrip={endTrip} onCancelTrip={() => tripTracker.cancelTrip()} onOpenLocationSettings={() => tripTracker.openSettings()} isNative={isNative} onSave={saveTrip} onDestInput={onDestInput} suggestions={destSuggestions} onSelectDest={() => setDestSuggestions([])} onEditTrip={openEditTrip} />
        )}

        {/* TAXES */}
        {tab === "taxes" && (
          <TaxesTab receipts={receipts} trips={trips} isPro={isPro} isIOS={isIOS} onUpgrade={isIOS ? undefined : () => setTab("account")} />
        )}

        {/* ACCOUNT */}
        {tab === "account" && (
          <AccountTab
            session={{ user: displayUser }}
            onSignOut={() => signOut({ redirectUrl: "/landing" })}
            plan={plan}
            isPro={isPro}
            billingCycle={billingCycle}
            onToggleBilling={() => setBillingCycle(c => c === "monthly" ? "annual" : "monthly")}
            emails={emails}
            emailConnected={emailConnected}
            emailsLoading={emailsLoading}
            importedEmails={importedEmails}
            onFetchEmails={fetchEmails}
            onImportEmail={startEmailImport}
            onDisconnectEmail={disconnectEmail}
            onCheckout={startCheckout}
            onCsvFile={handleCsvImport}
            onSheetUrl={handleSheetImport}
            importing={importing}
            onBrowseSheets={browseSheets}
            sheetFiles={sheetFiles}
            onPickSheetFile={pickSheetFile}
            onCloseSheetFiles={() => setSheetFiles(null)}
            sheetTabs={sheetTabs}
            onPickSheetTab={(tab: string) => sheetTabs && importFromSheet(sheetTabs.file.id, tab)}
            onCloseSheetTabs={() => setSheetTabs(null)}
            isNative={isNative}
            isIOS={isIOS}
            onDeleteAccount={deleteAccount}
            tracker={tracker}
            onToggleAutoTrips={(on: boolean) => { tripTracker.markAsked(); tripTracker.setAutoEnabled(on) }}
            onOpenLocationSettings={() => tripTracker.openSettings()}
          />
        )}
      </div>

      {/* Ask about automatic trips (phone app, once per phone) */}
      {showLocationAsk && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center p-3 modal-safe">
          <div className="w-full max-w-lg bg-white rounded-2xl p-5">
            <p className="text-3xl mb-2">🚗</p>
            <p className="font-medium mb-2">Log business miles automatically?</p>
            <p className="text-sm text-gray-600 leading-relaxed mb-2">
              Every business mile is worth ${mileageRateFor(new Date().getFullYear())} off your taxes. TaxSnap can notice when you drive and save each drive for you to review. You mark it business, like a meetup or an inventory run, or delete it as personal.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              {isIOS
                ? <>To keep logging while your phone is locked, choose <b>Allow While Using App</b> and then <b>Change to Always Allow</b> when your iPhone asks.</>
                : <>To keep logging while your phone is in your pocket, allow location, and TaxSnap will show a notification while it tracks.</>}
              {" "}Your location is only used to measure trips, never sold or shared. You can turn this off any time in Account, Trip tracking.
            </p>
            <button onClick={() => answerLocationAsk(true)} className="w-full bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium mb-2">Turn on automatic trips</button>
            <button onClick={() => answerLocationAsk(false)} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Not now, I'll use Start trip</button>
          </div>
        </div>
      )}

      {/* Edit receipt modal */}
      {editingReceipt && editForm && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center p-3 modal-safe" onClick={() => { setEditingReceipt(null); setEditForm(null) }}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <ScanConfirmForm
              form={editForm}
              note="Edit receipt details"
              onChange={setEditForm}
              onSave={saveReceiptEdit}
              onDiscard={() => { setEditingReceipt(null); setEditForm(null) }}
              onDelete={deleteReceiptEdit}
              saveLabel="✓ Save changes"
            />
          </div>
        </div>
      )}

      {/* Edit trip modal */}
      {editingTrip && editTripForm && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center p-3 modal-safe" onClick={closeTripModal}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <TripEditForm
              title={editingTrip.needsReview ? "Was this a business drive?" : editingTrip.id ? "Edit trip" : "Save your trip"}
              deleteLabel={editingTrip.needsReview ? "Personal drive, delete it" : editingTrip.id ? "Delete trip" : "Discard trip"}
              saveLabel={editingTrip.needsReview ? "✓ Business trip, save it" : editingTrip.id ? "✓ Save changes" : "✓ Save trip"}
              form={editTripForm}
              onChange={setEditTripForm}
              onSave={saveTripEdit}
              onDiscard={closeTripModal}
              onDelete={deleteTripEdit}
              onDestInput={onDestInput}
              suggestions={destSuggestions}
              onSelectDest={() => setDestSuggestions([])}
            />
          </div>
        </div>
      )}

      {/* Email import review modal */}
      {emailDraft && emailDraftForm && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center p-3 modal-safe" onClick={() => { setEmailDraft(null); setEmailDraftForm(null) }}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <ScanConfirmForm
              form={emailDraftForm}
              note="Found in inbox — review and confirm"
              onChange={setEmailDraftForm}
              onSave={confirmEmailImport}
              onDiscard={() => { setEmailDraft(null); setEmailDraftForm(null) }}
              saveLabel="✓ Import"
            />
          </div>
        </div>
      )}

      {/* Import preview modal */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center p-3 modal-safe" onClick={() => { setImportPreview(null); setImportSelected(new Set()) }}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-2xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">Review import — {importSelected.size} of {importPreview.length} selected</p>
            </div>
            {importPreview.some(i => i.auditFlag) && (
              <p className="text-xs text-amber-600 mb-2">⚠ Items marked below may not hold up in an IRS audit as recorded — see the tip on each.</p>
            )}
            <div className="space-y-2 mb-3">
              {importPreview.map((item, i) => {
                const checked = importSelected.has(i)
                return (
                  <div key={i} className={`border rounded-xl p-3 ${item.auditFlag ? "border-amber-200 bg-amber-50/50" : "border-gray-100"}`}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => {
                        setImportSelected(prev => {
                          const next = new Set(prev)
                          if (checked) next.delete(i); else next.add(i)
                          return next
                        })
                      }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.name || "(no name)"}{item.auditFlag && " ⚠"}</p>
                        <p className="text-xs text-gray-400">{item.date} · {item.category} · {item.purpose}</p>
                      </div>
                      <p className="text-sm font-medium flex-shrink-0">${(item.amount ?? 0).toFixed(2)}</p>
                    </label>
                    {item.auditFlag && item.auditNote && (
                      <p className="text-xs text-amber-700 mt-2 pl-7">{item.auditNote}</p>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setImportPreview(null); setImportSelected(new Set()) }} className="flex-1 py-2 rounded-xl border border-gray-200 text-xs text-gray-500">Cancel</button>
              <button onClick={confirmImport} disabled={!importSelected.size} className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-medium disabled:opacity-50">Import {importSelected.size} receipt{importSelected.size === 1 ? "" : "s"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className="flex-shrink-0 bg-white border-t border-gray-100 flex pb-safe z-10">
        {(["home", "receipts", "miles", "taxes", "account"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 flex flex-col items-center py-2 gap-0.5 border-none bg-transparent cursor-pointer ${tab === t ? "text-emerald-500" : "text-gray-400"}`}>
            <span className="text-xl">{{ home: "⌂", receipts: "🧾", miles: "🚗", taxes: "📊", account: "👤" }[t]}</span>
            <span className="text-xs capitalize font-medium">{t}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function ReceiptCard({ r, onClick }: { r: any; onClick?: () => void }) {
  const col = CC[r.category] ?? "#888"
  const d = formatDateUTC(r.date, { month: "short", day: "numeric" })
  const icon: Record<string, string> = { Travel: "✈", Meals: "🍽", Office: "📦", Software: "💻", Home: "🏠", Medical: "⚕", Business: "💼", Other: "📎" }
  return (
    <div onClick={onClick} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-gray-300 transition-colors">
      {r.imageUrl ? (
        <img src={r.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: col + "22", color: col }}>
          {icon[r.category] ?? "📎"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{r.name}{r.auditFlag && <span className="text-amber-500"> ⚠</span>}</p>
        <p className="text-xs text-gray-400 truncate">{d}{r.purpose ? " · " + r.purpose : ""}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-medium">${r.amount?.toFixed(2)}</p>
        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: col + "22", color: col }}>{r.category}</span>
      </div>
    </div>
  )
}

function ScanConfirmForm({ form, note, onChange, onSave, onDiscard, onDelete, saveLabel }: any) {
  const ded = calcDeductible(form.amount ?? 0, form.category ?? "Other", form.homePct)
  return (
    <div className="mb-3">
      {note && (
        <div className="bg-emerald-50 rounded-lg px-3 py-2 mb-2 flex items-center gap-2">
          <span className="text-emerald-500 text-sm">✦</span>
          <p className="text-xs text-emerald-800">{note}</p>
        </div>
      )}
      <div className="bg-white border-2 border-emerald-400 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-emerald-700">✦ Edit &amp; confirm</p>
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">IRS fields</span>
        </div>
        {form.imageUrl && (
          <img src={form.imageUrl} alt="Receipt" className="w-full max-h-48 object-contain rounded-lg border border-gray-100 mb-3 bg-gray-50" />
        )}
        {form.auditFlag && form.auditNote && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
            <span className="text-amber-500 text-sm">⚠</span>
            <p className="text-xs text-amber-700">{form.auditNote}</p>
          </div>
        )}
        {[
          { key: "name", label: "Merchant *" },
          { key: "amount", label: "Amount *", type: "number" },
          { key: "date", label: "Date *", type: "date" },
          { key: "place", label: "Place *" },
        ].map(f => (
          <div key={f.key} className="flex justify-between items-center py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">{f.label}</span>
            <input
              type={f.type ?? "text"}
              value={form[f.key] ?? ""}
              onChange={e => onChange({ ...form, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value })}
              className="text-xs font-medium text-right bg-transparent border-none outline-none w-44 focus:bg-gray-50 rounded px-1"
            />
          </div>
        ))}
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="text-xs text-gray-500">Category *</span>
          <select value={form.category ?? "Other"} onChange={e => onChange({ ...form, category: e.target.value })}
            className="text-xs font-medium bg-transparent border-none outline-none cursor-pointer">
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="text-xs text-gray-500">Business purpose *</span>
          <select
            value={(BUSINESS_PURPOSES as readonly string[]).includes(form.purpose) ? form.purpose : "__custom__"}
            onChange={e => onChange({ ...form, purpose: e.target.value === "__custom__" ? form.purpose : e.target.value })}
            className="text-xs font-medium text-right bg-transparent border-none outline-none cursor-pointer w-44"
          >
            {!(BUSINESS_PURPOSES as readonly string[]).includes(form.purpose) && form.purpose && (
              <option value="__custom__">{form.purpose}</option>
            )}
            {BUSINESS_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {form.category === "Meals" && (
          <div className="bg-amber-50 rounded-lg p-3 my-2">
            <p className="text-xs font-medium text-amber-700 mb-2">👥 Attendees (IRS required for meals)</p>
            <input placeholder="Name" className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1" value={form.attendee1Name ?? ""} onChange={e => onChange({ ...form, attendee1Name: e.target.value })} />
            <input placeholder="Relationship (e.g. Client, Acme Co.)" className="w-full text-xs border border-gray-200 rounded px-2 py-1" value={form.attendee1Rel ?? ""} onChange={e => onChange({ ...form, attendee1Rel: e.target.value })} />
          </div>
        )}
        {form.category === "Home" && (
          <div className="bg-green-50 rounded-lg p-3 my-2">
            <p className="text-xs font-medium text-green-700 mb-2">🏠 Home office sq ft (IRS required)</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-gray-500">Office sq ft</label><input type="number" className="w-full text-xs border border-gray-200 rounded px-2 py-1" value={form.officeSqft ?? ""} onChange={e => onChange({ ...form, officeSqft: parseFloat(e.target.value) })} /></div>
              <div><label className="text-xs text-gray-500">Total home sq ft</label><input type="number" className="w-full text-xs border border-gray-200 rounded px-2 py-1" value={form.homeSqft ?? ""} onChange={e => onChange({ ...form, homeSqft: parseFloat(e.target.value), homePct: form.officeSqft ? Math.round(form.officeSqft / parseFloat(e.target.value) * 100) : 0 })} /></div>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center pt-2">
          <span className="text-xs text-gray-500">Deductible</span>
          <span className="text-xs font-medium text-emerald-600">${ded.toFixed(2)}</span>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={onDiscard} className="flex-1 py-2 rounded-xl border border-gray-200 text-xs text-gray-500">Discard</button>
          <button onClick={onSave} className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-medium">{saveLabel ?? "✓ Save & sync"}</button>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="w-full mt-2 py-2 rounded-xl border border-red-200 text-xs text-red-600">Delete receipt</button>
        )}
        <p className="text-xs text-gray-400 text-center mt-2">* Required by IRS for audit protection</p>
      </div>
    </div>
  )
}

function LockScreen({ icon, title, sub, onUpgrade }: any) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center mt-4">
      <p className="text-3xl mb-3">{icon}</p>
      <p className="font-medium mb-2">{title}</p>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">{sub}</p>
      {onUpgrade && <button onClick={onUpgrade} className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium">See plans</button>}
    </div>
  )
}

// Miles for a trip: typed in, or odometer start and end. Shared by the new-trip and edit forms.
function MilesFields({ form, onChange }: any) {
  const miles = formMiles(form)
  const rate = mileageRateFor(parseInt(form.date) || new Date().getFullYear())
  return (
    <div className="space-y-2">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
        {[{ odo: false, label: "Miles" }, { odo: true, label: "Odometer" }].map(o => (
          <button key={o.label} type="button" onClick={() => onChange({ ...form, useOdo: o.odo })}
            className={`flex-1 py-1.5 rounded-md ${!!form.useOdo === o.odo ? "bg-white font-medium shadow-sm" : "text-gray-500"}`}>{o.label}</button>
        ))}
      </div>
      {form.useOdo ? (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-500 block mb-1">Odo start *</label><input type="number" inputMode="numeric" value={form.odoStart} onChange={(e: any) => onChange({ ...form, odoStart: e.target.value })} placeholder="42100" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
          <div><label className="text-xs text-gray-500 block mb-1">Odo end *</label><input type="number" inputMode="numeric" value={form.odoEnd} onChange={(e: any) => onChange({ ...form, odoEnd: e.target.value })} placeholder="42134" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
        </div>
      ) : (
        <div><label className="text-xs text-gray-500 block mb-1">Miles driven *</label><input type="number" inputMode="decimal" step="0.1" min="0" value={form.miles} onChange={(e: any) => onChange({ ...form, miles: e.target.value })} placeholder="e.g. 12.5 (round trip)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
      )}
      {miles > 0 && <p className="text-xs text-blue-600 font-medium">{miles} miles · ${(miles * rate).toFixed(2)} deductible at ${rate}/mi</p>}
    </div>
  )
}

function DestinationField({ value, onValue, onDestInput, suggestions, onSelectDest }: any) {
  return (
    <div className="relative">
      <label className="text-xs text-gray-500 block mb-1">Destination *</label>
      <input value={value} onChange={(e: any) => { onValue(e.target.value); onDestInput(e.target.value) }}
        placeholder="Start typing an address..." className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" autoComplete="off" />
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl overflow-hidden z-10 shadow-sm">
          {suggestions.map((s: any, i: number) => (
            <button key={i} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 block"
              onMouseDown={() => { onValue(s.label); onSelectDest() }}>
              <p className="text-xs font-medium">📍 {s.label}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function elapsed(fromMs: number) {
  const mins = Math.max(0, Math.floor((Date.now() - fromMs) / 60000))
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`
}

function TripTrackerCard({ tracker, onStartTrip, onEndTrip, onCancelTrip, onOpenLocationSettings, isNative }: any) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t) }, [])
  const active = tracker?.active
  const manual = active?.mode === "manual"
  return (
    <div className={`rounded-2xl p-4 mb-3 border ${manual ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"}`}>
      {manual ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-emerald-700 font-medium">● Trip in progress</p>
              <p className="text-2xl font-medium text-emerald-900">{tripMiles(active).toFixed(1)} mi</p>
              <p className="text-xs text-emerald-700">{elapsed(active.startedAt)} · ${(tripMiles(active) * IRS_MILEAGE_RATE).toFixed(2)} so far</p>
            </div>
            <span className="text-3xl">🚗</span>
          </div>
          <button onClick={onEndTrip} className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-medium">End trip</button>
          <button onClick={() => { if (confirm("Cancel this trip without saving it?")) onCancelTrip() }} className="w-full mt-2 text-xs text-gray-500">Cancel trip</button>
          {!isNative && <p className="text-xs text-gray-500 mt-2">Keep this page open while you drive. The TaxSnap phone app can track with the screen off.</p>}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Track a trip with GPS</p>
              <p className="text-xs text-gray-500">Tap Start when you leave and End when you arrive.</p>
            </div>
            <span className="text-2xl">📍</span>
          </div>
          <button onClick={onStartTrip} disabled={tracker?.starting} className="w-full bg-emerald-500 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-60">
            {tracker?.starting ? "Finding your location..." : "Start trip"}
          </button>
          {active?.mode === "auto" && <p className="text-xs text-blue-600 mt-2">Automatic trips noticed you driving ({tripMiles(active).toFixed(1)} mi so far). Tap Start to keep this drive as a trip now.</p>}
          {tracker?.autoEnabled && !active && <p className="text-xs text-gray-400 mt-2">Automatic trips are on. Drives show up below for you to review.</p>}
        </>
      )}
      {tracker?.error && (
        <p className="text-xs text-red-600 mt-2">
          {tracker.error}.{isNative && <> <button onClick={onOpenLocationSettings} className="underline">Open settings</button></>}
        </p>
      )}
    </div>
  )
}

const BLANK_TRIP = () => ({ purpose: "", destination: "", startPlace: "", useOdo: false, odoStart: "", odoEnd: "", miles: "", date: todayLocalISO() })

function MilesTab({ trips, toReview, tracker, onStartTrip, onEndTrip, onCancelTrip, onOpenLocationSettings, isNative, onSave, onDestInput, suggestions, onSelectDest, onEditTrip }: any) {
  const [form, setForm] = useState<any>(BLANK_TRIP)
  const miles = formMiles(form)
  const totalMiles = Math.round(trips.reduce((s: number, t: any) => s + t.miles, 0) * 10) / 10
  const totalDed = trips.reduce((s: number, t: any) => s + (t.deductible ?? 0), 0)

  const add = async () => {
    if (!form.purpose) { toast.error("Pick a business purpose"); return }
    if (!form.destination) { toast.error("Add a destination"); return }
    if (miles <= 0) { toast.error(form.useOdo ? "Odometer end must be greater than start" : "Enter the miles you drove"); return }
    if (await onSave(tripBody(form))) setForm({ ...BLANK_TRIP(), useOdo: form.useOdo })
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-50 rounded-xl p-3"><p className="text-xs text-blue-600 mb-1">Total miles</p><p className="text-xl font-medium text-blue-900">{totalMiles}</p><p className="text-xs text-blue-500">{new Date().getFullYear()} YTD</p></div>
        <div className="bg-blue-50 rounded-xl p-3"><p className="text-xs text-blue-600 mb-1">IRS deduction</p><p className="text-xl font-medium text-blue-900">${Math.round(totalDed)}</p><p className="text-xs text-blue-500">at ${IRS_MILEAGE_RATE}/mile</p></div>
      </div>

      <TripTrackerCard tracker={tracker} onStartTrip={onStartTrip} onEndTrip={onEndTrip} onCancelTrip={onCancelTrip} onOpenLocationSettings={onOpenLocationSettings} isNative={isNative} />

      {toReview.length > 0 && (
        <div className="mb-3">
          <p className="text-sm font-medium mb-1">Drives to review</p>
          <p className="text-xs text-gray-500 mb-2">Tap a drive to add its business purpose, or delete it if it was personal. Only business trips count toward your deduction.</p>
          <div className="space-y-2">
            {toReview.map((t: any) => (
              <div key={t.id} onClick={() => onEditTrip(t)} className="bg-amber-50 border border-amber-200 rounded-xl p-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-sm flex-shrink-0">❓</div>
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{t.destination || "Drive"}</p><p className="text-xs text-gray-500">{formatDateUTC(t.date, { month: "short", day: "numeric" })}{t.startedAt ? ` · ${new Date(t.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</p></div>
                  <p className="text-sm font-medium text-amber-700">{t.miles} mi</p>
                </div>
                {t.startPlace && <p className="text-xs text-gray-500 mt-1.5 pl-9 truncate">From {t.startPlace}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 space-y-3">
        <p className="text-sm font-medium">Enter a trip by hand</p>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Business purpose *</label>
          <select value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="" disabled>Select a reason...</option>
            {BUSINESS_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <DestinationField value={form.destination} onValue={(v: string) => setForm((f: any) => ({ ...f, destination: v }))} onDestInput={onDestInput} suggestions={suggestions} onSelectDest={onSelectDest} />
        <MilesFields form={form} onChange={setForm} />
        <div><label className="text-xs text-gray-500 block mb-1">Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
        <button onClick={add} className="w-full bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium">+ Add to log</button>
      </div>

      <p className="text-sm font-medium mb-2">Trip log</p>
      <div className="space-y-2">
        {trips.map((t: any) => (
          <div key={t.id} onClick={() => onEditTrip(t)} className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-gray-300 transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-sm flex-shrink-0">{t.source === "gps" || t.source === "auto" ? "📍" : "🚗"}</div>
              <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{t.purpose}</p><p className="text-xs text-gray-400">{formatDateUTC(t.date, { month: "short", day: "numeric" })}</p></div>
              <div className="text-right"><p className="text-sm font-medium text-blue-600">{t.miles} mi</p><p className="text-xs text-emerald-600">${t.deductible?.toFixed(2)}</p></div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 pl-9 truncate">
              📍 {t.startPlace ? `${t.startPlace} → ` : ""}{t.destination}
              {t.odoStart != null && t.odoEnd != null ? ` · 🔢 ${t.odoStart.toLocaleString()} → ${t.odoEnd.toLocaleString()}` : t.source === "gps" || t.source === "auto" ? " · GPS" : ""}
            </p>
          </div>
        ))}
        {!trips.length && <p className="text-xs text-gray-400 text-center py-4">No trips logged yet</p>}
      </div>
    </div>
  )
}

function TripEditForm({ title, saveLabel, deleteLabel, form, onChange, onSave, onDiscard, onDelete, onDestInput, suggestions, onSelectDest }: any) {
  return (
    <div className="bg-white border-2 border-emerald-400 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-emerald-700">✦ {title}</p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Business purpose *</label>
          <select value={form.purpose} onChange={(e: any) => onChange({ ...form, purpose: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="" disabled>Select a reason...</option>
            {BUSINESS_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {(form.startPlace || form.source === "gps" || form.source === "auto") && (
          <div><label className="text-xs text-gray-500 block mb-1">Starting point</label><input value={form.startPlace ?? ""} onChange={(e: any) => onChange({ ...form, startPlace: e.target.value })} placeholder="Where the trip started" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
        )}
        <DestinationField value={form.destination} onValue={(v: string) => onChange({ ...form, destination: v })} onDestInput={onDestInput} suggestions={suggestions} onSelectDest={onSelectDest} />
        <MilesFields form={form} onChange={onChange} />
        <div><label className="text-xs text-gray-500 block mb-1">Date *</label><input type="date" value={form.date} onChange={(e: any) => onChange({ ...form, date: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onDiscard} className="flex-1 py-2 rounded-xl border border-gray-200 text-xs text-gray-500">Discard</button>
        <button onClick={onSave} className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-medium">{saveLabel}</button>
      </div>
      <button onClick={onDelete} className="w-full mt-2 py-2 rounded-xl border border-red-200 text-xs text-red-600">{deleteLabel}</button>
    </div>
  )
}

function TaxesTab({ receipts, trips, isPro, isIOS, onUpgrade }: any) {
  const bycat: Record<string, number> = {}
  receipts.forEach((r: any) => { bycat[r.category] = (bycat[r.category] ?? 0) + (r.deductible ?? 0) })
  const milesDed = trips.reduce((s: number, t: any) => s + (t.deductible ?? 0), 0)
  if (milesDed > 0) bycat["Mileage"] = (bycat["Mileage"] ?? 0) + milesDed
  const total = Object.values(bycat).reduce((s, v) => s + v, 0)
  const max = Math.max(...Object.values(bycat), 1)

  // Seeing a real deductions total is a good moment to ask for a review.
  const bigTotal = total >= 250
  useEffect(() => {
    if (!bigTotal) return
    const t = setTimeout(() => reviewMoment(0), 2500)
    return () => clearTimeout(t)
  }, [bigTotal])

  const handleExport = async () => {
    const res = await fetch("/api/export?format=csv")
    if (!res.ok) { const e = await res.json(); alert(errMsg(e, "Export failed")); return }
    await saveOrShareFile(`taxsnap_irs_${new Date().getFullYear()}.csv`, await res.blob())
    reviewMoment(3)
  }

  const handleExportPdf = async () => {
    const { default: jsPDF } = await import("jspdf")
    await import("jspdf-autotable")
    const doc = new jsPDF() as any
    const year = new Date().getFullYear()

    doc.setFontSize(18)
    doc.text("TaxSnap — Expense Summary", 14, 20)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, 26)

    doc.setFontSize(12)
    doc.setTextColor(0)
    doc.text(`Total deductible: $${total.toFixed(2)}`, 14, 36)
    doc.text(`Estimated tax savings (22% bracket): $${(total * 0.22).toFixed(2)}`, 14, 42)

    doc.autoTable({
      startY: 50,
      head: [["Category", "Amount"]],
      body: Object.entries(bycat).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cat, amt]) => [cat, `$${(amt as number).toFixed(2)}`]),
      theme: "striped",
      headStyles: { fillColor: [16, 122, 87] },
    })

    let y = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.text("Receipts", 14, y)
    doc.autoTable({
      startY: y + 4,
      head: [["Date", "Merchant", "Category", "Purpose", "Amount", "Deductible", "Audit"]],
      body: receipts.map((r: any) => [
        formatDateUTC(r.date),
        r.name,
        r.category,
        r.purpose ?? "",
        `$${r.amount.toFixed(2)}`,
        `$${(r.deductible ?? 0).toFixed(2)}`,
        r.auditFlag ? "⚠" : "",
      ]),
      theme: "striped",
      headStyles: { fillColor: [16, 122, 87] },
      styles: { fontSize: 8 },
    })

    const flagged = receipts.filter((r: any) => r.auditFlag && r.auditNote)
    if (flagged.length) {
      y = doc.lastAutoTable.finalY + 10
      doc.setFontSize(12)
      doc.setTextColor(180, 100, 0)
      doc.text("Audit risk — review before filing", 14, y)
      doc.setTextColor(0)
      doc.autoTable({
        startY: y + 4,
        head: [["Merchant", "Note"]],
        body: flagged.map((r: any) => [r.name, r.auditNote]),
        theme: "striped",
        headStyles: { fillColor: [180, 100, 0] },
        styles: { fontSize: 8 },
      })
    }

    if (trips.length) {
      y = doc.lastAutoTable.finalY + 10
      doc.setFontSize(12)
      doc.text("Mileage", 14, y)
      doc.autoTable({
        startY: y + 4,
        head: [["Date", "Destination", "Purpose", "Miles", "Deductible"]],
        body: trips.map((t: any) => [
          formatDateUTC(t.date),
          t.destination,
          t.purpose,
          t.miles,
          `$${(t.deductible ?? 0).toFixed(2)}`,
        ]),
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 },
      })
    }

    await saveOrShareFile(`taxsnap_summary_${year}.pdf`, doc.output("blob"))
    reviewMoment(3)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-100 rounded-xl p-3"><p className="text-xs text-gray-500 mb-1">Total deductible</p><p className="text-xl font-medium">${Math.round(total).toLocaleString()}</p></div>
        <div className="bg-gray-100 rounded-xl p-3"><p className="text-xs text-gray-500 mb-1">Est. savings</p><p className="text-xl font-medium">${Math.round(total * 0.22).toLocaleString()}</p><p className="text-xs text-gray-400">22% bracket</p></div>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between"><p className="text-sm font-medium">Breakdown</p><p className="text-xs text-gray-400">{new Date().getFullYear()}</p></div>
        {Object.entries(bycat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
          <div key={cat} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CC[cat] ?? "#888" }} />
            <p className="text-xs flex-1">{cat}</p>
            <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round((amt as number) / max * 100)}%`, background: CC[cat] ?? "#888" }} /></div>
            <p className="text-xs font-medium w-16 text-right">${(amt as number).toFixed(0)}</p>
          </div>
        ))}
        {!Object.keys(bycat).length && <p className="text-xs text-gray-400 text-center py-6">Add receipts to see your breakdown</p>}
      </div>
      {isPro ? (
        <div className="space-y-2">
          <button onClick={handleExport} className="w-full bg-emerald-500 text-white py-3 rounded-xl text-sm font-medium">📊 Download IRS-ready CSV</button>
          <button onClick={handleExportPdf} className="w-full border border-gray-200 py-3 rounded-xl text-sm font-medium text-gray-700">📄 Export PDF summary</button>
        </div>
      ) : <LockScreen icon="📊" title="Export is Pro" sub={isIOS ? "Download IRS-ready CSV and PDF for your accountant with TaxSnap Pro." : "Download IRS-ready CSV and PDF for your accountant. Upgrade for $5/month."} onUpgrade={onUpgrade} />}
    </div>
  )
}

function AccountTab({ session, plan, isPro, billingCycle, onToggleBilling, emails, emailConnected, emailsLoading, importedEmails, onFetchEmails, onImportEmail, onDisconnectEmail, onCheckout, onSignOut, onCsvFile, onSheetUrl, importing, onBrowseSheets, sheetFiles, onPickSheetFile, onCloseSheetFiles, sheetTabs, onPickSheetTab, onCloseSheetTabs, isNative, isIOS, onDeleteAccount, tracker, onToggleAutoTrips, onOpenLocationSettings }: any) {
  const [sheetUrlInput, setSheetUrlInput] = useState("")
  const [canRate, setCanRate] = useState(false)
  useEffect(() => { setCanRate(reviewAvailable()) }, [])
  const csvRef = useRef<HTMLInputElement>(null)
  const proOnly = (feature: string) => alert(isIOS ? `${feature} is a Pro feature.` : `${feature} requires Pro. Upgrade in Account.`)
  // Google and Microsoft block their sign-in pages inside the app, so connect in the system browser.
  const connectEmail = (e: any, provider: string, feature: string) => {
    if (!isPro) { e.preventDefault(); proOnly(feature); return }
    if (isNative) {
      e.preventDefault()
      openSignedLink(`/api/email/connect/${provider}`).catch(() => alert("Couldn't open the sign-in page. Try again."))
    }
  }
  const PRICES: Record<string, any> = {
    proMonthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY ?? "",
    proAnnual: process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL ?? "",
    bizMonthly: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY ?? "",
    bizAnnual: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL ?? "",
    lifetime: process.env.NEXT_PUBLIC_STRIPE_LIFETIME ?? "",
  }

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {session?.user?.image ? <img src={session.user.image} className="w-8 h-8 rounded-full" alt="" /> : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">👤</div>}
            <div><p className="text-sm font-medium">{session?.user?.name ?? "User"}</p><p className="text-xs text-gray-400">{session?.user?.email}</p></div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${plan === "OWNER" ? "bg-red-50 text-red-700" : plan !== "FREE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{plan.charAt(0) + plan.slice(1).toLowerCase()}</span>
        </div>
        <div className="px-4 py-3 text-xs text-gray-500">
          {plan === "OWNER" ? "Owner access — all features, no charge" : plan === "LIFETIME" ? "Lifetime — all features forever, no future charges" : plan === "FREE" ? "Free — 10 receipts/month" : plan + " — unlimited receipts"}
        </div>
        <button onClick={onSignOut} className="w-full text-left px-4 py-3 text-xs text-red-600 border-t border-gray-100 hover:bg-red-50 transition-colors">
          Sign out
        </button>
        <button onClick={onDeleteAccount} className="w-full text-left px-4 py-3 text-xs text-gray-400 border-t border-gray-100 hover:text-red-600 hover:bg-red-50 transition-colors">
          Delete account
        </button>
      </div>

      {canRate && (
        <button onClick={() => openStoreReview().catch(() => alert("Couldn't open the store. Try again."))} className="w-full bg-white border border-gray-100 rounded-2xl p-4 mb-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
          <span className="text-lg">⭐</span>
          <div className="flex-1">
            <p className="text-sm font-medium">Rate TaxSnap</p>
            <p className="text-xs text-gray-500">A quick review helps other drivers and freelancers find it.</p>
          </div>
          <span className="text-gray-300">›</span>
        </button>
      )}

      {isNative && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Trip tracking</p>
              <p className="text-xs text-gray-500">Automatic trips: log drives in the background for you to review.</p>
            </div>
            <button
              role="switch"
              aria-checked={!!tracker?.autoEnabled}
              aria-label="Automatic trips"
              onClick={() => isPro ? onToggleAutoTrips(!tracker?.autoEnabled) : proOnly("Mileage tracking")}
              className={`w-11 h-6 rounded-full relative transition-colors border-none cursor-pointer flex-shrink-0 ${tracker?.autoEnabled ? "bg-emerald-500" : "bg-gray-200"}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${tracker?.autoEnabled ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
            {isIOS ? "Needs location set to Always so it works with your phone locked." : "Needs location access. A notification shows while TaxSnap is tracking."}
            {" "}Off means TaxSnap only uses location while you run a trip with Start trip.
            {" "}<button onClick={onOpenLocationSettings} className="underline">Location settings</button>
          </p>
          {tracker?.error && <p className="text-xs text-red-600 mt-1">{tracker.error}.</p>}
        </div>
      )}

      {plan === "OWNER" && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 mb-3">
          <span className="text-lg">🛡</span>
          <p className="text-sm text-red-800">Owner access active — all features unlocked, no charge.</p>
        </div>
      )}

      {plan === "FREE" && !isIOS && (
        <div className="mb-3">
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className={`text-xs cursor-pointer ${billingCycle === "monthly" ? "font-medium" : "text-gray-400"}`} onClick={onToggleBilling}>Monthly</span>
            <button onClick={onToggleBilling} className={`w-9 h-5 rounded-full relative transition-colors border-none cursor-pointer ${billingCycle === "annual" ? "bg-emerald-500" : "bg-gray-200"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${billingCycle === "annual" ? "left-4" : "left-0.5"}`} />
            </button>
            <span className={`text-xs cursor-pointer ${billingCycle === "annual" ? "font-medium" : "text-gray-400"}`} onClick={onToggleBilling}>Annual</span>
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Save 40%</span>
          </div>
          {[
            { name: "Pro", price: billingCycle === "annual" ? "$3" : "$5", period: billingCycle === "annual" ? "/mo · billed annually" : "/month", priceId: billingCycle === "annual" ? PRICES.proAnnual : PRICES.proMonthly, color: "bg-emerald-500", popular: true, features: ["Unlimited receipts", "Mileage tracking + odometer", "CSV / PDF export", "Cloud sync & email import"] },
            { name: "Business", price: billingCycle === "annual" ? "$10" : "$15", period: billingCycle === "annual" ? "/mo · billed annually" : "/month", priceId: billingCycle === "annual" ? PRICES.bizAnnual : PRICES.bizMonthly, color: "bg-purple-600", features: ["Everything in Pro", "Up to 5 team members", "Accountant portal", "QuickBooks / Xero export"] },
            { name: "Lifetime", price: "$99", period: " one-time", priceId: PRICES.lifetime, color: "bg-amber-600", badge: "Best deal", features: ["Everything in Business", "Pay once, use forever", "All future features included", "No subscription ever"] },
          ].map(p => (
            <div key={p.name} className={`bg-white border ${p.popular ? "border-emerald-400 border-2" : "border-gray-100"} rounded-2xl p-4 mb-2`}>
              <div className="flex justify-between items-start mb-3">
                <div><p className="font-medium">{p.name}</p><p className="text-lg font-medium mt-0.5">{p.price}<span className="text-xs text-gray-400 font-normal">{p.period}</span></p></div>
                {p.popular && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Most popular</span>}
                {p.badge && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{p.badge}</span>}
              </div>
              <div className="space-y-1.5 mb-3">{p.features.map(f => <p key={f} className="text-xs text-gray-700 flex items-center gap-1.5"><span className="text-emerald-500">✓</span>{f}</p>)}</div>
              <button onClick={() => onCheckout(p.priceId)} className={`w-full py-2.5 rounded-xl text-sm font-medium text-white border-none cursor-pointer ${p.color}`}>Upgrade to {p.name}{p.name === "Lifetime" ? " — $99" : ""}</button>
            </div>
          ))}
        </div>
      )}

      {/* Email import */}
      <div id="email-section" className="mt-2 mb-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Email import</p>
          {emailConnected.length > 0 && (
            <button onClick={onFetchEmails} disabled={emailsLoading} className="text-xs text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer disabled:opacity-50 disabled:cursor-default">{emailsLoading ? "Checking…" : "↻ Check now"}</button>
          )}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {[{ provider: "google", label: "Gmail", icon: "📧" }, { provider: "azure-ad", label: "Outlook", icon: "📨" }].map(p => {
            const connected = emailConnected.includes(p.provider)
            return (
              <div key={p.provider} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                <span className="text-lg">{p.icon}</span>
                <div className="flex-1"><p className="text-sm font-medium">{p.label}</p><p className="text-xs text-gray-400">{connected ? session?.user?.email : emailsLoading ? "Checking…" : "Not connected"}</p></div>
                {connected
                  ? <div className="flex items-center gap-2">
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">Connected</span>
                      <button onClick={() => onDisconnectEmail(p.provider)} className="text-xs text-gray-400 hover:text-red-600 cursor-pointer bg-transparent border-none">Disconnect</button>
                    </div>
                  : <a href={isPro ? `/api/email/connect/${p.provider}` : undefined} onClick={e => connectEmail(e, p.provider, "Email import")} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer no-underline text-gray-700">Connect</a>
                }
              </div>
            )
          })}
        </div>
        {emails.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">✦ Found in inbox — tap to import</p>
            <div className="space-y-2">
              {emails.map((e: any, i: number) => {
                const id = e.gmailId ?? e.outlookId
                const done = importedEmails.has(id)
                return (
                  <div key={i} className={`bg-white border rounded-xl p-3 ${e.auditFlag ? "border-amber-200 bg-amber-50/50" : "border-gray-100"}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{e.from}{e.auditFlag && " ⚠"}</p><p className="text-xs text-gray-400 truncate">{e.subject}</p></div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium text-emerald-600">${e.amount?.toFixed(2)}</p>
                        <button onClick={() => !done && onImportEmail(e)} disabled={done} className={`text-xs px-2.5 py-1 rounded-lg mt-1 border-none cursor-pointer ${done ? "bg-emerald-100 text-emerald-600" : "bg-emerald-500 text-white"}`}>{done ? "Saved" : "Import"}</button>
                      </div>
                    </div>
                    {e.auditFlag && e.auditNote && <p className="text-xs text-amber-700 mt-2">{e.auditNote}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* CSV / Google Sheet import */}
      <div className="mb-3">
        <p className="text-sm font-medium mb-2">Import your records</p>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-3">Already tracking expenses in a spreadsheet? Import it here — AI reads whatever columns you have.</p>
          <button
            onClick={() => { if (!isPro) { proOnly("Bulk import"); return } csvRef.current?.click() }}
            disabled={importing}
            className="w-full bg-emerald-500 text-white rounded-xl py-2.5 text-xs font-medium mb-2 disabled:opacity-50"
          >
            {importing ? "Reading file..." : "📄 Upload CSV"}
          </button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { if (e.target.files?.[0]) onCsvFile(e.target.files[0]); e.target.value = "" }} />
          <div className="flex gap-2">
            <input
              value={sheetUrlInput}
              onChange={e => setSheetUrlInput(e.target.value)}
              placeholder="Paste a Google Sheets link..."
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2"
            />
            <button
              onClick={() => {
                if (!isPro) { proOnly("Bulk import"); return }
                if (!sheetUrlInput.trim()) return
                onSheetUrl(sheetUrlInput.trim())
              }}
              disabled={importing}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-medium border-none cursor-pointer disabled:opacity-50"
            >
              Import
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Sheet must be shared as "Anyone with the link can view".</p>
          <div className="border-t border-gray-100 mt-3 pt-3">
            {emailConnected.includes("google") ? (
              <button
                onClick={() => { if (!isPro) { proOnly("Bulk import"); return } onBrowseSheets() }}
                disabled={importing}
                className="w-full border border-gray-200 rounded-xl py-2.5 text-xs font-medium text-gray-700 disabled:opacity-50"
              >
                {importing ? "Loading..." : "🔗 Browse your Google Sheets"}
              </button>
            ) : (
              <a
                href={isPro ? "/api/email/connect/google" : undefined}
                onClick={e => connectEmail(e, "google", "Bulk import")}
                className="w-full block text-center border border-gray-200 rounded-xl py-2.5 text-xs font-medium text-gray-700 no-underline cursor-pointer"
              >
                🔗 Connect Google to browse Sheets directly
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Google Sheets file picker */}
      {sheetFiles && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center p-3 modal-safe" onClick={onCloseSheetFiles}>
          <div className="w-full max-w-lg max-h-[70vh] overflow-y-auto bg-white rounded-2xl p-4" onClick={(e: any) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-3">Choose a spreadsheet</p>
            <div className="space-y-1">
              {sheetFiles.map((f: any) => (
                <button key={f.id} onClick={() => onPickSheetFile(f)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 border-none bg-transparent cursor-pointer text-sm">
                  📊 {f.name}
                </button>
              ))}
            </div>
            <button onClick={onCloseSheetFiles} className="w-full mt-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-500">Cancel</button>
          </div>
        </div>
      )}

      {/* Google Sheets tab picker */}
      {sheetTabs && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center p-3 modal-safe" onClick={onCloseSheetTabs}>
          <div className="w-full max-w-lg max-h-[70vh] overflow-y-auto bg-white rounded-2xl p-4" onClick={(e: any) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-3">{sheetTabs.file.name} — choose a tab</p>
            <div className="space-y-1">
              {sheetTabs.tabs.map((t: string) => (
                <button key={t} onClick={() => onPickSheetTab(t)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 border-none bg-transparent cursor-pointer text-sm">
                  {t}
                </button>
              ))}
            </div>
            <button onClick={onCloseSheetTabs} className="w-full mt-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-500">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-center text-xs mt-4 mb-2"><a href="/privacy" className="text-gray-400">Privacy policy</a></p>
    </div>
  )
}
