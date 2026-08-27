'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  fetchAllLinesForPlans,
  fetchAllPlansForYear,
  fetchClosedAmountByStaff,
  fetchPlanStaffs,
  fetchSalesActualSummary,
  formatPlanDbError,
  importSalesActualExcel,
  lineTotals,
  splitPlanTotals,
  currentPlanLines,
  fetchItemMonthProgress,
  type AnnualPlan,
  type AnnualPlanLine,
  type SalesActualSummary,
  type StaffOption,
} from '@/lib/annualPlanClient'
import {
  fiscalElapsedPct,
  fiscalYearFromDate,
  fiscalYearLabel,
  fiscalYearOptions,
} from '@/lib/annualPlanFiscal'
import {
  FACTORY_PRODUCT_CATEGORIES,
  AMOUNT_ONLY_CATEGORIES,
  CHANGE_KIND_LABEL,
  LUMP_MACHINE_CODE,
  OTHER_CODE_RANGE_CAPTION,
  PROGRESS_CATEGORIES,
  displayPlanCategory,
  formatPlanMachineLabel,
  isProductionPlanCategory,
  lineChangeKind,
  progressCategoryFor,
  progressCategoryLabel,
} from '@/lib/annualPlanCategories'
import {
  planBtn,
  planInput,
  planMuted,
  planPageStyle,
  planPanel,
  planTd,
  planTh,
} from '@/lib/annualPlanUi'
import { AnnualItemMonthProgress } from '@/components/AnnualItemMonthProgress'
import { AnnualInitialLineTotals } from '@/components/AnnualInitialLineTotals'
import type { ItemMonthProgressResult } from '@/lib/annualPlanItemProgress'
import { compareSalesOfficeLabel, officeKeyFromLabel, salesOfficeLabelFromStaff } from '@/lib/branches'
import {
  allocationForStaff,
  allocationTotalForOffice,
  companyQuotaTotal,
  fetchOfficeQuotas,
  quotaTotalsByOffice,
  type OfficeQuotaBundle,
} from '@/lib/annualPlanQuota'

function yen(v: number) {
  return `${Math.round(v).toLocaleString('ja-JP')} 円`
}

function pct(n: number, d: number) {
  if (d <= 0) return '—'
  return `${Math.round((n / d) * 100)}%`
}

function pctNum(n: number, d: number) {
  if (d <= 0) return 0
  return Math.round((n / d) * 100)
}

function DualMeter(props: { closed: number; excel: number; plan: number; elapsed: number }) {
  const closedPct = Math.min(pctNum(props.closed, props.plan), 100)
  const excelPct = Math.min(pctNum(props.excel, props.plan), 100)
  const elapsed = Math.min(Math.max(props.elapsed, 0), 100)
  const marker = (
    <div
      title={`経過 ${elapsed}%`}
      style={{
        position: 'absolute',
        left: `${elapsed}%`,
        top: 0,
        bottom: 0,
        width: 2,
        background: '#38bdf8',
        transform: 'translateX(-1px)',
      }}
    />
  )
  return (
    <div style={{ ...planPanel, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <span>見積成約 {pct(props.closed, props.plan)} / Excel {pct(props.excel, props.plan)} / 経過 {elapsed}%</span>
        <span>
          {yen(props.closed)} / {yen(props.excel)} / 当初計画 {yen(props.plan)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 14, background: '#1e293b', borderRadius: 4, overflow: 'hidden', border: '1px solid #334155', marginBottom: 6 }}>
        <div style={{ width: `${closedPct}%`, height: '100%', background: '#64748b' }} />
        {marker}
      </div>
      <div style={{ position: 'relative', height: 14, background: '#1e293b', borderRadius: 4, overflow: 'hidden', border: '1px solid #334155' }}>
        <div style={{ width: `${excelPct}%`, height: '100%', background: '#22c55e' }} />
        {marker}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, ...planMuted }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#64748b', marginRight: 6 }} />
          上段 見積成約（受注・注文・完了）
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', marginRight: 6 }} />
          下段 Excel税抜
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#38bdf8', marginRight: 6 }} />
          年度の経過
        </span>
      </div>
    </div>
  )
}

function ProgressBars(props: {
  title: string
  caption: string
  rows: Array<{ label: string; plan: number; closed: number; excel: number }>
}) {
  const max = Math.max(...props.rows.map((r) => Math.max(r.plan, r.closed, r.excel)), 1)
  return (
    <div style={{ ...planPanel, padding: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#f8fafc' }}>{props.title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {props.rows.map((r) => (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 13 }}>
              <span>{r.label}</span>
              <span style={planMuted}>
                計画 {yen(r.plan)} · 見積 {yen(r.closed)} · Excel {yen(r.excel)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.plan / max) * 100}%`, height: '100%', background: '#94a3b8' }} />
              </div>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.closed / max) * 100}%`, height: '100%', background: '#64748b' }} />
              </div>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.excel / max) * 100}%`, height: '100%', background: '#22c55e' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ ...planMuted, fontSize: 12, margin: '10px 0 0' }}>{props.caption}</p>
    </div>
  )
}

function GroupedBars(props: {
  title: string
  caption: string
  rows: Array<{ key?: string; label: string; plan: number; weighted: number; excel: number }>
}) {
  const max = Math.max(...props.rows.map((r) => Math.max(r.plan, r.weighted, r.excel)), 1)
  return (
    <div style={{ ...planPanel, padding: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#f8fafc' }}>{props.title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {props.rows.map((r) => (
          <div key={r.key || r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 13 }}>
              <span>{r.label}</span>
              <span style={planMuted}>
                計画 {yen(r.plan)} · 見込 {yen(r.weighted)} · Excel {yen(r.excel)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.plan / max) * 100}%`, height: '100%', background: '#94a3b8' }} />
              </div>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.weighted / max) * 100}%`, height: '100%', background: '#38bdf8' }} />
              </div>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.excel / max) * 100}%`, height: '100%', background: '#22c55e' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, flexWrap: 'wrap', ...planMuted }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#94a3b8', marginRight: 6 }} />
          上段 計画額
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#38bdf8', marginRight: 6 }} />
          中段 確度見込
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', marginRight: 6 }} />
          下段 Excel税抜
        </span>
      </div>
      <p style={{ ...planMuted, fontSize: 12, margin: '8px 0 0' }}>{props.caption}</p>
    </div>
  )
}

function mergeStaffExcelByCategory(
  staffIds: string[],
  byStaffCategory: Record<string, Record<string, number>>,
) {
  const out: Record<string, number> = {}
  for (const id of staffIds) {
    const cats = byStaffCategory[id] || {}
    for (const [cat, amt] of Object.entries(cats)) {
      out[cat] = (out[cat] || 0) + Number(amt || 0)
    }
  }
  return out
}

function qtyByConfidence(lines: AnnualPlanLine[]) {
  return {
    high: lines.filter((l) => l.confidence === 'high').reduce((s, r) => s + Number(r.qty || 0), 0),
    mid: lines.filter((l) => l.confidence === 'mid').reduce((s, r) => s + Number(r.qty || 0), 0),
    low: lines.filter((l) => l.confidence === 'low').reduce((s, r) => s + Number(r.qty || 0), 0),
  }
}

function machineKey(line: AnnualPlanLine) {
  return `${displayPlanCategory(line.category)}::${lineChangeKind(line)}::${line.machine_code}::${line.machine_name || ''}`
}

function AnnualDashboardContent() {
  const searchParams = useSearchParams()
  const [fiscalYear, setFiscalYear] = useState(() => {
    const q = Number(searchParams.get('fy'))
    return Number.isFinite(q) && q > 2000 ? q : fiscalYearFromDate()
  })
  const [staffs, setStaffs] = useState<StaffOption[]>([])
  const [plans, setPlans] = useState<AnnualPlan[]>([])
  const [lines, setLines] = useState<AnnualPlanLine[]>([])
  const [closedByStaff, setClosedByStaff] = useState<Map<string, { amount: number; count: number }>>(new Map())
  const [sales, setSales] = useState<SalesActualSummary>({
    byStaff: {},
    byCategory: {},
    byStaffCategory: {},
    unmatchedAmount: 0,
    totalAmount: 0,
    import: null,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [salesLoading, setSalesLoading] = useState(false)
  const [machineExcelLoading, setMachineExcelLoading] = useState(false)
  const loadIdRef = useRef(0)
  const [machineCategory, setMachineCategory] = useState('すべて')
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [itemStaffId, setItemStaffId] = useState(() => searchParams.get('staff') || '')
  const [itemProgress, setItemProgress] = useState<ItemMonthProgressResult | null>(null)
  const [itemProgressLoading, setItemProgressLoading] = useState(false)
  const [companyItemProgress, setCompanyItemProgress] = useState<ItemMonthProgressResult | null>(null)
  const [lineOfficeKey, setLineOfficeKey] = useState('all')
  const [quotas, setQuotas] = useState<OfficeQuotaBundle>({ year: null, lines: [], allocations: [] })
  const [quotaWarning, setQuotaWarning] = useState('')

  const loadDashboard = useCallback(async () => {
    const loadId = ++loadIdRef.current
    const alive = () => loadId === loadIdRef.current
    setLoading(true)
    setSalesLoading(true)
    setMachineExcelLoading(true)
    setError('')
    setQuotaWarning('')
    const emptySales: SalesActualSummary = {
      byStaff: {},
      byCategory: {},
      byStaffCategory: {},
      unmatchedAmount: 0,
      totalAmount: 0,
      import: null,
    }
    const salesPromise = fetchSalesActualSummary(fiscalYear).catch((e) => {
      const message = e instanceof Error ? e.message : String(e)
      if (!/売上実績テーブル/i.test(message) && alive()) setError(formatPlanDbError(message))
      return emptySales
    })
    const companyPromise = fetchItemMonthProgress(fiscalYear, 'all').catch(() => null)
    try {
      const [staffList, planList, closed] = await Promise.all([
        fetchPlanStaffs(),
        fetchAllPlansForYear(fiscalYear),
        fetchClosedAmountByStaff(fiscalYear),
      ])
      if (!alive()) return
      const salesStaffIds = new Set(staffList.map((s) => s.id))
      const salesPlans = planList.filter((p) => salesStaffIds.has(String(p.staff_id)))
      setStaffs(staffList)
      setPlans(salesPlans)
      setClosedByStaff(closed)
      const lineList = await fetchAllLinesForPlans(salesPlans.map((p) => p.id))
      if (!alive()) return
      setLines(lineList)
      try {
        const quotaBundle = await fetchOfficeQuotas(fiscalYear)
        if (!alive()) return
        setQuotas(quotaBundle)
      } catch (e) {
        if (!alive()) return
        setQuotas({ year: null, lines: [], allocations: [] })
        setQuotaWarning(formatPlanDbError(e instanceof Error ? e.message : String(e)))
      }
      setLoading(false)
      const [salesResult, companyResult] = await Promise.all([salesPromise, companyPromise])
      if (!alive()) return
      setSales(salesResult)
      setCompanyItemProgress(companyResult)
    } catch (e) {
      if (!alive()) return
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
      setPlans([])
      setLines([])
    } finally {
      if (alive()) {
        setLoading(false)
        setSalesLoading(false)
        setMachineExcelLoading(false)
      }
    }
  }, [fiscalYear])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (staffs.length === 0) {
      if (itemStaffId) setItemStaffId('')
      return
    }
    if (!staffs.some((s) => s.id === itemStaffId)) setItemStaffId(staffs[0].id)
  }, [itemStaffId, staffs])

  useEffect(() => {
    if (!itemStaffId) {
      setItemProgress(null)
      return
    }
    let cancelled = false
    setItemProgressLoading(true)
    void (async () => {
      try {
        const next = await fetchItemMonthProgress(fiscalYear, itemStaffId)
        if (!cancelled) setItemProgress(next)
      } catch {
        if (!cancelled) setItemProgress(null)
      } finally {
        if (!cancelled) setItemProgressLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fiscalYear, itemStaffId, sales.import?.imported_at])

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    setImportMessage('')
    try {
      const result = await importSalesActualExcel(fiscalYear, file)
      setImportMessage(
        `取込完了 ${result.inserted.toLocaleString('ja-JP')}行 · 税抜合計 ${Math.round(Number(result.amount_ex_tax_total || 0)).toLocaleString('ja-JP')}円（担当未割当 ${result.unmatched_staff}件 / スキップ ${result.skipped_count}件）`,
      )
      setSales(await fetchSalesActualSummary(fiscalYear))
      try {
        setCompanyItemProgress(await fetchItemMonthProgress(fiscalYear, 'all'))
      } catch {
        setCompanyItemProgress(null)
      }
    } catch (e) {
      setImportMessage(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setImporting(false)
    }
  }

  const planByStaff = useMemo(() => {
    const map = new Map<string, { plan: AnnualPlan; lines: AnnualPlanLine[] }>()
    for (const plan of plans) {
      map.set(plan.staff_id, { plan, lines: [] })
    }
    for (const line of lines) {
      const plan = plans.find((p) => p.id === line.plan_id)
      if (!plan) continue
      const row = map.get(plan.staff_id)
      if (row) row.lines.push(line)
    }
    return map
  }, [plans, lines])

  const officeRows = useMemo(() => {
    const quotaByOffice = quotaTotalsByOffice(quotas.lines)
    const map = new Map<
      string,
      {
        key: string
        label: string
        staffs: StaffOption[]
        initial: number
        current: number
        closed: number
        excel: number
        quota: number
      }
    >()
    for (const staff of staffs) {
      const label = salesOfficeLabelFromStaff(staff)
      const t = splitPlanTotals(planByStaff.get(staff.id)?.lines || [])
      const officeKey = officeKeyFromLabel(label)
      const prev = map.get(label) || {
        key: label,
        label,
        staffs: [],
        initial: 0,
        current: 0,
        closed: 0,
        excel: 0,
        quota: officeKey ? quotaByOffice[officeKey] || 0 : 0,
      }
      prev.staffs.push(staff)
      prev.initial += t.initial.amount
      prev.current += t.current.amount
      prev.closed += closedByStaff.get(staff.id)?.amount || 0
      prev.excel += sales.byStaff[staff.id] || 0
      map.set(label, prev)
    }
    return [...map.values()].sort((a, b) => compareSalesOfficeLabel(a.label, b.label))
  }, [staffs, planByStaff, closedByStaff, sales.byStaff, quotas.lines])

  const selectedOffice = officeRows.find((o) => o.key === lineOfficeKey)
  const officeLineLines = selectedOffice
    ? selectedOffice.staffs.flatMap((s) => planByStaff.get(s.id)?.lines || [])
    : lines
  const officeLineExcel = selectedOffice
    ? mergeStaffExcelByCategory(
        selectedOffice.staffs.map((s) => s.id),
        sales.byStaffCategory,
      )
    : sales.byCategory

  const companyLines = lines
  const companySplit = splitPlanTotals(companyLines)
  const companyTotals = companySplit.current
  const companyInitial = companySplit.initial
  const companyClosed = [...closedByStaff.entries()]
    .filter(([staffId]) => staffs.some((s) => s.id === staffId))
    .reduce((s, [, r]) => s + r.amount, 0)
  const companyExcel = sales.totalAmount
  const companyQuota = companyQuotaTotal(quotas.lines)
  const elapsed = fiscalElapsedPct(new Date(), fiscalYear)

  const factoryPlanAmount = currentPlanLines(lines)
    .filter((l) => isProductionPlanCategory(l.category))
    .reduce((s, l) => s + Number(l.amount || 0), 0)

  const categoryRows = useMemo(() => {
    return PROGRESS_CATEGORIES.map((cat) => {
      const catLines = lines.filter((l) => progressCategoryFor(l.category) === cat)
      const excel = sales.byCategory[cat] || 0
      return { cat, lines: catLines, totals: splitPlanTotals(catLines), conf: qtyByConfidence(currentPlanLines(catLines)), excel }
    }).filter((r) => r.totals.current.amount > 0 || r.totals.current.qty > 0 || r.excel > 0)
  }, [lines, sales.byCategory])

  const excelByMachine = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of companyItemProgress?.rows || []) {
      map.set(row.key, Number(row.soldAmountTotal || 0))
    }
    return map
  }, [companyItemProgress])

  const machineExcelOf = (r: { category: string; code: string; name: string }) => {
    const code = String(r.code || '').trim() || LUMP_MACHINE_CODE
    return excelByMachine.get(`${r.category}::${code}::${r.name}`) || 0
  }

  const machineRows = useMemo(() => {
    const map = new Map<string, AnnualPlanLine[]>()
    for (const line of lines) {
      const key = machineKey(line)
      const prev = map.get(key) || []
      prev.push(line)
      map.set(key, prev)
    }
    return [...map.entries()]
      .map(([key, group]) => {
        const first = group[0]
        return {
          key,
          category: displayPlanCategory(first.category),
          changeKind: lineChangeKind(first),
          code: first.machine_code,
          name: first.machine_name || '',
          lines: group,
          totals: lineTotals(group),
          conf: qtyByConfidence(group),
        }
      })
      .filter((r) => {
        if (machineCategory === 'すべて') return true
        if (machineCategory === '生産品') return isProductionPlanCategory(r.lines[0]?.category || r.category)
        return r.category === displayPlanCategory(machineCategory) || r.category === machineCategory
      })
      .sort((a, b) => {
        const cat = a.category.localeCompare(b.category, 'ja')
        if (cat !== 0) return cat
        return b.totals.amount - a.totals.amount
      })
  }, [lines, machineCategory])

  const machineTotals = useMemo(() => {
    const groupedLines = machineRows.flatMap((r) => r.lines)
    const seen = new Set<string>()
    let excel = 0
    for (const r of machineRows) {
      const code = String(r.code || '').trim() || LUMP_MACHINE_CODE
      const key = `${r.category}::${code}::${r.name}`
      if (seen.has(key)) continue
      seen.add(key)
      excel += machineExcelOf(r)
    }
    return { totals: lineTotals(groupedLines), conf: qtyByConfidence(groupedLines), excel }
  }, [machineRows, excelByMachine])

  return (
    <div style={planPageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: '#f8fafc' }}>年度計画 進捗</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/plan/annual/quota?fy=${fiscalYear}`}>
            <button style={{ ...planBtn, background: '#b45309', color: '#fff', borderColor: '#b45309' }}>ノルマ</button>
          </Link>
          <Link href={`/plan/annual/sheet?fy=${fiscalYear}`}>
            <button style={{ ...planBtn, background: '#2563eb', color: '#fff', borderColor: '#1d4ed8' }}>個人シート</button>
          </Link>
          <Link href="/selectors">
            <button style={{ ...planBtn, background: '#16a34a', color: '#fff', borderColor: '#15803d' }}>メニューへ戻る</button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <label>
          年度{' '}
          <select value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} style={planInput}>
            {fiscalYearOptions(fiscalYearFromDate()).map((y) => (
              <option key={y} value={y}>
                {fiscalYearLabel(y)}
              </option>
            ))}
            {!fiscalYearOptions().includes(fiscalYear) && (
              <option value={fiscalYear}>{fiscalYearLabel(fiscalYear)}</option>
            )}
          </select>
        </label>
        <span style={planMuted}>
          経過 {elapsed}%
          {loading ? ' …計画読込中' : salesLoading || machineExcelLoading || itemProgressLoading ? ' …実績読込中' : ''}
        </span>
      </div>

      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
      {!loading && staffs.length === 0 && !error && (
        <p style={{ color: '#fde68a' }}>
          営業担当者が未設定です。
          <Link href="/staffs" style={{ color: '#7dd3fc', marginLeft: 8 }}>
            担当者マスタ
          </Link>
          で「営業担当者」にチェックを入れてください。
        </p>
      )}

      <section style={planPanel}>
        <h2 style={{ marginTop: 0, fontSize: 16, color: '#f8fafc' }}>売上Excel取込</h2>
        <p style={{ ...planMuted, marginTop: 0 }}>
          毎月の累計ファイル（例: 売上(2025.9～2026.7).xlsx）を選ぶと、この年度の実績を置き換えます。石油・その他資材は資材に合算します。
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void handleImport(file)
            }}
          />
          {importing && <span style={planMuted}>取込中…</span>}
          {sales.import?.imported_at && (
            <span style={planMuted}>
              最終取込 {sales.import.file_name}（{sales.import.row_count.toLocaleString('ja-JP')}行）
            </span>
          )}
        </div>
        {importMessage && <p style={{ marginBottom: 0, color: importMessage.startsWith('取込完了') ? '#86efac' : '#fca5a5' }}>{importMessage}</p>}
      </section>

      {quotaWarning && <p style={{ color: '#fde68a' }}>{quotaWarning}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          ['当初計画', yen(companyInitial.amount)],
          ['中間計画', yen(companyTotals.amount)],
          ['営業所ノルマ', companyQuota > 0 ? yen(companyQuota) : '未設定'],
          ['見積成約（受注・注文・完了）', yen(companyClosed)],
          ['Excel実績（税抜）', yen(companyExcel)],
          ['見積達成率（対当初）', pct(companyClosed, companyInitial.amount)],
          ['Excel達成率（対当初）', pct(companyExcel, companyInitial.amount)],
          ['Excel達成率（対ノルマ）', companyQuota > 0 ? pct(companyExcel, companyQuota) : '—'],
        ].map(([label, value]) => (
          <div key={label} style={planPanel}>
            <div style={{ fontSize: 12, ...planMuted }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>{value}</div>
          </div>
        ))}
      </div>
      <p style={{ ...planMuted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        上段は見積ステータスが受注・注文・完了（作成日が年度内）。下段は取込んだ売上Excelの税抜。二つは足しません。
        達成率の分母は当初計画。対中間 {pct(companyExcel, companyTotals.amount)}
        {companyQuota > 0 ? ` · 積み上げ差 ${yen(companyInitial.amount - companyQuota)}` : ''}
        。粗利計画 {yen(companyTotals.gp)}
        {sales.unmatchedAmount > 0 ? ` · 担当未割当のExcel ${yen(sales.unmatchedAmount)}` : ''}
      </p>

      <DualMeter closed={companyClosed} excel={companyExcel} plan={companyInitial.amount} elapsed={elapsed} />

      <div id="annual-line-totals" style={{ ...planPanel, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <label style={planMuted}>
            集計単位{' '}
            <select
              value={officeRows.some((o) => o.key === lineOfficeKey) ? lineOfficeKey : 'all'}
              onChange={(e) => setLineOfficeKey(e.target.value)}
              style={{ ...planInput, width: 'auto', minWidth: 180 }}
            >
              <option value="all">全体</option>
              {officeRows.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}（{o.staffs.length}名）
                </option>
              ))}
            </select>
          </label>
        </div>
        <AnnualInitialLineTotals
          title={`当初計画 行計（${selectedOffice ? selectedOffice.label : '全体'}）`}
          lines={officeLineLines}
          excelByCategory={officeLineExcel}
        />
      </div>

      <ProgressBars
        title="科目別 計画 / 見積成約 / Excel"
        caption={`${fiscalYearLabel(fiscalYear)} · 計画バーは中間計画。生産品は暖房機・たばこ乾燥機・食品乾燥機等の合算で、Excel科目「生産品」と対比します。プレハブ冷蔵庫等の仕入品は工事。見積成約はカテゴリ未分割のため生産品行に全額を表示。資材は石油・その他資材を含む。`}
        rows={[
          {
            label: '生産品',
            plan: factoryPlanAmount,
            closed: companyClosed,
            excel: sales.byCategory['生産品'] || 0,
          },
          ...AMOUNT_ONLY_CATEGORIES.map((cat) => ({
            label: cat,
            plan: categoryRows.find((r) => r.cat === cat)?.totals.current.amount || 0,
            closed: 0,
            excel: sales.byCategory[cat] || 0,
          })),
        ].filter((r) => r.plan > 0 || r.closed > 0 || r.excel > 0)}
      />

      {officeRows.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, color: '#f8fafc' }}>営業所別</h2>
          <p style={{ ...planMuted, fontSize: 12, marginTop: 0 }}>
            担当者マスタの部署で集計します。福岡営業所は西九州、東日本出張所は東日本にまとめます。
          </p>
          <ProgressBars
            title="営業所別 計画 / 見積成約 / Excel"
            caption={`${fiscalYearLabel(fiscalYear)} · 計画バーは当初計画。見積成約は受注・注文・完了。Excelは税抜。`}
            rows={officeRows.map((o) => ({
              label: o.label,
              plan: o.initial,
              closed: o.closed,
              excel: o.excel,
            }))}
          />
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr>
                  {['営業所', '人数', 'ノルマ', '当初', '積み上げ差', '中間計画', '見積成約', '見積対当初', 'Excel実績', 'Excel対当初', '対ノルマ', ''].map((h) => (
                    <th key={h || 'office-actions'} style={planTh}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {officeRows.map((o) => (
                  <tr key={o.key}>
                    <td style={planTd}>{o.label}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{o.staffs.length.toLocaleString('ja-JP')}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{o.quota > 0 ? yen(o.quota) : '—'}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{yen(o.initial)}</td>
                    <td style={{ ...planTd, textAlign: 'right', color: o.quota > 0 && o.initial < o.quota ? '#fbbf24' : undefined }}>
                      {o.quota > 0 ? yen(o.initial - o.quota) : '—'}
                    </td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{yen(o.current)}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{yen(o.closed)}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{pct(o.closed, o.initial)}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{yen(o.excel)}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{pct(o.excel, o.initial)}</td>
                    <td style={{ ...planTd, textAlign: 'right' }}>{o.quota > 0 ? pct(o.excel, o.quota) : '—'}</td>
                    <td style={planTd}>
                      <button
                        type="button"
                        onClick={() => {
                          setLineOfficeKey(o.key)
                          document.getElementById('annual-line-totals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        style={{ ...planBtn, padding: '4px 8px' }}
                      >
                        行計
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...planTd, fontWeight: 700 }}>合計</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                    {staffs.length.toLocaleString('ja-JP')}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                    {companyQuota > 0 ? yen(companyQuota) : '—'}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyInitial.amount)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                    {companyQuota > 0 ? yen(companyInitial.amount - companyQuota) : '—'}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyTotals.amount)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyClosed)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{pct(companyClosed, companyInitial.amount)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                    {yen(officeRows.reduce((s, o) => s + o.excel, 0))}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                    {pct(officeRows.reduce((s, o) => s + o.excel, 0), companyInitial.amount)}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                    {companyQuota > 0 ? pct(officeRows.reduce((s, o) => s + o.excel, 0), companyQuota) : '—'}
                  </td>
                  <td style={planTd}>
                    <button
                      type="button"
                      onClick={() => {
                        setLineOfficeKey('all')
                        document.getElementById('annual-line-totals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      style={{ ...planBtn, padding: '4px 8px' }}
                    >
                      全体
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 16, color: '#f8fafc' }}>担当者別</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              {['担当者', '状態', '配分', '当初', '中間計画', '見積成約', '見積対当初', 'Excel実績', 'Excel対当初', ''].map((h) => (
                <th key={h || 'actions'} style={planTh}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {officeRows.map((office) => (
              <Fragment key={office.key}>
                <tr>
                  <td colSpan={10} style={{ ...planTd, fontWeight: 700, background: '#1e293b' }}>
                    {office.label}
                    <span style={{ ...planMuted, fontWeight: 400, marginLeft: 8 }}>{office.staffs.length}名</span>
                  </td>
                </tr>
                {office.staffs.map((staff) => {
                  const row = planByStaff.get(staff.id)
                  const t = splitPlanTotals(row?.lines || [])
                  const closed = closedByStaff.get(staff.id)?.amount || 0
                  const excel = sales.byStaff[staff.id] || 0
                  const alloc = allocationForStaff(quotas.allocations, staff.id)
                  return (
                    <tr key={staff.id}>
                      <td style={planTd}>{staff.name}</td>
                      <td style={planTd}>{row?.plan.status === 'confirmed' ? '確定' : row ? '下書き' : '未作成'}</td>
                      <td style={{ ...planTd, textAlign: 'right' }}>{alloc ? yen(alloc.amount) : '—'}</td>
                      <td style={{ ...planTd, textAlign: 'right' }}>{yen(t.initial.amount)}</td>
                      <td style={{ ...planTd, textAlign: 'right' }}>{yen(t.current.amount)}</td>
                      <td style={{ ...planTd, textAlign: 'right' }}>{yen(closed)}</td>
                      <td style={{ ...planTd, textAlign: 'right' }}>{pct(closed, t.initial.amount)}</td>
                      <td style={{ ...planTd, textAlign: 'right' }}>{yen(excel)}</td>
                      <td style={{ ...planTd, textAlign: 'right' }}>{pct(excel, t.initial.amount)}</td>
                      <td style={planTd}>
                        <button type="button" onClick={() => setItemStaffId(staff.id)} style={{ ...planBtn, padding: '4px 8px', marginRight: 8 }}>
                          月次
                        </button>
                        <Link href={`/plan/annual/sheet?fy=${fiscalYear}&staff=${encodeURIComponent(staff.id)}`} style={{ color: '#7dd3fc' }}>
                          シート
                        </Link>
                      </td>
                    </tr>
                  )
                })}
                <tr>
                  <td style={{ ...planTd, fontWeight: 700 }}>小計</td>
                  <td style={planTd} />
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                    {yen(
                      allocationTotalForOffice(
                        quotas.allocations,
                        officeKeyFromLabel(office.label) || '',
                      ),
                    )}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(office.initial)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(office.current)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(office.closed)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{pct(office.closed, office.initial)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(office.excel)}</td>
                  <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{pct(office.excel, office.initial)}</td>
                  <td style={planTd} />
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={planMuted}>
            担当者{' '}
            <select
              value={itemStaffId}
              onChange={(e) => setItemStaffId(e.target.value)}
              style={{ ...planInput, width: 'auto', minWidth: 160 }}
            >
              {staffs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <AnnualItemMonthProgress
          data={itemProgress}
          loading={itemProgressLoading}
          caption={`選択した担当者の品名に対し、Excel売上の請求月から売れた台数と残りを表示します。中間列は中間修正があれば修正後、なければ当初のままです。残は中間計画に対する値です。${OTHER_CODE_RANGE_CAPTION} 計画に無い売上はExcel科目別に税抜で出ます。`}
        />
        <AnnualInitialLineTotals
          title={`当初計画 行計（${staffs.find((s) => s.id === itemStaffId)?.name || '担当者'}）`}
          lines={planByStaff.get(itemStaffId)?.lines || []}
          excelByCategory={sales.byStaffCategory[itemStaffId] || {}}
        />
      </div>

      <h2 style={{ fontSize: 16, marginTop: 24, color: '#f8fafc', marginBottom: 4 }}>カテゴリ別</h2>
      <p style={{ ...planMuted, fontSize: 12, marginTop: 0 }}>
        暖房機・たばこ乾燥機・食品乾燥機等は生産品にまとめ、Excel科目「生産品」と対比します。プレハブ冷蔵庫等の仕入品は工事です。計画額は中間計画、当初は担当確定＋経営上乗せです。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              {['カテゴリ', '台数', '当初', 'Excel実績', '対当初', '中間計画', '対中間', '確度見込', '構成比'].map((h) => (
                <th key={h} style={{ ...planTh, textAlign: h === 'カテゴリ' ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categoryRows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...planTd, color: '#94a3b8' }}>
                  計画行がありません。
                </td>
              </tr>
            )}
            {categoryRows.map((r) => (
              <tr key={r.cat}>
                <td style={planTd}>{progressCategoryLabel(r.cat)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.totals.current.qty > 0 ? r.totals.current.qty.toLocaleString('ja-JP') : '—'}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.initial.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.excel)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(r.excel, r.totals.initial.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.current.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(r.excel, r.totals.current.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.current.weighted)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(r.totals.current.amount, companyTotals.amount)}</td>
              </tr>
            ))}
            {categoryRows.length > 0 && (
              <tr>
                <td style={{ ...planTd, fontWeight: 700 }}>合計</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{companyTotals.qty.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyInitial.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyExcel)}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{pct(companyExcel, companyInitial.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyTotals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(companyExcel, companyTotals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(companyTotals.weighted)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, color: '#f8fafc', margin: 0 }}>機種別</h2>
        <label style={planMuted}>
          カテゴリ{' '}
          <select
            value={machineCategory}
            onChange={(e) => setMachineCategory(e.target.value)}
            style={{ ...planInput, width: 'auto', minWidth: 160 }}
          >
            <option value="すべて">すべて</option>
            <optgroup label="生産品">
              <option value="生産品">生産品（すべて）</option>
              {FACTORY_PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {displayPlanCategory(c)}
                </option>
              ))}
            </optgroup>
            <optgroup label="その他科目">
              {AMOUNT_ONLY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <span style={planMuted}>{machineRows.length} 機種</span>
      </div>
      {machineRows.length > 0 && (
        <GroupedBars
          title="機種別 計画額・確度見込・Excel実績"
          caption={`${fiscalYearLabel(fiscalYear)} · 担当者を合算。カテゴリ絞り込みがそのまま反映されます。Excel実績は税抜で、計画の品名・商品CDと突合します。棒の長さは表示中の最大額に対する比率です。`}
          rows={machineRows.slice(0, 20).map((r) => ({
            key: r.key,
            label: `${CHANGE_KIND_LABEL[r.changeKind]} ${formatPlanMachineLabel(r.code, r.name)}`,
            plan: r.totals.amount,
            weighted: r.totals.weighted,
            excel: machineExcelOf(r),
          }))}
        />
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
          <thead>
            <tr>
              {['区分', 'カテゴリ', '機種', '台数', '●', '▲', '□', '計画額', 'Excel実績', '対計画', '粗利', '確度見込'].map((h) => (
                <th key={h} style={{ ...planTh, textAlign: h === 'カテゴリ' || h === '機種' || h === '区分' ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {machineRows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ ...planTd, color: '#94a3b8' }}>
                  計画行がありません。
                </td>
              </tr>
            )}
            {machineRows.map((r) => {
              const excel = machineExcelOf(r)
              return (
              <tr key={r.key}>
                <td style={planTd}>{CHANGE_KIND_LABEL[r.changeKind]}</td>
                <td style={planTd}>{r.category}</td>
                <td style={planTd}>
                  {formatPlanMachineLabel(r.code, r.name)}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.totals.qty.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.high.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.mid.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.low.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(excel)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(excel, r.totals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.gp)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.weighted)}</td>
              </tr>
              )
            })}
            {machineRows.length > 0 && (
              <tr>
                <td style={{ ...planTd, fontWeight: 700 }} colSpan={3}>
                  合計
                </td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{machineTotals.totals.qty.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{machineTotals.conf.high.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{machineTotals.conf.mid.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{machineTotals.conf.low.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(machineTotals.totals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(machineTotals.excel)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(machineTotals.excel, machineTotals.totals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(machineTotals.totals.gp)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(machineTotals.totals.weighted)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AnnualPlanDashboardPage() {
  return (
    <Suspense fallback={<div style={planPageStyle}>読み込み中…</div>}>
      <AnnualDashboardContent />
    </Suspense>
  )
}
