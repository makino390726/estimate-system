import { getRepairDetailUrl } from '@/lib/repairDetailUrl'
import { formatRepairCategoryDisplay } from '@/lib/customerRegisterSheetTypes'
import { getBranchName } from '@/lib/branches'

export type StaffRepairLineNotify = {
    repairRequestId: string
    requestNo: number
    customerName: string
    symptom: string
    priority: string
    model?: string | null
    category?: string | null
    customerAddress?: string | null
    customerPhone?: string | null
    customerMobile?: string | null
    customerRegion?: string | null
    assignedBranch?: string | null
    assignedStaff?: string | null
    photoCount?: number
}

function clip(text: string, max: number) {
    const t = text.trim()
    if (t.length <= max) return t
    return `${t.slice(0, max - 1)}…`
}

function phoneLine(phone?: string | null, mobile?: string | null) {
    const parts: string[] = []
    if (phone?.trim()) parts.push(`TEL ${phone.trim()}`)
    if (mobile?.trim()) parts.push(`携帯 ${mobile.trim()}`)
    return parts.join(' / ') || '—'
}

/** 担当者向け Flex（案件詳細リンク付き） */
export function buildStaffRepairNotifyFlex(input: StaffRepairLineNotify) {
    const priorityLabel: Record<string, string> = {
        urgent: '🔴 緊急',
        high: '🟠 高',
        normal: '🔵 通常',
        low: '⚪ 低',
    }
    const detailUrl = getRepairDetailUrl(input.repairRequestId)
    const symptomText = clip(
        input.photoCount && input.photoCount > 0
            ? `${input.symptom}\n（写真 ${input.photoCount} 枚）`
            : input.symptom,
        120,
    )

    const row = (label: string, value: string) => ({
        type: 'box' as const,
        layout: 'horizontal' as const,
        contents: [
            { type: 'text' as const, text: label, color: '#8c8c8c', size: 'sm' as const, flex: 3 },
            { type: 'text' as const, text: value, size: 'sm' as const, flex: 5, wrap: true },
        ],
    })

    const bodyRows = [
        row('受付番号', `#${input.requestNo}`),
        row('優先度', priorityLabel[input.priority] || input.priority),
        row('顧客名', input.customerName || '—'),
        row('連絡先', phoneLine(input.customerPhone, input.customerMobile)),
        ...(input.customerAddress?.trim()
            ? [row('住所', clip(input.customerAddress, 80))]
            : []),
        ...(input.customerRegion?.trim()
            ? [row('地域', input.customerRegion.trim())]
            : []),
        ...(input.category
            ? [row('分野', formatRepairCategoryDisplay(input.category))]
            : []),
        ...(input.model?.trim() ? [row('型式', input.model.trim())] : []),
        ...(input.assignedStaff?.trim()
            ? [row('担当', input.assignedStaff.trim())]
            : []),
        ...(input.assignedBranch?.trim()
            ? [row('営業所', getBranchName(input.assignedBranch) || input.assignedBranch)]
            : []),
        row('症状', symptomText),
    ]

    return {
        type: 'flex' as const,
        altText: `【修理受付】#${input.requestNo} ${input.customerName}様`,
        contents: {
            type: 'bubble' as const,
            header: {
                type: 'box' as const,
                layout: 'vertical' as const,
                backgroundColor: '#1e40af',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text' as const,
                        text: '新規修理受付',
                        color: '#ffffff',
                        weight: 'bold' as const,
                        size: 'lg' as const,
                    },
                ],
            },
            body: {
                type: 'box' as const,
                layout: 'vertical' as const,
                spacing: 'md' as const,
                contents: bodyRows,
            },
            footer: {
                type: 'box' as const,
                layout: 'vertical' as const,
                spacing: 'sm' as const,
                contents: [
                    {
                        type: 'button' as const,
                        style: 'primary' as const,
                        color: '#2563eb',
                        action: {
                            type: 'uri' as const,
                            label: '案件詳細を開く',
                            uri: detailUrl,
                        },
                    },
                    {
                        type: 'text' as const,
                        text: '顧客情報の追記・顧客登録は管理画面の案件詳細から行えます',
                        size: 'xxs' as const,
                        color: '#8c8c8c',
                        wrap: true,
                        margin: 'md' as const,
                    },
                ],
            },
        },
    }
}
