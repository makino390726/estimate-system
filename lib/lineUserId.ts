/** LINE Messaging API のユーザー ID（U 始まり）か */
export function isValidLineUserId(lineUserId: string | null | undefined): boolean {
    const id = String(lineUserId || '').trim()
    return id.length > 0 && id.startsWith('U')
}

export function normalizeLineUserId(lineUserId: string | null | undefined): string | null {
    const id = String(lineUserId || '').trim()
    return isValidLineUserId(id) ? id : null
}
