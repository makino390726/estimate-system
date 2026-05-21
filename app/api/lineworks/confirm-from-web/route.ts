import { NextResponse } from 'next/server'
import { confirmRepairLineWorksFromWeb } from '@/lib/repairLineWorksNotify'

export const runtime = 'nodejs'

type Body = { repair_request_id?: string }

/** 案件画面でステータスを「担当者確認」にしたあと、LINE WORKS へ確認メッセージを送る */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Body
        const repairRequestId = trim(body.repair_request_id)
        if (!repairRequestId) {
            return NextResponse.json({ ok: false, error: 'repair_request_id is required' }, { status: 400 })
        }

        const result = await confirmRepairLineWorksFromWeb(repairRequestId)
        if (!result.ok && !result.skipped) {
            return NextResponse.json(result, { status: 500 })
        }
        return NextResponse.json(result)
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}
