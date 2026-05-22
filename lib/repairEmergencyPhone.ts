function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

/** LIFF/API 保存前: 緊急連絡先を customer_phone に集約 */
export function normalizeRepairEmergencyPhones<T extends {
    customer_phone: string | null
    customer_mobile: string | null
}>(fields: T): T {
    const phoneMain = trim(fields.customer_phone)
    const phoneMobile = trim(fields.customer_mobile)
    const main = phoneMain || phoneMobile
    const mobile = phoneMain && phoneMobile ? phoneMobile : null
    return {
        ...fields,
        customer_phone: main || null,
        customer_mobile: mobile,
    }
}

export function validateRepairEmergencyPhone(fields: {
    customer_phone: string | null
    customer_mobile: string | null
}): string | null {
    const phoneMain = trim(fields.customer_phone)
    const phoneMobile = trim(fields.customer_mobile)
    if (!phoneMain && !phoneMobile) {
        return '緊急時連絡先の電話番号を入力してください'
    }
    return null
}
