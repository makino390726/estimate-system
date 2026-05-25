import {
    getBotChannelInfo,
    getProfileWithStatus,
    pushMessage,
    sendRepairConfirmation,
    type LinePushResult,
} from '@/lib/lineClient'
import { formatLinePushError } from '@/lib/linePushErrors'
import { isValidLineUserId } from '@/lib/lineUserId'

export type RepairAcceptLineNotifyResult =
    | { ok: true; channel_basic_id?: string }
    | {
          ok: false
          error: string
          channel_basic_id?: string
          line_profile_ok?: boolean
          line_profile_http_status?: number | null
          http_status?: number
      }

function acceptPushError(result: LinePushResult & { ok: false }): string {
    return `LINE受付確認の送信に失敗しました (HTTP ${result.status}): ${formatLinePushError(result.status, result.error)}`
}

/** LIFF 修理受付後の顧客向け「修理受付完了」LINE（プロフィール取得失敗でも push 実行） */
export async function sendRepairAcceptLineConfirmation(
    lineUserId: string | null | undefined,
    requestNo: number,
    symptom: string,
    opts?: { customerName?: string; model?: string | null },
): Promise<RepairAcceptLineNotifyResult> {
    const to = String(lineUserId || '').trim()
    if (!isValidLineUserId(to)) {
        return { ok: false, error: 'LINEユーザーIDが未登録です' }
    }

    const bot = await getBotChannelInfo()
    const channelBasicId = bot?.basicId

    const profileResult = await getProfileWithStatus(to)
    if (!profileResult.profile) {
        console.log('[LINE Profile API] プロフィール取得失敗のため push を続行', {
            http_status: profileResult.http_status,
            to,
        })
    }

    const flexResult = await sendRepairConfirmation(to, requestNo, symptom, opts?.model ?? undefined)
    if (flexResult.ok) {
        return { ok: true, channel_basic_id: channelBasicId }
    }

    const text = [
        `修理依頼の送信が完了しました（受付番号: #${requestNo}）`,
        '',
        opts?.customerName ? `お名前: ${opts.customerName}` : null,
        opts?.model ? `型式: ${opts.model}` : null,
        `症状: ${symptom}`,
        '',
        '担当者より折り返しご連絡いたします。',
    ]
        .filter(Boolean)
        .join('\n')

    const fallback = await pushMessage(to, text, { customerLine: true })
    if (fallback.ok) {
        return { ok: true, channel_basic_id: channelBasicId }
    }

    return {
        ok: false,
        line_profile_ok: Boolean(profileResult.profile),
        line_profile_http_status: profileResult.http_status,
        channel_basic_id: channelBasicId,
        http_status: fallback.status,
        error: acceptPushError(fallback),
    }
}
