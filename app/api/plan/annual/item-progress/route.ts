import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchPlanMachines } from '@/lib/annualPlanMachines'
import { buildItemMonthProgress, type SalesActualItemRow } from '@/lib/annualPlanItemProgress'
import { fetchStaffsForExcelMatch, rematchUnmatchedSalesActualStaff } from '@/lib/annualPlanSalesImport'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fiscalYear = Number(url.searchParams.get('fy'))
    const staffId = String(url.searchParams.get('staff') || '').trim()
    const allStaff = staffId === 'all'
    if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
      return NextResponse.json({ ok: false, error: 'fy が不正です' }, { status: 400 })
    }
    if (!allStaff && !staffId) {
      return NextResponse.json({ ok: false, error: 'staff は必須です' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    try {
      const staffs = await fetchStaffsForExcelMatch(sb)
      await rematchUnmatchedSalesActualStaff(sb, fiscalYear, staffs)
    } catch (e) {
      console.error('annual item-progress rematch:', e)
    }

    type PlanLineRow = {
      category: string
      machine_code: string
      machine_name: string | null
      qty: number
      amount: number
      change_kind?: string | null
    }
    let lines: PlanLineRow[] = []
    if (allStaff) {
      const { data: plans, error: planError } = await sb
        .from('annual_staff_plans')
        .select('id')
        .eq('fiscal_year', fiscalYear)
      if (planError) throw new Error(planError.message)
      const planIds = (plans || []).map((p) => String(p.id))
      for (let i = 0; i < planIds.length; i += 100) {
        const chunk = planIds.slice(i, i + 100)
        let offset = 0
        while (true) {
          const { data: lineRows, error: lineError } = await sb
            .from('annual_staff_plan_lines')
            .select('category, machine_code, machine_name, qty, amount, change_kind')
            .in('plan_id', chunk)
            .order('id', { ascending: true })
            .range(offset, offset + 999)
          if (lineError) throw new Error(lineError.message)
          const rows = (lineRows || []) as PlanLineRow[]
          lines.push(...rows)
          if (rows.length < 1000) break
          offset += 1000
        }
      }
    } else {
      const { data: plan, error: planError } = await sb
        .from('annual_staff_plans')
        .select('id')
        .eq('fiscal_year', fiscalYear)
        .eq('staff_id', staffId)
        .maybeSingle()
      if (planError) throw new Error(planError.message)
      if (plan?.id) {
        const { data: lineRows, error: lineError } = await sb
          .from('annual_staff_plan_lines')
          .select('*')
          .eq('plan_id', plan.id)
          .order('created_at', { ascending: true })
        if (lineError) throw new Error(lineError.message)
        lines = (lineRows || []) as PlanLineRow[]
      }
    }

    const extraCodesByMachine: Record<string, string[]> = {}
    const categories = [...new Set(lines.map((l) => l.category))]
    for (const category of categories) {
      try {
        const { machines } = await fetchPlanMachines(category)
        for (const machine of machines) {
          const codes = [machine.productCode, machine.code].filter((v): v is string => Boolean(v))
          extraCodesByMachine[machine.code] = [...new Set([...(extraCodesByMachine[machine.code] || []), ...codes])]
          extraCodesByMachine[`${category}:${machine.code}`] = extraCodesByMachine[machine.code]
        }
      } catch {
        // 機種マスタが読めなくても品名・CDの突合は続ける
      }
    }

    const actuals: SalesActualItemRow[] = []
    const pageSize = 1000
    let offset = 0
    while (true) {
      let query = sb
        .from('annual_sales_actual_lines')
        .select('id, billed_on, product_code, product_name, qty, amount_ex_tax, plan_category')
        .eq('fiscal_year', fiscalYear)
      if (!allStaff) query = query.eq('staff_id', staffId)
      const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + pageSize - 1)
      if (error) throw new Error(error.message)
      const rows = data || []
      for (const row of rows) {
        actuals.push({
          billed_on: row.billed_on ? String(row.billed_on).slice(0, 10) : null,
          product_code: row.product_code ? String(row.product_code) : null,
          product_name: row.product_name ? String(row.product_name) : null,
          qty: Number(row.qty || 0),
          amount_ex_tax: Number(row.amount_ex_tax || 0),
          plan_category: row.plan_category ? String(row.plan_category) : null,
        })
      }
      if (rows.length < pageSize) break
      offset += pageSize
    }

    const result = buildItemMonthProgress(fiscalYear, lines, actuals, extraCodesByMachine)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const missing =
      /could not find the table/i.test(message) ||
      /schema cache/i.test(message) ||
      /does not exist/i.test(message)
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? '売上実績または計画テーブルがありません。Supabase で年度計画用SQLを実行してください。'
          : message,
      },
      { status: missing ? 404 : 500 },
    )
  }
}
