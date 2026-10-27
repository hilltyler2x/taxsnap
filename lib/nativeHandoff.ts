import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto"

// Signed, short-lived "this is user X" tokens for flows that leave the app's web view
// and finish in the system browser, where there is no Clerk session. The signing key is
// derived from CLERK_SECRET_KEY so no new env var is needed.
function signingKey() {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) throw new Error("CLERK_SECRET_KEY is not set")
  return createHmac("sha256", secret).update("taxsnap-native-handoff").digest()
}

export function signUserToken(userId: string, ttlSeconds = 600) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url")
  const sig = createHmac("sha256", signingKey()).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifyUserToken(token: string | null | undefined): string | null {
  if (!token) return null
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  const expected = createHmac("sha256", signingKey()).update(payload).digest()
  const given = Buffer.from(sig, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (typeof u !== "string" || typeof e !== "number" || e < Date.now() / 1000) return null
    return u
  } catch {
    return null
  }
}

// AES-256-GCM with key = SHA-256(app key); output is base64url(iv | ciphertext | tag),
// which is what WebCrypto's AES-GCM decrypt expects after the iv.
export function encryptForApp(appKey: string, plaintext: string) {
  const key = createHash("sha256").update(appKey).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64url")
}

// Only same-site paths may be handed a signed link.
export function isSafePath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//")
}
