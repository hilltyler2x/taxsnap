"use client"
import { useUser, useClerk } from "@clerk/nextjs"
import { useEffect, useState, useRef } from "react"
import toast from "react-hot-toast"
import { calcDeductible, IRS_MILEAGE_RATE, CATEGORIES } from "@/lib/irs"

const CC: Record<string, string> = {
  Travel: "#1D9E75", Meals: "#BA7517", Office: "#185FA5",
  Software: "#534AB7", Home: "#3B6D11", Medical: "#A32D2D", Business: "#0F766E", Other: "#888780",
}

const ADDRESS_SUGGESTIONS = [
  { m: "Hartsfield-Jackson Airport", s: "Atlanta, GA 30320" },
  { m: "Georgia World Congress Center", s: "Atlanta, GA 30313" },
  { m: "Peachtree Center", s: "225 Peachtree St NE, Atlanta, GA" },
  { m: "Buckhead Village", s: "3035 Peachtree Rd NE, Atlanta, GA" },
  { m: "Emory University", s: "201 Dowman Dr, Atlanta, GA 30322" },
  { m: "Marriott Marquis Atlanta", s: "265 Peachtree Center Ave, Atlanta, GA" },
  { m: "Ponce City Market", s: "675 Ponce De Leon Ave NE, Atlanta, GA" },
  { m: "Georgia Tech", s: "225 North Ave NW, Atlanta, GA 30332" },
  { m: "Lenox Square", s: "3393 Peachtree Rd NE, Atlanta, GA 30326" },
  { m: "Perimeter Mall", s: "4400 Ashford Dunwoody Rd, Atlanta, GA" },
  { m: "Sandy Springs City Hall", s: "1 Galambos Way, Sandy Springs, GA" },
  { m: "Mercedes-Benz Stadium", s: "1 AMB Dr NW, Atlanta, GA 30313" },
  { m: "CNN Center", s: "190 Marietta St NW, Atlanta, GA 30303" },
  { m: "State Farm Arena", s: "1 State Farm Dr, Atlanta, GA 30303" },
  { m: "Truist Park", s: "755 Battery Ave SE, Atlanta, GA 30339" },
  { m: "Office Depot Decatur", s: "1544 Church St, Decatur, GA 30030" },
  { m: "Staples Midtown", s: "1544 Piedmont Ave NE, Atlanta, GA 30324" },
  { m: "Cumberland Mall", s: "2860 Cumberland Mall SE, Atlanta, GA" },
  { m: "Atlantic Station", s: "1380 Atlantic Dr NW, Atlanta, GA 30363" },
  { m: "Duluth Town Center", s: "3167 Main St, Duluth, GA 30096" },
  { m: "Alpharetta City Hall", s: "2 Park Plaza, Alpharetta, GA 30009" },
  { m: "Midtown Medical Center", s: "550 Peachtree St NE, Atlanta, GA 30308" },
  { m: "Hilton Atlanta Downtown", s: "255 Courtland St NE, Atlanta, GA 30303" },
]

const DEMO_RECEIPTS = [
  { name: "Delta Airlines", amount: 487.50, date: "2025-06-10", category: "Travel", place: "Atlanta, GA", purpose: "NYC conference — annual summit", notes: "" },
  { name: "Nobu Restaurant", amount: 143.20, date: "2025-06-12", category: "Meals", place: "New York, NY", purpose: "Client dinner — contract discussion", notes: "" },
  { name: "Microsoft 365", amount: 99.99, date: "2025-06-01", category: "Software", place: "Online", purpose: "Office suite for business", notes: "" },
  { name: "FedEx Shipping", amount: 28.40, date: "2025-06-08", category: "Office", place: "Decatur, GA", purpose: "Shipping client documents", notes: "" },
]

type Tab = "home" | "receipts" | "miles" | "taxes" | "account"
type ScanState = "idle" | "processing" | "confirm"

export default function Dashboard() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser()
  const { signOut } = useClerk()
  const [me, setMe] = useState<{ plan: string; isOwner: boolean } | null>(null)
  const [tab, setTab] = useState<Tab>("home")
  const [receipts, setReceipts] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [emails, setEmails] = useState<any[]>([])
  const [emailConnected, setEmailConnected] = useState<string[]>([])
  const [scanState, setScanState] = useState<ScanState>("idle")
  const [scanNote, setScanNote] = useState("")
  const [scanData, setScanData] = useState<any>(null)
  const [scanForm, setScanForm] = useState<any>(null)
  const [editingReceipt, setEditingReceipt] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const [destSuggestions, setDestSuggestions] = useState<any[]>([])
  const [destTimer, setDestTimer] = useState<any>(null)
  const [importedEmails, setImportedEmails] = useState<Set<string>>(new Set())
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [demoIdx, setDemoIdx] = useState(0)
  const [attCount, setAttCount] = useState(2)
  const [aiStatusMsg, setAiStatusMsg] = useState("Reading your receipt...")
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const plan = me?.plan ?? "FREE"
  const isPro = plan !== "FREE"

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
    if (res.ok) setTrips((await res.json()).trips)
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
    const res = await fetch("/api/email")
    if (res.ok) {
      const data = await res.json()
      setEmails(data.emails ?? [])
      setEmailConnected(data.connected ?? [])
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
        toast.error(err.error ?? "Could not read receipt — try a clearer photo")
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
      setScanState("idle")
      setScanForm(null)
      fetchReceipts()
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Failed to save")
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
      toast.error(err.error ?? "Failed to update")
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
    if (res.ok) { toast.success("Trip logged!"); fetchTrips() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  const importEmail = async (email: any) => {
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: email.from, amount: email.amount, date: email.date,
        category: email.category, purpose: email.subject, source: "email",
      }),
    })
    if (res.ok) {
      const id = email.gmailId ?? email.outlookId
      setImportedEmails(prev => new Set(Array.from(prev).concat(id)))
      toast.success("Imported!")
      fetchReceipts()
    }
  }

  const startCheckout = async (priceId: string) => {
    const res = await fetch("/api/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    })
    if (res.ok) { const { url } = await res.json(); window.location.href = url }
  }

  const onDestInput = (val: string) => {
    clearTimeout(destTimer)
    if (!val || val.length < 1) { setDestSuggestions([]); return }
    setDestTimer(setTimeout(() => {
      const words = val.toLowerCase().split(/\s+/).filter(Boolean)
      setDestSuggestions(
        ADDRESS_SUGGESTIONS.filter(a => {
          const hay = (a.m + " " + a.s).toLowerCase()
          return words.every(w => hay.includes(w))
        }).slice(0, 6)
      )
    }, 120))
  }

  const totalDed = receipts.reduce((s, r) => s + (r.deductible ?? 0), 0) +
    trips.reduce((s, t) => s + t.deductible, 0)

  if (!isLoaded) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">Loading...</div>
  }

  const displayUser = {
    image: clerkUser?.imageUrl,
    name: clerkUser?.fullName,
    email: clerkUser?.primaryEmailAddress?.emailAddress,
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto bg-gray-50">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
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

      {/* Main content */}
      <div className="flex-1 overflow-y-auto pb-20 px-3 pt-3">

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
                    onClick={() => galleryRef.current?.click()}
                    className="bg-emerald-500 text-white rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1.5"
                  >
                    🖼 Photo library
                  </button>
                  <button
                    onClick={() => cameraRef.current?.click()}
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
            ? <LockScreen icon="🚗" title="Mileage tracking is Pro" sub="Log IRS-compliant trips with destination and odometer readings. Upgrade to Pro for $5/month." onUpgrade={() => setTab("account")} />
            : <MilesTab trips={trips} onSave={saveTrip} onDestInput={onDestInput} suggestions={destSuggestions} onSelectDest={() => setDestSuggestions([])} />
        )}

        {/* TAXES */}
        {tab === "taxes" && (
          <TaxesTab receipts={receipts} trips={trips} isPro={isPro} onUpgrade={() => setTab("account")} />
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
            importedEmails={importedEmails}
            onFetchEmails={fetchEmails}
            onImportEmail={importEmail}
            onDisconnectEmail={disconnectEmail}
            onCheckout={startCheckout}
          />
        )}
      </div>

      {/* Edit receipt modal */}
      {editingReceipt && editForm && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center p-3" onClick={() => { setEditingReceipt(null); setEditForm(null) }}>
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

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 flex z-10">
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
  const d = new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const icon: Record<string, string> = { Travel: "✈", Meals: "🍽", Office: "📦", Software: "💻", Home: "🏠", Medical: "⚕", Business: "💼", Other: "📎" }
  return (
    <div onClick={onClick} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-gray-300 transition-colors">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: col + "22", color: col }}>
        {icon[r.category] ?? "📎"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{r.name}</p>
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
        {[
          { key: "name", label: "Merchant *" },
          { key: "amount", label: "Amount *", type: "number" },
          { key: "date", label: "Date *", type: "date" },
          { key: "place", label: "Place *" },
          { key: "purpose", label: "Business purpose *" },
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
      <button onClick={onUpgrade} className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium">See plans</button>
    </div>
  )
}

function MilesTab({ trips, onSave, onDestInput, suggestions, onSelectDest }: any) {
  const [form, setForm] = useState({ purpose: "", destination: "", odoStart: "", odoEnd: "", date: new Date().toISOString().split("T")[0] })
  const miles = parseInt(form.odoEnd) - parseInt(form.odoStart)
  const ded = isNaN(miles) || miles <= 0 ? 0 : miles * IRS_MILEAGE_RATE
  const totalMiles = trips.reduce((s: number, t: any) => s + t.miles, 0)

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-50 rounded-xl p-3"><p className="text-xs text-blue-600 mb-1">Total miles</p><p className="text-xl font-medium text-blue-900">{totalMiles}</p><p className="text-xs text-blue-500">2025 YTD</p></div>
        <div className="bg-blue-50 rounded-xl p-3"><p className="text-xs text-blue-600 mb-1">IRS deduction</p><p className="text-xl font-medium text-blue-900">${Math.round(totalMiles * IRS_MILEAGE_RATE)}</p><p className="text-xs text-blue-500">at $0.67/mile</p></div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 space-y-3">
        <p className="text-sm font-medium">Log a trip</p>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Business purpose *</label>
          <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Client meeting at Acme Co." className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
        </div>
        <div className="relative">
          <label className="text-xs text-gray-500 block mb-1">Destination *</label>
          <input value={form.destination} onChange={e => { setForm({ ...form, destination: e.target.value }); onDestInput(e.target.value) }}
            placeholder="Start typing an address..." className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" autoComplete="off" />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl overflow-hidden z-10 shadow-sm">
              {suggestions.map((s: any, i: number) => (
                <button key={i} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 block"
                  onMouseDown={() => { setForm({ ...form, destination: s.m + ", " + s.s }); onSelectDest() }}>
                  <p className="text-xs font-medium">📍 {s.m}</p>
                  <p className="text-xs text-gray-400">{s.s}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-500 block mb-1">Odo start *</label><input type="number" value={form.odoStart} onChange={e => setForm({ ...form, odoStart: e.target.value })} placeholder="42100" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
          <div><label className="text-xs text-gray-500 block mb-1">Odo end *</label><input type="number" value={form.odoEnd} onChange={e => setForm({ ...form, odoEnd: e.target.value })} placeholder="42134" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
        </div>
        {miles > 0 && <p className="text-xs text-blue-600 font-medium">{miles} miles · ${ded.toFixed(2)} deductible</p>}
        <div><label className="text-xs text-gray-500 block mb-1">Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
        <button onClick={() => { if (!form.purpose || !form.destination || !form.odoStart || !form.odoEnd || miles <= 0) return; onSave({ ...form, odoStart: parseInt(form.odoStart), odoEnd: parseInt(form.odoEnd) }); setForm({ purpose: "", destination: "", odoStart: "", odoEnd: "", date: new Date().toISOString().split("T")[0] }) }}
          className="w-full bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium">+ Add to log</button>
      </div>

      <p className="text-sm font-medium mb-2">Trip log</p>
      <div className="space-y-2">
        {trips.map((t: any) => (
          <div key={t.id} className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-sm flex-shrink-0">🚗</div>
              <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{t.purpose}</p><p className="text-xs text-gray-400">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p></div>
              <div className="text-right"><p className="text-sm font-medium text-blue-600">{t.miles} mi</p><p className="text-xs text-emerald-600">${t.deductible?.toFixed(2)}</p></div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 pl-9">📍 {t.destination} · 🔢 {t.odoStart?.toLocaleString()} → {t.odoEnd?.toLocaleString()}</p>
          </div>
        ))}
        {!trips.length && <p className="text-xs text-gray-400 text-center py-4">No trips logged yet</p>}
      </div>
    </div>
  )
}

function TaxesTab({ receipts, trips, isPro, onUpgrade }: any) {
  const bycat: Record<string, number> = {}
  receipts.forEach((r: any) => { bycat[r.category] = (bycat[r.category] ?? 0) + (r.deductible ?? 0) })
  const milesDed = trips.reduce((s: number, t: any) => s + (t.deductible ?? 0), 0)
  if (milesDed > 0) bycat["Mileage"] = (bycat["Mileage"] ?? 0) + milesDed
  const total = Object.values(bycat).reduce((s, v) => s + v, 0)
  const max = Math.max(...Object.values(bycat), 1)

  const handleExport = async () => {
    const res = await fetch("/api/export?format=csv")
    if (!res.ok) { const e = await res.json(); alert(e.error); return }
    const blob = await res.blob()
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "taxsnap_irs_2025.csv"; a.click()
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-100 rounded-xl p-3"><p className="text-xs text-gray-500 mb-1">Total deductible</p><p className="text-xl font-medium">${Math.round(total).toLocaleString()}</p></div>
        <div className="bg-gray-100 rounded-xl p-3"><p className="text-xs text-gray-500 mb-1">Est. savings</p><p className="text-xl font-medium">${Math.round(total * 0.22).toLocaleString()}</p><p className="text-xs text-gray-400">22% bracket</p></div>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between"><p className="text-sm font-medium">Breakdown</p><p className="text-xs text-gray-400">2025</p></div>
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
          <button className="w-full border border-gray-200 py-3 rounded-xl text-sm font-medium text-gray-700">📄 Export PDF summary</button>
        </div>
      ) : <LockScreen icon="📊" title="Export is Pro" sub="Download IRS-ready CSV and PDF for your accountant. Upgrade for $5/month." onUpgrade={onUpgrade} />}
    </div>
  )
}

function AccountTab({ session, plan, isPro, billingCycle, onToggleBilling, emails, emailConnected, importedEmails, onFetchEmails, onImportEmail, onDisconnectEmail, onCheckout, onSignOut }: any) {
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
      </div>

      {plan === "OWNER" && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 mb-3">
          <span className="text-lg">🛡</span>
          <p className="text-sm text-red-800">Owner access active — all features unlocked, no charge.</p>
        </div>
      )}

      {plan === "FREE" && (
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
            <button onClick={onFetchEmails} className="text-xs text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer">↻ Check now</button>
          )}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {[{ provider: "google", label: "Gmail", icon: "📧" }, { provider: "azure-ad", label: "Outlook", icon: "📨" }].map(p => {
            const connected = emailConnected.includes(p.provider)
            return (
              <div key={p.provider} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                <span className="text-lg">{p.icon}</span>
                <div className="flex-1"><p className="text-sm font-medium">{p.label}</p><p className="text-xs text-gray-400">{connected ? session?.user?.email : "Not connected"}</p></div>
                {connected
                  ? <div className="flex items-center gap-2">
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">Connected</span>
                      <button onClick={() => onDisconnectEmail(p.provider)} className="text-xs text-gray-400 hover:text-red-600 cursor-pointer bg-transparent border-none">Disconnect</button>
                    </div>
                  : <a href={isPro ? `/api/email/connect/${p.provider}` : undefined} onClick={e => { if (!isPro) { e.preventDefault(); alert("Email import requires Pro. Upgrade in Account.") } }} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer no-underline text-gray-700">Connect</a>
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
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{e.from}</p><p className="text-xs text-gray-400 truncate">{e.subject}</p></div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-emerald-600">${e.amount?.toFixed(2)}</p>
                      <button onClick={() => !done && onImportEmail(e)} disabled={done} className={`text-xs px-2.5 py-1 rounded-lg mt-1 border-none cursor-pointer ${done ? "bg-emerald-100 text-emerald-600" : "bg-emerald-500 text-white"}`}>{done ? "Saved" : "Import"}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
