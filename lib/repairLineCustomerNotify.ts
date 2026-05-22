import { pushMessages } from '@/lib/lineClient'
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
    const t = text.trim()
    if (t.length <= max) return t
    return `${t.slice(0, max)}…`
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
            text: partsText,
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
                      text: 'ご確認済みです。ありがとうございました。',
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
                          label: '内容を確認しました',
                          data: buildRepairAckPostbackData(input.repairRequestId),
                          displayText: '修理完了内容を確認しました',
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

/** 顧客へ修理完了報告 Flex を送信 */
export async function pushRepairCompletionToCustomer(
    lineUserId: string,
    input: RepairCompletionNotifyInput,
): Promise<void> {
    const flex = buildRepairCompletionFlexMessage(input)
    await pushMessages(lineUserId, [flex])
}
