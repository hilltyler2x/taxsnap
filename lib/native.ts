"use client"
// Helpers for when the site runs inside the TaxSnap iPhone/Android app (Capacitor).
// Everything here is a no-op or falls back to plain web behavior in a normal browser.
import { useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"

export const APP_URL = "https://taxsnap-jet.vercel.app"

export function isNativeApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform()
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web"
  return Capacitor.getPlatform() as "ios" | "android" | "web"
}

// Read after mount so server and client render the same HTML first.
export function usePlatform() {
  const [platform, setPlatform] = useState<"ios" | "android" | "web">("web")
  useEffect(() => { setPlatform(nativePlatform()) }, [])
  return platform
}

// ─── Receipt photos ───
export async function takeReceiptPhoto(source: "camera" | "photos"): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera")
  try {
    const photo = await Camera.getPhoto({
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Base64,
      quality: 80,
      width: 2000,
      correctOrientation: true,
    })
    if (!photo.base64String) return null
    const type = `image/${photo.format === "jpg" ? "jpeg" : photo.format}`
    const bytes = Uint8Array.from(atob(photo.base64String), c => c.charCodeAt(0))
    return new File([bytes], `receipt.${photo.format}`, { type })
  } catch (err: any) {
    // Closing the picker without choosing a photo rejects; that's not an error.
    if (/cancel/i.test(err?.message ?? "")) return null
    throw err
  }
}

export async function hapticSuccess() {
  if (!isNativeApp()) return
  const { Haptics, NotificationType } = await import("@capacitor/haptics")
  Haptics.notification({ type: NotificationType.Success }).catch(() => {})
}

// ─── Exports: a browser download link does nothing inside the app, so save and share ───
export async function saveOrShareFile(filename: string, blob: Blob) {
  if (!isNativeApp()) {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    return
  }
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "")
    r.onerror = reject
    r.readAsDataURL(blob)
  })
  const { Filesystem, Directory } = await import("@capacitor/filesystem")
  const { Share } = await import("@capacitor/share")
  const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
  await Share.share({ title: filename, url: uri }).catch(() => {})
}

// ─── System browser for flows Google and Microsoft block inside app web views ───
export async function openInSystemBrowser(url: string, onClose?: () => void) {
  const { Browser } = await import("@capacitor/browser")
  if (onClose) {
    const handle = await Browser.addListener("browserFinished", () => { handle.remove(); onClose() })
  }
  await Browser.open({ url, presentationStyle: "popover" })
}

// Email connect: the system browser has no TaxSnap session, so ask the server for a
// short-lived link that carries who you are, then open that.
export async function openSignedLink(path: string) {
  const res = await fetch(`/api/native/link?to=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error("Could not start sign-in")
  const { url } = await res.json()
  await openInSystemBrowser(url)
}

// ─── Sign-in handoff ───
// The app makes a random key, the browser signs in and gets a one-time Clerk sign-in
// token encrypted with that key, and hands it back through taxsnap://auth. Another app
// grabbing that link only sees ciphertext.
const HANDOFF_KEY = "taxsnap_handoff_key"

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...Array.from(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

export async function startNativeSignIn() {
  const key = b64url(crypto.getRandomValues(new Uint8Array(32)))
  try { localStorage.setItem(HANDOFF_KEY, key) } catch {}
  await openInSystemBrowser(`${APP_URL}/native/start?k=${key}`)
}

export async function decryptHandoff(cipher: string): Promise<string | null> {
  let key: string | null = null
  try { key = localStorage.getItem(HANDOFF_KEY) } catch {}
  if (!key) return null
  const raw = fromB64url(cipher)
  const iv = raw.slice(0, 12)
  const data = raw.slice(12)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  const aes = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"])
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aes, data)
    try { localStorage.removeItem(HANDOFF_KEY) } catch {}
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
