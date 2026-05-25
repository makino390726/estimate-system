import {
    getProfileWithStatus,
    pushMessages,
    pushTextWithPostbackQuickReply,
    type LinePushResult,
} from '@/lib/lineClient'
import { formatRepairPartExchangeLine } from '@/lib/repairPartsCustomerDisplay'

/** LINE postback: 顧客承諾 */
export const REPAIR_ACK_POSTBACK_PREFIX = 'repair_ack:'

export function buildRepairAckPostbackData(repairRequestId: string): string {
    return `${REPAIR_ACK_POSTBACK_PREFIX}${repairRequestId}`
}

export function parseRepairAckPostbackData(data: string): string | null {
    const t = String(data || '').trim()
    if (!t.startsWith(REPAIR_ACK_POSTBACK_PREFIX)) return null
    const id = t.slice(REPAIR_ACK_POSTBACK_PREFIX.length).trim()
    return id || null
}

function formatYen(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(Number(n))) return '—'
    return `¥${Math.round(Number(n)).toLocaleString('ja-JP')}`
}

function truncate(text: string, max: number): string {
    const t = sanitizeFlexText(text)
    if (t.length <= max) return t
    return `${t.slice(0, max)}…`
}

/** Flex テキスト用（制御文字除去） */
function sanitizeFlexText(text: string): string {
    return String(text || '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .trim()
}

function flexRow(label: string, value: string) {
    return {
        type: 'box' as const,
        layout: 'horizontal' as const,
        contents: [
            { type: 'text' as const, text: label, color: '#8c8c8c', size: 'sm' as const, flex: 3 },
            {
                type: 'text' as const,
                text: value || '—',
                size: 'sm' as const,
                flex: 5,
                wrap: true,
            },
        ],
    }
}

export type RepairCompletionNotifyInput = {
    repairRequestId: string
    requestNo: number
    visitCompletedDate?: string | null
    treatmentDetails?: string | null
    rootCause?: string | null
    durationMinutes?: number | null
    visitFee?: number | null
    laborCost?: number | null
    parts?: { part_name: string; part_code?: string | null; quantity?: number | null }[]
    alreadyAcknowledged?: boolean
}

export function buildRepairCompletionFlexMessage(input: RepairCompletionNotifyInput): Record<string, unknown> {
    const parts = (input.parts || []).filter((p) => String(p.part_name || '').trim())
    const partsText =
        parts.length > 0
            ? parts.slice(0, 12).map(formatRepairPartExchangeLine).join('\n')
            : '（交換部品の記録なし）'

    const bodyContents: Record<string, unknown>[] = [
        flexRow('受付番号', `#${input.requestNo}`),
        ...(input.visitCompletedDate
            ? [flexRow('完了日', String(input.visitCompletedDate))]
            : []),
        flexRow('処置内容', truncate(String(input.treatmentDetails || ''), 400)),
        flexRow('原因', truncate(String(input.rootCause || ''), 200)),
        ...(input.durationMinutes != null
            ? [flexRow('作業時間', `${input.durationMinutes}分`)]
            : []),
        flexRow('出張費', formatYen(input.visitFee)),
        flexRow('工賃', formatYen(input.laborCost)),
        { type: 'separator', margin: 'lg' },
        {
            type: 'text',
            text: '交換部品（明細）',
            weight: 'bold',
            size: 'sm',
            color: '#334155',
        },
        {
            type: 'text',
            text: truncate(partsText, 1200),
            size: 'xs',
            color: '#555555',
            wrap: true,
            margin: 'sm',
        },
        {
            type: 'text',
            text: '※部品代金の内訳は含みません。請求内容は別途ご案内する場合があります。',
            size: 'xxs',
            color: '#8c8c8c',
            wrap: true,
            margin: 'md',
        },
    ]

    const footer = input.alreadyAcknowledged
        ? {
              type: 'box' as const,
              layout: 'vertical' as const,
              paddingAll: '12px' as const,
              contents: [
                  {
                      type: 'text' as const,
                      text: '承諾済みです。ありがとうございました。',
                      size: 'xs' as const,
                      color: '#8c8c8c',
                      wrap: true,
                  },
              ],
          }
        : {
              type: 'box' as const,
              layout: 'vertical' as const,
              paddingAll: '12px' as const,
              contents: [
                  {
                      type: 'button' as const,
                      action: {
                          type: 'postback' as const,
                          label: '承諾する',
                          data: buildRepairAckPostbackData(input.repairRequestId),
                          displayText: '完了報告を承諾しました',
                      },
                      style: 'primary' as const,
                      color: '#166534',
                      height: 'md' as const,
                  },
              ],
          }

    return {
        type: 'flex',
        altText: `修理完了のご報告（受付番号 #${input.requestNo}）`,
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#166534',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text',
                        text: '修理完了のご報告',
                        color: '#ffffff',
                        weight: 'bold',
                        size: 'lg',
                    },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                paddingAll: '16px',
                contents: bodyContents,
            },
            footer,
        },
    }
}

function buildRepairCompletionTextFallback(input: RepairCompletionNotifyInput): string {
    const parts = (input.parts || []).filter((p) => String(p.part_name || '').trim())
    const partsText =
        parts.length > 0
            ? parts.slice(0, 8).map(formatRepairPartExchangeLine).join('\n')
            : '（交換部品の記録なし）'

    return [
        '【修理完了のご報告】',
        `受付番号: #${input.requestNo}`,
        input.visitCompletedDate ? `完了日: ${input.visitCompletedDate}` : null,
        `処置内容: ${truncate(String(input.treatmentDetails || ''), 300)}`,
        `原因: ${truncate(String(input.rootCause || ''), 150)}`,
        input.durationMinutes != null ? `作業時間: ${input.durationMinutes}分` : null,
        `出張費: ${formatYen(input.visitFee)}`,
        `工賃: ${formatYen(input.laborCost)}`,
        '',
        '【交換部品】',
        truncate(partsText, 500),
        '',
        '※部品代金の内訳は含みません。',
        input.alreadyAcknowledged
            ? '（承諾済みです）'
            : '下の「承諾する」ボタンをタップして完了をお知らせください。',
    ]
        .filter(Boolean)
        .join('\n')
}

/** 顧客へ修理完了報告 Flex を送信（プロフィール取得失敗でも push 実行） */
export async function pushRepairCompletionToCustomer(
    lineUserId: string,
    input: RepairCompletionNotifyInput,
): Promise<LinePushResult> {
    const to = String(lineUserId || '').trim()

    const profileResult = await getProfileWithStatus(to)
    if (!profileResult.profile) {
        console.log('[LINE Profile API] プロフィール取得失敗のため push を続行', {
            http_status: profileResult.http_status,
            to,
        })
    }

    const customerLine = { customerLine: true as const }
    const flex = buildRepairCompletionFlexMessage(input)
    const flexResult = await pushMessages(to, [flex], customerLine)
    if (flexResult.ok) return flexResult

    const text = buildRepairCompletionTextFallback(input)
    if (!input.alreadyAcknowledged) {
        const fallback = await pushTextWithPostbackQuickReply(
            to,
            text,
            {
                label: '承諾する',
                data: buildRepairAckPostbackData(input.repairRequestId),
                displayText: '完了報告を承諾',
            },
            customerLine,
        )
        return fallback
    }

    return pushMessages(to, [{ type: 'text', text }], customerLine)
}
