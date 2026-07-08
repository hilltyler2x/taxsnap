const TENANT = process.env.AZURE_AD_TENANT_ID ?? "common"
const AUTHORITY = `https://login.microsoftonline.com/${TENANT}`

export const MS_SCOPES = ["offline_access", "Mail.Read", "User.Read"]
export const MS_REDIRECT_URI = `${process.env.APP_URL}/api/email/callback/azure-ad`

type MsTokenResponse = { access_token: string; refresh_token?: string; expires_in: number }

export function getMicrosoftAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    response_type: "code",
    redirect_uri: MS_REDIRECT_URI,
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
  })
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`
}

export async function exchangeMicrosoftCode(code: string): Promise<MsTokenResponse> {
  const params = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code,
    redirect_uri: MS_REDIRECT_URI,
    scope: MS_SCOPES.join(" "),
  })
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<MsTokenResponse> {
  const params = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MS_SCOPES.join(" "),
  })
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export type EmailCandidate = { id: string; from: string; subject: string; date: string; snippet: string }

export async function listOutlookReceiptCandidates(accessToken: string): Promise<EmailCandidate[]> {
  const params = new URLSearchParams({
    "$search": '"receipt OR invoice OR order confirmation"',
    "$top": "10",
    "$select": "id,from,subject,receivedDateTime,bodyPreview",
  })
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: "eventual" },
  })
  if (!res.ok) throw new Error(`Graph API failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.value ?? []).map((m: any) => ({
    id: m.id,
    from: m.from?.emailAddress?.address ?? "",
    subject: m.subject ?? "",
    date: m.receivedDateTime ?? "",
    snippet: m.bodyPreview ?? "",
  }))
}
