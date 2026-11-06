import { factoryCategoryFor } from '@/lib/annualPlanCategories'
import { fetchPlanMachines } from '@/lib/annualPlanMachines'
import {
  assignmentMapKey,
  buildItemMonthProgress,
  type ActualTrace,
  type ItemMonthProgressResult,
  type SalesActualItemRow,
} from '@/lib/annualPlanItemProgress'
import { fetchStaffsForExcelMatch } from '@/lib/annualPlanSalesImport'
import { resolveExcelStaffId, resolveSalesActualStaffId } from '@/lib/annualPlanStaffMatch'
import { PURCHASING_EXCEL_STAFF_NAME, PURCHASING_OFFICE_LABEL } from '@/lib/branches'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchSupabasePages } from '@/lib/supabasePagedFetch'

export function isMissingPlanTableError(message: string): boolean {
  return /could not find the table/i.test(message) || /schema cache/i.test(message) || /does not exist/i.test(message)
}

export async function loadItemMonthProgress(
  fiscalYear: number,
  staffId: string,
  options?: { withTraces?: boolean },
): Promise<ItemMonthProgressResult & { traces: ActualTrace[]; assignmentsReady: boolean }> {
  const allStaff = staffId === 'all'
  const sb = getSupabaseAdmin()
  const staffs = await fetchStaffsForExcelMatch(sb)
  const purchasingStaffId = resolveExcelStaffId(PURCHASING_EXCEL_STAFF_NAME, staffs)

  type PlanLineRow = {
    category: string
    machine_code: string
    machine_name: string | null
    machine_source?: string | null
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
              .select('category, machine_code, machine_name, machine_source, qty, amount, change_kind')
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
        .select('category, machine_code, machine_name, machine_source, qty, amount, change_kind')
        .eq('plan_id', plan.id)
        .order('created_at', { ascending: true })
      if (lineError) throw new Error(lineError.message)
      lines = (lineRows || []) as PlanLineRow[]
    }
  }

  const extraCodesByMachine: Record<string, string[]> = {}
  const machineRank: Record<string, number> = {}
  const categories = [...new Set([...lines.map((l) => l.category), '暖房機', 'たばこ乾燥機'])]
  await Promise.all(
    categories.map(async (category) => {
      try {
        const { machines } = await fetchPlanMachines(category, { includePrices: false })
        const factory = factoryCategoryFor(category) || category
        machines.forEach((machine, index) => {
          const codes = machine.productCode ? [machine.productCode] : []
          extraCodesByMachine[machine.code] = [...new Set([...(extraCodesByMachine[machine.code] || []), ...codes])]
          extraCodesByMachine[`${category}:${machine.code}`] = extraCodesByMachine[machine.code]
          machineRank[`${factory}::${machine.code}`] = index
          machineRank[`${category}::${machine.code}`] = index
          if (machineRank[machine.code] == null) machineRank[machine.code] = index
        })
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
        .select(
          'billed_on, slip_no, product_code, product_name, customer_name, qty, amount_ex_tax, plan_category, department, staff_id, staff_name_raw',
        )
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
        .map((row) => {
          const effective = resolveSalesActualStaffId(
            {
              department: row.department,
              staff_name_raw: row.staff_name_raw,
              staff_id: row.staff_id,
            },
            staffs,
          )
          return {
            billed_on: row.billed_on ? String(row.billed_on).slice(0, 10) : null,
            slip_no: row.slip_no ? String(row.slip_no) : null,
            product_code: row.product_code ? String(row.product_code) : null,
            product_name: row.product_name ? String(row.product_name) : null,
            customer_name: row.customer_name ? String(row.customer_name) : null,
            qty: Number(row.qty || 0),
            amount_ex_tax: Number(row.amount_ex_tax || 0),
            plan_category: row.plan_category ? String(row.plan_category) : null,
            staff_id: allStaff ? effective || (row.staff_id ? String(row.staff_id) : '') : staffId,
          }
        })
    },
  })

  let assignmentsReady = true
  const assignments: Record<string, string> = {}
  const assignmentRows = await fetchSupabasePages<{
    staff_id: string
    line_fingerprint: string
    target_key: string
  }>({
    count: async () => {
      const { count, error } = await sb
        .from('annual_sales_actual_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('fiscal_year', fiscalYear)
      if (error) {
        if (isMissingPlanTableError(error.message)) {
          assignmentsReady = false
          return 0
        }
        throw new Error(error.message)
      }
      return count || 0
    },
    page: async (from, to) => {
      if (!assignmentsReady) return []
      const { data, error } = await sb
        .from('annual_sales_actual_assignments')
        .select('staff_id, line_fingerprint, target_key')
        .eq('fiscal_year', fiscalYear)
        .order('id', { ascending: true })
        .range(from, to)
      if (error) {
        if (isMissingPlanTableError(error.message)) {
          assignmentsReady = false
          return []
        }
        throw new Error(error.message)
      }
      return (data || []) as { staff_id: string; line_fingerprint: string; target_key: string }[]
    },
  }).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    if (isMissingPlanTableError(message)) {
      assignmentsReady = false
      return []
    }
    throw e
  })

  for (const row of assignmentRows) {
    const sid = String(row.staff_id || '')
    if (!allStaff && sid !== staffId) continue
    const key = String(row.target_key || '').trim()
    if (!key) continue
    assignments[assignmentMapKey(sid, String(row.line_fingerprint || ''))] = key
  }

  const traces: ActualTrace[] = []
  const result = buildItemMonthProgress(fiscalYear, lines, actuals, extraCodesByMachine, machineRank, {
    assignments,
    traces: options?.withTraces ? traces : undefined,
  })
  return { ...result, traces, assignmentsReady }
}
