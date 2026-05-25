/** 担当者 LINE WORKS 自己登録用 Web URL（staff_id 推奨） */
export function getLineWorksStaffRegisterUrl(
    staffName: string,
    baseUrl?: string,
    staffId?: string,
): string {
    const base =
        baseUrl?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.PROD_BASE_URL?.trim() ||
        'https://estimate-system-ten.vercel.app'
    const url = new URL('/lineworks-staff-register', base)
    const id = String(staffId || '').trim()
    if (id) {
        url.searchParams.set('staff_id', id)
    } else if (staffName.trim()) {
        url.searchParams.set('staff', staffName.trim())
    }
    return url.toString()
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

/** QR・手入力から LINE WORKS ユーザーID（メール等）を抽出 */
export function parseLineWorksUserIdFromText(raw: string): string | null {
    const text = raw.trim()
    if (!text) return null

    if (text.startsWith('mailto:')) {
        const addr = text.slice(7).split('?')[0].trim()
        if (addr.includes('@')) return addr
    }

    const email = text.match(EMAIL_RE)
    if (email) return email[0]

    try {
        const url = new URL(text)
        for (const key of ['email', 'userId', 'user_id', 'lineworks_user_id', 'id']) {
            const v = url.searchParams.get(key)?.trim()
            if (v && (v.includes('@') || v.length > 3)) return v
        }
        if (url.pathname.includes('lineworks-staff-register')) {
            return null
        }
    } catch {
        /* not a URL */
    }

    if (text.includes('@') && !/\s/.test(text)) return text
    return null
}

export type LineWorksQrScanPayload =
    | { kind: 'lineworks_user_id'; userId: string; raw: string }
    | { kind: 'staff_register_url'; staffName: string | null; raw: string }
    | { kind: 'unrecognized'; raw: string }

export function parseLineWorksQrScanPayload(raw: string): LineWorksQrScanPayload {
    const text = raw.trim()
    const userId = parseLineWorksUserIdFromText(text)
    if (userId) {
        return { kind: 'lineworks_user_id', userId, raw: text }
    }

    try {
        const url = new URL(text)
        if (url.pathname.includes('lineworks-staff-register')) {
            return {
                kind: 'staff_register_url',
                staffName: url.searchParams.get('staff')?.trim() || null,
                raw: text,
            }
        }
    } catch {
        /* not a URL */
    }

    return { kind: 'unrecognized', raw: text }
}

export const LINEWORKS_QR_SCAN_HINTS = {
    staffRegisterUrl:
        'これは担当者登録用のQRです。担当者本人のスマートフォンで読み取り、LINE WORKS のログインメールを入力して登録してください。',
    unrecognized:
        'メールアドレスまたは LINE WORKS ユーザーIDが読み取れませんでした。担当者のプロフィールQR（連絡先）か、上の登録用QRをご利用ください。',
} as const
