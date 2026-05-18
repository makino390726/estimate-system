import crypto from 'crypto'
import * as jose from 'jose'

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token'
const API_BASE = 'https://www.worksapis.com/v1.0'

let tokenCache: { token: string; expiresAt: number } | null = null

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

export function isLineWorksConfigured(): boolean {
    return Boolean(
        trim(process.env.LINEWORKS_CLIENT_ID) &&
        trim(process.env.LINEWORKS_CLIENT_SECRET) &&
        trim(process.env.LINEWORKS_SERVICE_ACCOUNT) &&
        trim(process.env.LINEWORKS_PRIVATE_KEY) &&
        trim(process.env.LINEWORKS_BOT_ID),
    )
}

function getPrivateKeyPem(): string {
    return trim(process.env.LINEWORKS_PRIVATE_KEY).replace(/\\n/g, '\n')
}

export function getLineWorksBotId(): string {
    return trim(process.env.LINEWORKS_BOT_ID)
}

export function getLineWorksBotSecret(): string {
    return trim(process.env.LINEWORKS_BOT_SECRET)
}

/** Service Account JWT → Access Token */
export async function getLineWorksAccessToken(): Promise<string> {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
        return tokenCache.token
    }

    const clientId = trim(process.env.LINEWORKS_CLIENT_ID)
    const clientSecret = trim(process.env.LINEWORKS_CLIENT_SECRET)
    const serviceAccount = trim(process.env.LINEWORKS_SERVICE_ACCOUNT)
    const scope = trim(process.env.LINEWORKS_SCOPE) || 'bot'

    const privateKey = await jose.importPKCS8(getPrivateKeyPem(), 'RS256')
    const now = Math.floor(Date.now() / 1000)
    const jwt = await new jose.SignJWT({})
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(clientId)
        .setSubject(serviceAccount)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(privateKey)

    const body = new URLSearchParams({
        assertion: jwt,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        client_id: clientId,
        client_secret: clientSecret,
        scope,
    })

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        const msg = (data as { error_description?: string; error?: string }).error_description
            || (data as { error?: string }).error
            || res.statusText
        throw new Error(`LINE WORKS token error: ${msg}`)
    }

    const accessToken = String((data as { access_token?: string }).access_token || '')
    if (!accessToken) throw new Error('LINE WORKS token missing access_token')

    const expiresIn = Number((data as { expires_in?: string | number }).expires_in) || 3600
    tokenCache = { token: accessToken, expiresAt: Date.now() + expiresIn * 1000 }
    return accessToken
}

/** Callback 署名検証（X-WORKS-Signature） */
export function verifyLineWorksCallbackSignature(
    rawBody: string,
    signatureHeader: string | null,
): boolean {
    const secret = getLineWorksBotSecret()
    if (!secret || !signatureHeader) return false
    const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
    } catch {
        return expected === signatureHeader
    }
}

/** ユーザーへ Bot メッセージ送信（userId はメールまたは WORKS ユーザーID） */
export async function sendLineWorksUserMessage(
    userId: string,
    content: Record<string, unknown>,
): Promise<void> {
    const botId = getLineWorksBotId()
    const token = await getLineWorksAccessToken()
    const encodedUserId = encodeURIComponent(userId)
    const res = await fetch(`${API_BASE}/bots/${botId}/users/${encodedUserId}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`LINE WORKS message ${res.status}: ${text}`)
    }
}

export function buildRepairAckPostbackData(notificationId: string): string {
    return `repair_ack:${notificationId}`
}

export function parseRepairAckPostbackData(data: string): string | null {
    const prefix = 'repair_ack:'
    if (!data.startsWith(prefix)) return null
    const id = data.slice(prefix.length).trim()
    return id || null
}
