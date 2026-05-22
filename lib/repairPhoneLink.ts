/** 担当者向け tel: リンク用 */

export function toTelHref(raw: string | null | undefined): string | null {
    const t = String(raw || '').trim()
    if (!t) return null
    const digits = t.replace(/[^\d+]/g, '')
    if (digits.replace(/\D/g, '').length < 9) return null
    return `tel:${digits}`
}

export type RepairPhoneEntry = { label: string; number: string }

/** 表示・発信用の電話番号一覧（緊急連絡先を先頭） */
export function collectRepairPhoneEntries(
    customerPhone: string | null | undefined,
    customerMobile: string | null | undefined,
): RepairPhoneEntry[] {
    const phone = String(customerPhone || '').trim()
    const mobile = String(customerMobile || '').trim()
    const out: RepairPhoneEntry[] = []

    if (phone) {
        out.push({ label: '緊急時連絡先', number: phone })
    }
    if (mobile && mobile !== phone) {
        out.push({ label: '追加の連絡先', number: mobile })
    }
    return out
}
