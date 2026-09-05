import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchPlanMachines } from '@/lib/annualPlanMachines'
import { buildItemMonthProgress, type SalesActualItemRow } from '@/lib/annualPlanItemProgress'
import { fetchStaffsForExcelMatch } from '@/lib/annualPlanSalesImport'
import { resolveExcelStaffId, resolveSalesActualStaffId } from '@/lib/annualPlanStaffMatch'
import { PURCHASING_EXCEL_STAFF_NAME, PURCHASING_OFFICE_LABEL } from '@/lib/branches'
import { readAnnualPlanCache, writeAnnualPlanCache } from '@/lib/annualPlanQueryCache'
import { fetchSupabasePages } from '@/lib/supabasePagedFetch'

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

    const cacheKey = `item-progress-v3:${fiscalYear}:${allStaff ? 'all' : staffId}`
    const cached = readAnnualPlanCache<Record<string, unknown>>(cacheKey)
    if (cached) return NextResponse.json({ ok: true, ...cached })

    const sb = getSupabaseAdmin()
    const staffs = await fetchStaffsForExcelMatch(sb)
    const purchasingStaffId = resolveExcelStaffId(PURCHASING_EXCEL_STAFF_NAME, staffs)

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
      const chunks: string[][] = []
      for (let i = 0; i < planIds.length; i += 100) chunks.push(planIds.slice(i, i + 100))
      const chunkRows = await Promise.all(
        chunks.map((chunk) =>
          fetchSupabasePages<PlanLineRow>({
            count: async () => {
              const { count, error } = await sb
                .from('annual_staff_plan_lines')
                .select('id', { count: 'exact', head: true })
                .in('plan_id', chunk)
              if (error) throw new Error(error.message)
              return count || 0
            },
            page: async (from, to) => {
              const { data, error } = await sb
                .from('annual_staff_plan_lines')
                .select('category, machine_code, machine_name, qty, amount, change_kind')
                .in('plan_id', chunk)
                .order('id', { ascending: true })
                .range(from, to)
              if (error) throw new Error(error.message)
              return (data || []) as PlanLineRow[]
            },
          }),
        ),
      )
      lines = chunkRows.flat()
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
          .select('category, machine_code, machine_name, qty, amount, change_kind')
          .eq('plan_id', plan.id)
          .order('created_at', { ascending: true })
        if (lineError) throw new Error(lineError.message)
        lines = (lineRows || []) as PlanLineRow[]
      }
    }

    const extraCodesByMachine: Record<string, string[]> = {}
    const categories = [...new Set(lines.map((l) => l.category))]
    await Promise.all(
      categories.map(async (category) => {
        try {
          const { machines } = await fetchPlanMachines(category, { includePrices: false })
          for (const machine of machines) {
            const codes = [machine.productCode, machine.code].filter((v): v is string => Boolean(v))
            extraCodesByMachine[machine.code] = [...new Set([...(extraCodesByMachine[machine.code] || []), ...codes])]
            extraCodesByMachine[`${category}:${machine.code}`] = extraCodesByMachine[machine.code]
          }
        } catch {
          // 機種マスタが読めなくても品名・CDの突合は続ける
        }
      }),
    )

    const applyStaffScope = <T extends { eq: (col: string, val: string) => T; or: (filter: string) => T }>(
      query: T,
    ): T => {
      if (allStaff) return query
      const selected = staffs.find((s) => s.id === staffId)
      const surname = String(selected?.name || '').replace(/[\s　].*$/, '').trim()
      if (purchasingStaffId && staffId === purchasingStaffId) {
        return query.or(
          [
            `staff_id.eq.${staffId}`,
            `department.eq."${PURCHASING_OFFICE_LABEL}"`,
            'department.eq.管理部',
            'department.eq.管理',
            'department.eq.農材',
            'department.eq.燃料',
            'department.eq.購買',
            'staff_name_raw.ilike.%大倉野%',
            'staff_name_raw.ilike.%スタンド%',
            'staff_name_raw.ilike.%大迫%',
          ].join(','),
        )
      }
      if (surname.length >= 2) {
        return query.or(`staff_id.eq.${staffId},staff_name_raw.ilike.%${surname}%`)
      }
      return query.eq('staff_id', staffId)
    }

    const actuals = await fetchSupabasePages<SalesActualItemRow>({
      count: async () => {
        let query = sb
          .from('annual_sales_actual_lines')
          .select('id', { count: 'exact', head: true })
          .eq('fiscal_year', fiscalYear)
        query = applyStaffScope(query)
        const { count, error } = await query
        if (error) throw new Error(error.message)
        return count || 0
      },
      page: async (from, to) => {
        let query = sb
          .from('annual_sales_actual_lines')
          .select('billed_on, product_code, product_name, qty, amount_ex_tax, plan_category, department, staff_id, staff_name_raw')
          .eq('fiscal_year', fiscalYear)
        query = applyStaffScope(query)
        const { data, error } = await query.order('id', { ascending: true }).range(from, to)
        if (error) throw new Error(error.message)
        return (data || [])
          .filter((row) => {
            if (allStaff) return true
            const effective = resolveSalesActualStaffId(
              {
                department: row.department,
                staff_name_raw: row.staff_name_raw,
                staff_id: row.staff_id,
              },
              staffs,
            )
            return effective === staffId
          })
          .map((row) => ({
            billed_on: row.billed_on ? String(row.billed_on).slice(0, 10) : null,
            product_code: row.product_code ? String(row.product_code) : null,
            product_name: row.product_name ? String(row.product_name) : null,
            qty: Number(row.qty || 0),
            amount_ex_tax: Number(row.amount_ex_tax || 0),
            plan_category: row.plan_category ? String(row.plan_category) : null,
          }))
      },
    })

    const result = buildItemMonthProgress(fiscalYear, lines, actuals, extraCodesByMachine)
    writeAnnualPlanCache(cacheKey, result)
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
