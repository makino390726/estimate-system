/** LINE push / reply 失敗時のユーザー向けメッセージ */
export function formatLinePushError(status: number, errBody: string): string {
    let message = ''
    let details: { message?: string; property?: string }[] | undefined
    try {
        const j = JSON.parse(errBody) as {
            message?: string
            details?: { message?: string; property?: string }[]
        }
        message = String(j.message || '').trim()
        details = j.details
    } catch {
        message = errBody.trim().slice(0, 200)
    }

    if (message === 'Failed to send messages') {
        const detailText = details?.map((d) => d.message).filter(Boolean).join(' / ')
        const base =
            '顧客のLINEへ送信できませんでした。お客様が公式アカウントをブロックしている、友だち追加していない、または登録されたLINE IDが現在の公式アカウントと一致しない可能性があります。'
        return detailText ? `${base}（LINE: ${detailText}）` : base
    }

    if (status === 401 || status === 403) {
        return 'LINEチャネルのアクセストークンが無効です。Vercel の LINE_CHANNEL_ACCESS_TOKEN を確認してください。'
    }

    if (message) {
        return `LINE送信エラー (${status}): ${message}`
    }
    return `LINE送信エラー (${status})`
}
