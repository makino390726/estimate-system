import { buildCustomerRegisterLiffUrl } from '@/lib/customerRegisterLiffUrls'

/** 友だち追加時に送る「顧客情報登録」Flex（LIFF を開くボタン付き） */
export function buildCustomerRegisterInviteFlex(liffUrl: string) {
    return {
        type: 'flex' as const,
        altText: 'ご登録のお願い：お客様情報・保有機械の登録',
        contents: {
            type: 'bubble' as const,
            header: {
                type: 'box' as const,
                layout: 'vertical' as const,
                backgroundColor: '#047857',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text' as const,
                        text: '三州産業LIFE へようこそ',
                        color: '#ffffff',
                        weight: 'bold' as const,
                        size: 'lg' as const,
                    },
                    {
                        type: 'text' as const,
                        text: 'お客様情報のご登録をお願いします',
                        color: '#ffffffCC',
                        size: 'sm' as const,
                        margin: 'sm' as const,
                        wrap: true,
                    },
                ],
            },
            body: {
                type: 'box' as const,
                layout: 'vertical' as const,
                spacing: 'md' as const,
                paddingAll: '20px',
                backgroundColor: '#ffffff',
                contents: [
                    {
                        type: 'text' as const,
                        text: '保守・点検のご案内や修理受付をスムーズに行うため、氏名・連絡先・お持ちの機械（製造番号）をご登録ください。',
                        size: 'sm' as const,
                        color: '#374151',
                        wrap: true,
                    },
                    {
                        type: 'text' as const,
                        text: '※ 機械を複数台お持ちの場合も、1回の登録でまとめて追加できます。',
                        size: 'xs' as const,
                        color: '#6b7280',
                        wrap: true,
                        margin: 'md' as const,
                    },
                    {
                        type: 'button' as const,
                        action: {
                            type: 'uri' as const,
                            label: '登録フォームを開く',
                            uri: liffUrl,
                        },
                        style: 'primary' as const,
                        color: '#047857',
                        height: 'sm' as const,
                        margin: 'lg' as const,
                    },
                ],
            },
        },
    }
}

export function buildCustomerRegisterInviteFallbackText(liffUrl: string | null): string {
    const lines = [
        '友だち追加ありがとうございます。',
        '',
        '【お客様情報のご登録】',
        '氏名・電話・住所・お持ちの機械（製造番号）をご登録ください。',
        '複数台お持ちの場合もまとめて登録できます。',
    ]
    if (liffUrl) {
        lines.push('', '▼ 登録フォーム', liffUrl)
    } else {
        lines.push('', '（管理者: NEXT_PUBLIC_LIFF_ID_CUSTOMER_REGISTER の設定が必要です）')
    }
    lines.push('', '※ 社内担当者の方は「連携」と送信すると担当者登録の案内が届きます。')
    return lines.join('\n')
}

export function getCustomerRegisterInviteMessage(): { flex?: ReturnType<typeof buildCustomerRegisterInviteFlex>; text: string } {
    const liffUrl = buildCustomerRegisterLiffUrl()
    if (liffUrl) {
        return { flex: buildCustomerRegisterInviteFlex(liffUrl), text: buildCustomerRegisterInviteFallbackText(liffUrl) }
    }
    return { text: buildCustomerRegisterInviteFallbackText(null) }
}
