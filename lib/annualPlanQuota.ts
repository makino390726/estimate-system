import { supabase } from '@/lib/supabaseClient'
import { PROGRESS_CATEGORIES } from '@/lib/annualPlanCategories'
import { BRANCHES } from '@/lib/branches'

export const QUOTA_CATEGORIES = PROGRESS_CATEGORIES

export const QUOTA_OFFICES = BRANCHES.map((b) => ({ key: b.id, label: b.name }))

export type OfficeQuotaStatus = 'draft' | 'confirmed'

export type OfficeQuotaYear = {
  fiscal_year: number
  status: OfficeQuotaStatus
  confirmed_at: string | null
}

export type OfficeQuotaLine = {
  office_key: string
  plan_category: string
  amount: number
}

export type OfficeQuotaAllocation = {
  office_key: string
  staff_id: string
  amount: number
}

export type OfficeQuotaBundle = {
  year: OfficeQuotaYear | null
  lines: OfficeQuotaLine[]
  allocations: OfficeQuotaAllocation[]
}

export function parseQuotaAmount(value: string): number {
  const s = String(value || '')
    .replace(/,/g, '')
    .replace(/円/g, '')
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN
}

export function emptyQuotaAmounts(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const office of QUOTA_OFFICES) {
    out[office.key] = {}
    for (const cat of QUOTA_CATEGORIES) out[office.key][cat] = ''
  }
  return out
}

export function amountsFromLines(lines: OfficeQuotaLine[]): Record<string, Record<string, string>> {
  const out = emptyQuotaAmounts()
  for (const line of lines) {
    if (!out[line.office_key]) continue
    const n = Math.round(Number(line.amount || 0))
    out[line.office_key][line.plan_category] = n > 0 ? String(n) : ''
  }
  return out
}

export function officeQuotaTotal(lines: OfficeQuotaLine[], officeKey: string): number {
  return lines
    .filter((l) => l.office_key === officeKey)
    .reduce((s, l) => s + Math.round(Number(l.amount || 0)), 0)
}

export function quotaTotalsByOffice(lines: OfficeQuotaLine[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of lines) {
    out[line.office_key] = (out[line.office_key] || 0) + Math.round(Number(line.amount || 0))
  }
  return out
}

export function companyQuotaTotal(lines: OfficeQuotaLine[]): number {
  return lines.reduce((s, l) => s + Math.round(Number(l.amount || 0)), 0)
}

export function allocationTotalForOffice(allocations: OfficeQuotaAllocation[], officeKey: string): number {
  return allocations
    .filter((a) => a.office_key === officeKey)
    .reduce((s, a) => s + Math.round(Number(a.amount || 0)), 0)
}

export function allocationForStaff(
  allocations: OfficeQuotaAllocation[],
  staffId: string,
): OfficeQuotaAllocation | undefined {
  return allocations.find((a) => a.staff_id === staffId)
}

function mapLines(
  rows: Array<{ office_key?: string; plan_category?: string; amount?: number | string | null }>,
): OfficeQuotaLine[] {
  return rows.map((r) => ({
    office_key: String(r.office_key || ''),
    plan_category: String(r.plan_category || ''),
    amount: Math.round(Number(r.amount || 0)),
  }))
}

function mapAllocations(
  rows: Array<{ office_key?: string; staff_id?: string; amount?: number | string | null }>,
): OfficeQuotaAllocation[] {
  return rows.map((r) => ({
    office_key: String(r.office_key || ''),
    staff_id: String(r.staff_id || ''),
    amount: Math.round(Number(r.amount || 0)),
  }))
}

export async function fetchOfficeQuotas(fiscalYear: number): Promise<OfficeQuotaBundle> {
  const yearRes = await supabase
    .from('annual_office_quota_years')
    .select('fiscal_year, status, confirmed_at')
    .eq('fiscal_year', fiscalYear)
    .maybeSingle()
  if (yearRes.error) throw new Error(yearRes.error.message)

  const [lineRes, allocRes] = await Promise.all([
    supabase
      .from('annual_office_quota_lines')
      .select('office_key, plan_category, amount')
      .eq('fiscal_year', fiscalYear),
    supabase
      .from('annual_office_quota_allocations')
      .select('office_key, staff_id, amount')
      .eq('fiscal_year', fiscalYear),
  ])
  if (lineRes.error) throw new Error(lineRes.error.message)
  if (allocRes.error) throw new Error(allocRes.error.message)

  return {
    year: yearRes.data
      ? {
          fiscal_year: Number(yearRes.data.fiscal_year),
          status: yearRes.data.status === 'confirmed' ? 'confirmed' : 'draft',
          confirmed_at: yearRes.data.confirmed_at || null,
        }
      : null,
    lines: mapLines(lineRes.data || []),
    allocations: mapAllocations(allocRes.data || []),
  }
}

async function ensureQuotaYear(fiscalYear: number): Promise<OfficeQuotaYear> {
  const existing = await supabase
    .from('annual_office_quota_years')
    .select('fiscal_year, status, confirmed_at')
    .eq('fiscal_year', fiscalYear)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) {
    return {
      fiscal_year: Number(existing.data.fiscal_year),
      status: existing.data.status === 'confirmed' ? 'confirmed' : 'draft',
      confirmed_at: existing.data.confirmed_at || null,
    }
  }
  const created = await supabase
    .from('annual_office_quota_years')
    .insert({ fiscal_year: fiscalYear, status: 'draft' })
    .select('fiscal_year, status, confirmed_at')
    .single()
  if (created.error) throw new Error(created.error.message)
  return {
    fiscal_year: Number(created.data.fiscal_year),
    status: 'draft',
    confirmed_at: created.data.confirmed_at || null,
  }
}

export async function saveOfficeQuotaGrid(
  fiscalYear: number,
  amounts: Record<string, Record<string, string>>,
): Promise<OfficeQuotaBundle> {
  const year = await ensureQuotaYear(fiscalYear)
  if (year.status === 'confirmed') throw new Error('確定済みです。改定してから保存してください。')

  const rows: Array<{ fiscal_year: number; office_key: string; plan_category: string; amount: number; updated_at: string }> =
    []
  for (const office of QUOTA_OFFICES) {
    for (const cat of QUOTA_CATEGORIES) {
      const raw = amounts[office.key]?.[cat] ?? ''
      const n = parseQuotaAmount(raw)
      if (!Number.isFinite(n)) throw new Error(`${office.label}の${cat}が数値ではありません。`)
      rows.push({
        fiscal_year: fiscalYear,
        office_key: office.key,
        plan_category: cat,
        amount: n,
        updated_at: new Date().toISOString(),
      })
    }
  }

  const { error } = await supabase.from('annual_office_quota_lines').upsert(rows, {
    onConflict: 'fiscal_year,office_key,plan_category',
  })
  if (error) throw new Error(error.message)

  await supabase
    .from('annual_office_quota_years')
    .update({ updated_at: new Date().toISOString() })
    .eq('fiscal_year', fiscalYear)

  return fetchOfficeQuotas(fiscalYear)
}

export async function saveOfficeQuotaAllocations(
  fiscalYear: number,
  officeKey: string,
  staffAmounts: Array<{ staff_id: string; amount: number }>,
): Promise<OfficeQuotaBundle> {
  const year = await ensureQuotaYear(fiscalYear)
  if (year.status === 'confirmed') throw new Error('確定済みです。改定してから保存してください。')

  const bundle = await fetchOfficeQuotas(fiscalYear)
  const cap = officeQuotaTotal(bundle.lines, officeKey)
  const sum = staffAmounts.reduce((s, r) => s + Math.round(Number(r.amount || 0)), 0)
  if (sum > cap) throw new Error('配分合計が営業所ノルマを超えています。')

  const { error: delError } = await supabase
    .from('annual_office_quota_allocations')
    .delete()
    .eq('fiscal_year', fiscalYear)
    .eq('office_key', officeKey)
  if (delError) throw new Error(delError.message)

  const rows = staffAmounts
    .map((r) => ({
      fiscal_year: fiscalYear,
      office_key: officeKey,
      staff_id: String(r.staff_id),
      amount: Math.round(Number(r.amount || 0)),
    }))
    .filter((r) => r.staff_id && r.amount > 0)
  if (rows.length > 0) {
    const { error } = await supabase.from('annual_office_quota_allocations').insert(rows)
    if (error) throw new Error(error.message)
  }

  return fetchOfficeQuotas(fiscalYear)
}

export async function confirmOfficeQuotas(fiscalYear: number): Promise<OfficeQuotaBundle> {
  await ensureQuotaYear(fiscalYear)
  const bundle = await fetchOfficeQuotas(fiscalYear)
  if (companyQuotaTotal(bundle.lines) <= 0) throw new Error('ノルマ合計が 0 のため確定できません。')
  const { error } = await supabase
    .from('annual_office_quota_years')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('fiscal_year', fiscalYear)
  if (error) throw new Error(error.message)
  return fetchOfficeQuotas(fiscalYear)
}

export async function reopenOfficeQuotas(fiscalYear: number): Promise<OfficeQuotaBundle> {
  await ensureQuotaYear(fiscalYear)
  const { error } = await supabase
    .from('annual_office_quota_years')
    .update({
      status: 'draft',
      confirmed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('fiscal_year', fiscalYear)
  if (error) throw new Error(error.message)
  return fetchOfficeQuotas(fiscalYear)
}

export function suggestAllocations(
  staffIds: string[],
  shares: Record<string, number>,
  officeTotal: number,
): Array<{ staff_id: string; amount: number }> {
  const ids = staffIds.filter(Boolean)
  if (ids.length === 0 || officeTotal <= 0) return []
  const weight = ids.map((id) => Math.max(0, Number(shares[id] || 0)))
  const sumW = weight.reduce((s, w) => s + w, 0)
  if (sumW <= 0) {
    const even = Math.floor(officeTotal / ids.length)
    return ids.map((id, i) => ({
      staff_id: id,
      amount: i === ids.length - 1 ? officeTotal - even * (ids.length - 1) : even,
    }))
  }
  const amounts = weight.map((w) => Math.round((w / sumW) * officeTotal))
  const drift = officeTotal - amounts.reduce((s, n) => s + n, 0)
  amounts[amounts.length - 1] += drift
  return ids.map((id, i) => ({ staff_id: id, amount: Math.max(0, amounts[i]) }))
}
