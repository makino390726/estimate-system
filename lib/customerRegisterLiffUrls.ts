/** 顧客情報登録 LIFF（友だち追加・機械追加）の URL */

export function getCustomerRegisterLiffId(): string {
    return (process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER_REGISTER || '').trim()
}

export function buildCustomerRegisterLiffUrl(): string {
    const liffId = getCustomerRegisterLiffId()
    if (!liffId) return ''
    return `https://liff.line.me/${liffId}`
}
