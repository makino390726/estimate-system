'use client'

/**
 * AI診断（リッチメニュー用）
 * LINE Developers: Endpoint URL = https://<本番ドメイン>/liff/ai
 * リッチメニュー: https://liff.line.me/<AI用LIFF_ID>
 */
import { Suspense } from 'react'
import RepairFormPage from '../repair-form/page'

export default function LiffAiPage() {
    return (
        <Suspense fallback={null}>
            <RepairFormPage />
        </Suspense>
    )
}
