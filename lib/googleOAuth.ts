import { google } from "googleapis"

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
export const GOOGLE_REDIRECT_URI = `${process.env.APP_URL}/api/email/callback/google`

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
}

export function getGoogleAuthUrl(state: string) {
  return getGoogleOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  })
}

export type EmailCandidate = { id: string; from: string; subject: string; date: string; snippet: string }

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

  const items: EmailCandidate[] = []
  for (const m of list.data.messages ?? []) {
    if (!m.id) continue
    const msg = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] })
    const headers = msg.data.payload?.headers ?? []
    const get = (name: string) => headers.find(h => h.name === name)?.value ?? ""
    items.push({ id: m.id, from: get("From"), subject: get("Subject"), date: get("Date"), snippet: msg.data.snippet ?? "" })
  }

  return { items, refreshedTokens }
}
