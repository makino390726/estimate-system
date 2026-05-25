import crypto, { createPrivateKey, type KeyObject } from 'crypto'
import * as jose from 'jose'

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token'
const API_BASE = 'https://www.worksapis.com/v1.0'

let tokenCache: { token: string; expiresAt: number } | null = null

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

export function getLineWorksEnvStatus() {
    return {
        LINEWORKS_CLIENT_ID: Boolean(trim(process.env.LINEWORKS_CLIENT_ID)),
        LINEWORKS_CLIENT_SECRET: Boolean(trim(process.env.LINEWORKS_CLIENT_SECRET)),
        LINEWORKS_SERVICE_ACCOUNT: Boolean(trim(process.env.LINEWORKS_SERVICE_ACCOUNT)),
        LINEWORKS_PRIVATE_KEY: Boolean(trim(process.env.LINEWORKS_PRIVATE_KEY)),
        LINEWORKS_BOT_ID: Boolean(trim(process.env.LINEWORKS_BOT_ID)),
        LINEWORKS_BOT_SECRET: Boolean(trim(process.env.LINEWORKS_BOT_SECRET)),
    }
}

export function isLineWorksConfigured(): boolean {
    const s = getLineWorksEnvStatus()
    return (
        s.LINEWORKS_CLIENT_ID &&
        s.LINEWORKS_CLIENT_SECRET &&
        s.LINEWORKS_SERVICE_ACCOUNT &&
        s.LINEWORKS_PRIVATE_KEY &&
        s.LINEWORKS_BOT_ID
    )
}

function getPrivateKeyPem(): string {
    let pem = trim(process.env.LINEWORKS_PRIVATE_KEY)
    if (
        (pem.startsWith('"') && pem.endsWith('"')) ||
        (pem.startsWith("'") && pem.endsWith("'"))
    ) {
        pem = pem.slice(1, -1)
    }
    return pem.replace(/\\n/g, '\n')
}

/** PKCS#8 / PKCS#1（RSA PRIVATE KEY）どちらも Node crypto で読み込む */
function importLineWorksPrivateKey(pem: string): KeyObject {
    const normalized = pem.trim()
    if (!normalized.includes('BEGIN') || !normalized.includes('PRIVATE KEY')) {
        throw new Error(
            'LINEWORKS_PRIVATE_KEY は PEM 形式である必要があります（-----BEGIN PRIVATE KEY----- または -----BEGIN RSA PRIVATE KEY-----）',
        )
    }
    try {
        return createPrivateKey({ key: normalized, format: 'pem' })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(
            `LINEWORKS_PRIVATE_KEY の読み込みに失敗: ${msg}。Developer Console から秘密鍵を再発行し、PEM 全文を貼り直してください。`,
        )
    }
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

    const privateKey = importLineWorksPrivateKey(getPrivateKeyPem())
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
        let detail = text
        try {
            const j = JSON.parse(text) as { message?: string; code?: string; description?: string }
            detail = j.message || j.description || j.code || text
        } catch {
            /* raw text */
        }
        throw new Error(`LINE WORKS message ${res.status}: ${detail}`)
    }
}

export type RepairLineWorksPostbackAction = 'staff_confirm' | 'repairing'

export function buildRepairAckPostbackData(notificationId: string): string {
    return `repair_ack:${notificationId}`
}

export function buildRepairRepairingPostbackData(notificationId: string): string {
    return `repair_repairing:${notificationId}`
}

/** 担当者確認 / 修理中 ボタンの postback を解析 */
export function parseRepairLineWorksPostback(
    data: string,
): { action: RepairLineWorksPostbackAction; notificationId: string } | null {
    const trimmed = String(data || '').trim()
    const rules: Array<{ prefix: string; action: RepairLineWorksPostbackAction }> = [
        { prefix: 'repair_ack:', action: 'staff_confirm' },
        { prefix: 'repair_repairing:', action: 'repairing' },
    ]
    for (const { prefix, action } of rules) {
        if (!trimmed.startsWith(prefix)) continue
        const notificationId = trimmed.slice(prefix.length).trim()
        if (notificationId) return { action, notificationId }
    }
    return null
}

export function parseRepairAckPostbackData(data: string): string | null {
    const parsed = parseRepairLineWorksPostback(data)
    return parsed?.action === 'staff_confirm' ? parsed.notificationId : null
}
