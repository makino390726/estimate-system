/** 顧客カルテ一覧の見出し（氏名・販売店/代理店） */
export function formatCustomerRegisterDisplayTitle(
    customerName: string | null | undefined,
    dealerName: string | null | undefined,
): string {
    const customer = String(customerName || '').trim()
    const dealer = String(dealerName || '').trim()
    if (customer && dealer) return `${customer}（${dealer}）`
    if (customer) return customer
    if (dealer) return dealer
    return '（氏名未設定）'
}
