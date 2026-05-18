/** 担当者 LINE 自己登録用 LIFF URL */
export function getStaffLineRegisterLiffUrl(staffName: string): string | null {
    const liffId = (
        process.env.NEXT_PUBLIC_LIFF_ID_STAFF_REGISTER ||
        process.env.NEXT_PUBLIC_LIFF_ID_STAFF ||
        ''
    ).trim()
    if (!liffId) return null

    const url = new URL(`https://liff.line.me/${liffId}`)
    if (staffName.trim()) {
        url.searchParams.set('staff', staffName.trim())
    }
    return url.toString()
}

const LINE_USER_ID_RE = /\bU[a-f0-9]{32,33}\b/i

/** QR・手入力から LINE User ID を抽出 */
export function parseLineUserIdFromText(raw: string): string | null {
    const text = raw.trim()
    if (!text) return null

    const direct = text.match(LINE_USER_ID_RE)
    if (direct) return direct[0]

    // Webhook ログ等の JSON 断片
    const jsonLike = text.match(/"userId"\s*:\s*"(U[a-f0-9]{32,33})"/i)
    if (jsonLike) return jsonLike[1]

    try {
        const url = new URL(text)
        for (const key of ['userId', 'user_id', 'line_user_id', 'uid']) {
            const v = url.searchParams.get(key)?.trim()
            if (v?.startsWith('U')) return v
        }
        const pathMatch = url.pathname.match(LINE_USER_ID_RE)
        if (pathMatch) return pathMatch[0]
    } catch {
        /* not a URL */
    }

    const anywhere = text.match(LINE_USER_ID_RE)
    return anywhere ? anywhere[0] : null
}

export type QrScanPayload =
    | { kind: 'line_user_id'; lineUserId: string; raw: string }
    | { kind: 'staff_register_url'; staffName: string | null; raw: string }
    | { kind: 'unrecognized'; raw: string }

/** カメラ読み取り結果の種別判定 */
export function parseQrScanPayload(raw: string): QrScanPayload {
    const text = raw.trim()
    const lineUserId = parseLineUserIdFromText(text)
    if (lineUserId) {
        return { kind: 'line_user_id', lineUserId, raw: text }
    }

    try {
        const url = new URL(text)
        const isLiff =
            url.hostname === 'liff.line.me' ||
            url.hostname.endsWith('.liff.line.me') ||
            /\/liff\/staff-line-register/i.test(url.pathname + url.search)
        if (isLiff) {
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

export const QR_SCAN_HINTS = {
    staffRegisterUrl:
        'これは「担当者登録用」のQRです。担当者本人のスマートフォンで、LINEアプリのQR読み取りから開いてください（管理PCのカメラではUser IDは取得できません）。',
    unrecognized:
        'このQRには LINE User ID（Uで始まる33文字）が含まれていません。担当者登録用QRの場合は上の「QRコードで登録」をご利用ください。User IDは公式LINEへメッセージ送信後、Webhookログから確認できます。',
} as const
