import { google } from "googleapis"
import { stripHtml, EMAIL_BODY_MAX_CHARS } from "@/lib/emailText"
import { isPdfPart, PDF_MAX_BYTES, PDF_MAX_PER_EMAIL, type PdfAttachment } from "@/lib/pdfAttachments"

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
]
export const GOOGLE_REDIRECT_URI = `${process.env.APP_URL}/api/email/callback/google`

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
}

export function getGoogleAuthUrl(state: string) {
  return getGoogleOAuthClient().generateAuthUrl({
    access_type: "offline",
    // select_account forces the account chooser every time, so the
    // Gmail/Sheets connection can be a different Google account than
    // whichever one the user signed into TaxSnap with.
    prompt: "select_account consent",
    scope: GOOGLE_SCOPES,
    state,
  })
}

export type EmailCandidate = {
  id: string; from: string; subject: string; date: string; snippet: string
  // Only fetched on demand — most receipts have the amount in the body already.
  loadPdfs?: () => Promise<PdfAttachment[]>
}

function decodeGmailBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
}

// Gmail's plain snippet is too short to contain the actual charged amount for
// most receipt emails, which render it further down in the HTML body — so
// walk the MIME tree for the real body instead (text/plain preferred, HTML as fallback).
function findGmailBodyText(payload: any): string {
  if (!payload) return ""
  if (payload.body?.data && (payload.mimeType === "text/plain" || !payload.parts)) {
    const text = decodeGmailBase64(payload.body.data)
    return payload.mimeType === "text/html" ? stripHtml(text) : text
  }
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain" && p.body?.data)
    if (plain) return decodeGmailBase64(plain.body.data)
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const nested = findGmailBodyText(part)
        if (nested) return nested
      }
    }
    const html = payload.parts.find((p: any) => p.mimeType === "text/html" && p.body?.data)
    if (html) return stripHtml(decodeGmailBase64(html.body.data))
  }
  return ""
}

type GmailPdfRef = { filename: string; attachmentId?: string; data?: string; size: number }

function findGmailPdfParts(payload: any, out: GmailPdfRef[] = []): GmailPdfRef[] {
  if (!payload) return out
  if (isPdfPart(payload.mimeType, payload.filename) && (payload.body?.attachmentId || payload.body?.data)) {
    out.push({ filename: payload.filename || "attachment.pdf", attachmentId: payload.body.attachmentId, data: payload.body.data, size: payload.body.size ?? 0 })
  }
  for (const part of payload.parts ?? []) findGmailPdfParts(part, out)
  return out
}

export async function listGmailReceiptCandidates(token: { accessToken: string; refreshToken: string | null }) {
  const authClient = getGoogleOAuthClient()
  authClient.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken ?? undefined })

  let refreshedTokens: { access_token?: string | null; expiry_date?: number | null } | null = null
  authClient.on("tokens", (tokens) => { refreshedTokens = tokens })

  const gmail = google.gmail({ version: "v1", auth: authClient })
  const list = await gmail.users.messages.list({
    userId: "me",
    q: '(receipt OR invoice OR "order confirmation" OR "payment confirmation") newer_than:180d',
    maxResults: 10,
  })

  const items = await Promise.all((list.data.messages ?? []).filter(m => m.id).map(async (m): Promise<EmailCandidate> => {
    const msg = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" })
    const headers = msg.data.payload?.headers ?? []
    const get = (name: string) => headers.find(h => h.name === name)?.value ?? ""
    const bodyText = findGmailBodyText(msg.data.payload).slice(0, EMAIL_BODY_MAX_CHARS)
    const pdfRefs = findGmailPdfParts(msg.data.payload).filter(p => p.size <= PDF_MAX_BYTES).slice(0, PDF_MAX_PER_EMAIL)
    const loadPdfs = pdfRefs.length ? async (): Promise<PdfAttachment[]> => {
      const loaded = await Promise.all(pdfRefs.map(async ref => {
        const data = ref.data ?? (await gmail.users.messages.attachments.get({ userId: "me", messageId: m.id!, id: ref.attachmentId! })).data.data
        // Gmail returns base64url; the Claude API wants standard base64.
        return data ? { filename: ref.filename, base64: data.replace(/-/g, "+").replace(/_/g, "/") } : null
      }))
      return loaded.filter((p): p is PdfAttachment => !!p)
    } : undefined
    return { id: m.id!, from: get("From"), subject: get("Subject"), date: get("Date"), snippet: bodyText || msg.data.snippet || "", loadPdfs }
  }))

  return { items, refreshedTokens }
}

type GoogleToken = { accessToken: string; refreshToken: string | null }
type RefreshedTokens = { access_token?: string | null; expiry_date?: number | null } | null

function authClientFor(token: GoogleToken) {
  const authClient = getGoogleOAuthClient()
  authClient.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken ?? undefined })
  let refreshedTokens: RefreshedTokens = null
  authClient.on("tokens", (tokens) => { refreshedTokens = tokens })
  return { authClient, getRefreshedTokens: () => refreshedTokens }
}

export async function listGoogleSheets(token: GoogleToken) {
  const { authClient, getRefreshedTokens } = authClientFor(token)
  const drive = google.drive({ version: "v3", auth: authClient })
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id,name)",
    pageSize: 50,
    orderBy: "modifiedTime desc",
  })
  return { files: res.data.files ?? [], refreshedTokens: getRefreshedTokens() }
}

export async function listSheetTabs(token: GoogleToken, spreadsheetId: string) {
  const { authClient, getRefreshedTokens } = authClientFor(token)
  const sheets = google.sheets({ version: "v4", auth: authClient })
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" })
  const tabs = (res.data.sheets ?? []).map(s => s.properties?.title).filter((t): t is string => !!t)
  return { tabs, refreshedTokens: getRefreshedTokens() }
}

export async function getSheetValues(token: GoogleToken, spreadsheetId: string, sheetName: string) {
  const { authClient, getRefreshedTokens } = authClientFor(token)
  const sheets = google.sheets({ version: "v4", auth: authClient })
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName })
  const rows = (res.data.values ?? []).map(row => row.map(cell => String(cell ?? "")))
  return { rows, refreshedTokens: getRefreshedTokens() }
}
