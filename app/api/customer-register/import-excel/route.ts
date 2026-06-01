import { NextResponse } from 'next/server'
import { parseCustomerRegisterWorkbook } from '@/lib/customerRegisterExcelImport'
import { upsertParsedCustomerRegisterRows } from '@/lib/customerRegisterExcelUpsert'
import type { SheetTypeValue } from '@/lib/customerRegisterSheetTypes'
import { getSupabaseAdmin, hasSupabaseServiceRole } from '@/lib/supabaseAdmin'

export const maxDuration = 120

export async function POST(req: Request) {
    try {
        const formData = await req.formData()
        const file = formData.get('file')
        if (!(file instanceof File)) {
            return NextResponse.json({ ok: false, error: 'Excelファイルがありません' }, { status: 400 })
        }

        const lower = file.name.toLowerCase()
        if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
            return NextResponse.json({ ok: false, error: '.xlsx または .xls を選択してください' }, { status: 400 })
        }

        const sheetTypeRaw = String(formData.get('sheet_type') || '').trim()
        const sheetTypeOverride = sheetTypeRaw ? (sheetTypeRaw as SheetTypeValue) : undefined

        const buffer = await file.arrayBuffer()
        const parsed = parseCustomerRegisterWorkbook(buffer, file.name, { sheetTypeOverride })

        if (parsed.rows.length === 0) {
            return NextResponse.json({
                ok: false,
                error: '取込対象のデータ行がありません',
                skipped: parsed.skipped,
                sheet_name: parsed.sheet_name,
                sheet_type: parsed.sheet_type,
            }, { status: 400 })
        }

        const sb = getSupabaseAdmin()
        const result = await upsertParsedCustomerRegisterRows(sb, parsed, { sourceFileName: file.name })

        return NextResponse.json({
            ok: true,
            using_service_role: hasSupabaseServiceRole(),
            batch_id: result.batch_id,
            file_name: file.name,
            sheet_name: parsed.sheet_name,
            sheet_type: parsed.sheet_type,
            header_row_index: parsed.header_row_index,
            total_parsed: parsed.rows.length,
            inserted: result.inserted,
            updated: result.updated,
            skipped: result.skipped,
            errors: result.errors,
            error_count: result.error_count,
        })
    } catch (e: unknown) {
        console.error('customer-register import-excel:', e)
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : 'Excel取込に失敗しました' },
            { status: 500 },
        )
    }
}
