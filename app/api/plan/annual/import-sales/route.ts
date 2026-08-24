import { NextResponse } from 'next/server'
import { getSupabaseAdmin, hasSupabaseServiceRole } from '@/lib/supabaseAdmin'
import { parseSalesActualWorkbook } from '@/lib/annualPlanSalesExcel'
import { fetchStaffsForExcelMatch, replaceSalesActualsForYear } from '@/lib/annualPlanSalesImport'

export const runtime = 'nodejs'
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

    const fiscalYear = Number(formData.get('fiscal_year'))
    if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
      return NextResponse.json({ ok: false, error: '年度が不正です' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const parsed = parseSalesActualWorkbook(buffer, fiscalYear)
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: '取込対象の明細がありません。Sheet1（伝票NO・科目・税抜金額）か、年度の請求日範囲を確認してください。',
          skipped: parsed.skipped.slice(0, 20),
          skipped_count: parsed.skipped.length,
          sheet_name: parsed.sheet_name,
        },
        { status: 400 },
      )
    }

    const sb = getSupabaseAdmin()
    const staffs = await fetchStaffsForExcelMatch(sb)

    const result = await replaceSalesActualsForYear(sb, {
      fiscalYear,
      fileName: file.name,
      sheetName: parsed.sheet_name,
      skippedCount: parsed.skipped.length,
      rows: parsed.rows,
      staffs,
    })

    return NextResponse.json({
      ok: true,
      using_service_role: hasSupabaseServiceRole(),
      ...result,
      sheet_name: parsed.sheet_name,
      skipped_count: parsed.skipped.length,
      skipped_sample: parsed.skipped.slice(0, 15),
      kamoku_counts: parsed.kamoku_counts,
      amount_ex_tax_total: parsed.amount_ex_tax_total,
      amount_inc_tax_total: parsed.amount_inc_tax_total,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('annual sales import:', e)
    const missing =
      /could not find the table/i.test(message) ||
      /schema cache/i.test(message) ||
      /does not exist/i.test(message)
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? `売上実績テーブルがありません。Supabase で create_annual_sales_actual_tables.sql を実行してください。詳細: ${message}`
          : message,
      },
      { status: 500 },
    )
  }
}
