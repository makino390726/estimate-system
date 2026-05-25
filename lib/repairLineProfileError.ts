/** 顧客 line_user_id が Messaging API から参照できないときの説明 */
export function formatCustomerLineProfileError(httpStatus: number | null): string {
    if (httpStatus === 404) {
        return [
            '顧客のLINE IDが、この公式アカウント（Messaging API）の友だちとして認識されていません。',
            'よくある原因: LIFFが別プロバイダー（例: 三州産業 修理受付）で受付したためユーザーIDが一致しない。',
            '対処: プロバイダー「三州産業」内のLINE Login＋LIFFに差し替え後、新規受付または修理一覧のLINE連携で line_user_id を取り直してください。',
        ].join(' ')
    }
    if (httpStatus === 401) {
        return 'LINE_CHANNEL_ACCESS_TOKEN が無効です。Vercel のトークンを再発行して再デプロイしてください。'
    }
    if (httpStatus === 403) {
        return 'LINE API の権限不足（403）です。チャネル設定を確認してください。'
    }
    if (httpStatus === null) {
        return 'LINE_CHANNEL_ACCESS_TOKEN が未設定です。'
    }
    return `顧客のLINEプロフィールを取得できません（HTTP ${httpStatus}）。`
}
