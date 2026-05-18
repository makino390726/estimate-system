import { getStaffLineRegisterLiffUrl } from '@/lib/lineStaffRegister'

/** 担当者が公式LINEに送ると User ID を返すキーワード */
export function isStaffLineHelpCommand(text: string): boolean {
    const t = text.trim()
    return /^(連携|userid|ユーザーid|担当者登録|id)$/i.test(t)
}

/** 「登録 山田太郎」形式 */
export function parseStaffRegisterCommand(text: string): string | null {
    const m = text.trim().match(/^登録[　\s]+(.+)$/i)
    return m?.[1]?.trim() || null
}

export function buildStaffLineHelpReply(lineUserId: string, displayName?: string): string {
    const liffUrl = getStaffLineRegisterLiffUrl('')
    const lines = [
        '【修理通知 LINE 連携】',
        displayName ? `表示名: ${displayName}` : null,
        `あなたの LINE User ID:`,
        lineUserId,
        '',
        '■ 登録方法（推奨）',
        '社内の「修理通知 LINE 連携」画面で担当者名を選び、表示されたQRを、このスマホのLINEアプリで読み取ってください。',
        liffUrl ? `（登録用リンク: ${liffUrl}）` : '（管理者に LIFF 担当者登録の設定を依頼してください）',
        '',
        '■ 手動登録の場合',
        '上記 User ID を管理者に伝え、管理画面の「手動登録」に入力してもらってください。',
    ]
    return lines.filter(Boolean).join('\n')
}

export function buildStaffRegisterSuccessReply(staffName: string): string {
    return `担当者「${staffName}」として LINE 通知の登録が完了しました。`
}

export function buildStaffRegisterFailReply(reason: string): string {
    return `登録できませんでした: ${reason}\n「連携」と送信すると User ID をお知らせします。`
}
