'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  fetchAllLinesForPlans,
  fetchAllPlansForYear,
  fetchPlanStaffs,
  fetchSalesActualSummary,
  formatPlanDbError,
  splitPlanTotals,
  type AnnualPlanLine,
  type StaffOption,
} from '@/lib/annualPlanClient'
import { progressCategoryFor, PROGRESS_CATEGORIES } from '@/lib/annualPlanCategories'
import { defaultSheetFiscalYear, fiscalYearLabel, fiscalYearOptions } from '@/lib/annualPlanFiscal'
import {
  allocationTotalForOffice,
  amountsFromLines,
  companyQuotaTotal,
  confirmOfficeQuotas,
  emptyQuotaAmounts,
  fetchOfficeQuotas,
  officeQuotaTotal,
  parseQuotaAmount,
  QUOTA_CATEGORIES,
  QUOTA_OFFICES,
  reopenOfficeQuotas,
  saveOfficeQuotaAllocations,
  saveOfficeQuotaGrid,
  suggestAllocations,
  type OfficeQuotaBundle,
} from '@/lib/annualPlanQuota'
import { officeKeyFromStaff } from '@/lib/branches'
import {
  planBtn,
  planInput,
  planMuted,
  planPageStyle,
  planPanel,
  planTd,
  planTh,
} from '@/lib/annualPlanUi'

function yen(v: number) {
  return `${Math.round(v).toLocaleString('ja-JP')} 円`
}

function sumCat(
  map: Record<string, Record<string, number>>,
  officeKey: string,
  cat: string,
): number {
  return Math.round(Number(map[officeKey]?.[cat] || 0))
}

function AnnualQuotaContent() {
  const searchParams = useSearchParams()
  const [fiscalYear, setFiscalYear] = useState(() => {
    const q = Number(searchParams.get('fy'))
    return Number.isFinite(q) && q > 2000 ? q : defaultSheetFiscalYear()
  })
  const [staffs, setStaffs] = useState<StaffOption[]>([])
  const [planByStaffId, setPlanByStaffId] = useState<Record<string, number>>({})
  const [planByOfficeCat, setPlanByOfficeCat] = useState<Record<string, Record<string, number>>>({})
  const [priorByOffice, setPriorByOffice] = useState<Record<string, number>>({})
  const [priorByOfficeCat, setPriorByOfficeCat] = useState<Record<string, Record<string, number>>>({})
  const [actualByStaff, setActualByStaff] = useState<Record<string, number>>({})
  const [bundle, setBundle] = useState<OfficeQuotaBundle>({ year: null, lines: [], allocations: [] })
  const [amounts, setAmounts] = useState(emptyQuotaAmounts)
  const [allocEdits, setAllocEdits] = useState<Record<string, string>>({})
  const [openOffice, setOpenOffice] = useState<string>(QUOTA_OFFICES[0]?.key || '')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')

  const confirmed = bundle.year?.status === 'confirmed'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [staffList, plans, priorSales, currentSales] = await Promise.all([
        fetchPlanStaffs(),
        fetchAllPlansForYear(fiscalYear),
        fetchSalesActualSummary(fiscalYear - 1).catch(() => null),
        fetchSalesActualSummary(fiscalYear).catch(() => null),
      ])
      let quota: OfficeQuotaBundle = { year: null, lines: [], allocations: [] }
      try {
        quota = await fetchOfficeQuotas(fiscalYear)
      } catch (e) {
        setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
      }
      const lines = await fetchAllLinesForPlans(plans.map((p) => p.id))
      const planByStaff = new Map<string, AnnualPlanLine[]>()
      for (const plan of plans) planByStaff.set(String(plan.staff_id), [])
      for (const line of lines) {
        const plan = plans.find((p) => p.id === line.plan_id)
        if (!plan) continue
        const list = planByStaff.get(String(plan.staff_id)) || []
        list.push(line)
        planByStaff.set(String(plan.staff_id), list)
      }

      const nextPlan: Record<string, Record<string, number>> = {}
      const nextPlanByStaff: Record<string, number> = {}
      for (const staff of staffList) {
        const key = officeKeyFromStaff(staff)
        const staffLines = planByStaff.get(staff.id) || []
        nextPlanByStaff[staff.id] = splitPlanTotals(staffLines).initial.amount
        if (!key) continue
        if (!nextPlan[key]) nextPlan[key] = {}
        for (const cat of PROGRESS_CATEGORIES) {
          const catLines = staffLines.filter((l) => progressCategoryFor(l.category) === cat)
          nextPlan[key][cat] = (nextPlan[key][cat] || 0) + splitPlanTotals(catLines).initial.amount
        }
      }

      const nextPriorOffice: Record<string, number> = {}
      const nextPriorCat: Record<string, Record<string, number>> = {}
      const sales = priorSales || currentSales
      if (sales) {
        for (const staff of staffList) {
          const key = officeKeyFromStaff(staff)
          if (!key) continue
          nextPriorOffice[key] = (nextPriorOffice[key] || 0) + (sales.byStaff[staff.id] || 0)
          const cats = sales.byStaffCategory[staff.id] || {}
          if (!nextPriorCat[key]) nextPriorCat[key] = {}
          for (const [cat, amt] of Object.entries(cats)) {
            nextPriorCat[key][cat] = (nextPriorCat[key][cat] || 0) + Number(amt || 0)
          }
        }
      }

      setStaffs(staffList)
      setBundle(quota)
      setAmounts(amountsFromLines(quota.lines))
      setPlanByOfficeCat(nextPlan)
      setPlanByStaffId(nextPlanByStaff)
      setPriorByOffice(nextPriorOffice)
      setPriorByOfficeCat(nextPriorCat)
      setActualByStaff(priorSales?.byStaff || currentSales?.byStaff || {})
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [fiscalYear])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const a of bundle.allocations.filter((r) => r.office_key === openOffice)) {
      next[a.staff_id] = String(a.amount)
    }
    setAllocEdits(next)
  }, [bundle.allocations, openOffice])

  const officeStaffs = useMemo(
    () => staffs.filter((s) => officeKeyFromStaff(s) === openOffice),
    [staffs, openOffice],
  )

  const setCell = (officeKey: string, cat: string, value: string) => {
    setAmounts((prev) => ({
      ...prev,
      [officeKey]: { ...prev[officeKey], [cat]: value },
    }))
  }

  const officeTotalFromGrid = (officeKey: string) =>
    QUOTA_CATEGORIES.reduce((s, cat) => {
      const n = parseQuotaAmount(amounts[officeKey]?.[cat] || '')
      return s + (Number.isFinite(n) ? n : 0)
    }, 0)

  const gridCompanyTotal = QUOTA_OFFICES.reduce((s, o) => s + officeTotalFromGrid(o.key), 0)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setHint('')
    try {
      const next = await saveOfficeQuotaGrid(fiscalYear, amounts)
      setBundle(next)
      setAmounts(amountsFromLines(next.lines))
      setHint('保存しました')
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!window.confirm('この年度の営業所ノルマを確定します。確定後の修正は「改定」が必要です。')) return
    setSaving(true)
    setError('')
    try {
      const saved = await saveOfficeQuotaGrid(fiscalYear, amounts)
      setBundle(saved)
      const next = await confirmOfficeQuotas(fiscalYear)
      setBundle(next)
      setHint('確定しました')
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleReopen = async () => {
    if (!window.confirm('確定を取り消して下書きに戻します。')) return
    setSaving(true)
    setError('')
    try {
      const next = await reopenOfficeQuotas(fiscalYear)
      setBundle(next)
      setHint('下書きに戻しました')
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleSuggest = (kind: 'actual' | 'plan') => {
    const total = officeTotalFromGrid(openOffice)
    const shares: Record<string, number> = {}
    for (const staff of officeStaffs) {
      shares[staff.id] = kind === 'actual' ? actualByStaff[staff.id] || 0 : planByStaffId[staff.id] || 0
    }
    const suggested = suggestAllocations(
      officeStaffs.map((s) => s.id),
      shares,
      total,
    )
    const next: Record<string, string> = {}
    for (const row of suggested) next[row.staff_id] = String(row.amount)
    setAllocEdits(next)
  }

  const handleSaveAlloc = async () => {
    setSaving(true)
    setError('')
    setHint('')
    try {
      const savedGrid = await saveOfficeQuotaGrid(fiscalYear, amounts)
      setBundle(savedGrid)
      setAmounts(amountsFromLines(savedGrid.lines))
      const rows = officeStaffs.map((s) => ({
        staff_id: s.id,
        amount: parseQuotaAmount(allocEdits[s.id] || ''),
      }))
      if (rows.some((r) => !Number.isFinite(r.amount))) {
        throw new Error('配分額が数値ではありません。')
      }
      const next = await saveOfficeQuotaAllocations(fiscalYear, openOffice, rows)
      setBundle(next)
      setHint('配分を保存しました')
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const allocSum = officeStaffs.reduce((s, staff) => {
    const n = parseQuotaAmount(allocEdits[staff.id] || '')
    return s + (Number.isFinite(n) ? n : 0)
  }, 0)
  const allocCap = officeTotalFromGrid(openOffice)
  const allocRemain = allocCap - allocSum

  return (
    <div style={planPageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: '#f8fafc' }}>営業所ノルマ</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/plan/annual?fy=${fiscalYear}`}>
            <button style={{ ...planBtn, background: '#3b82f6', color: '#fff', borderColor: '#2563eb' }}>集計</button>
          </Link>
          <Link href={`/plan/annual/sheet?fy=${fiscalYear}`}>
            <button style={planBtn}>個人シート</button>
          </Link>
          <Link href="/selectors">
            <button style={{ ...planBtn, background: '#16a34a', color: '#fff', borderColor: '#15803d' }}>メニューへ戻る</button>
          </Link>
        </div>
      </div>

      <p style={{ ...planMuted, marginTop: 0 }}>
        {fiscalYearLabel(fiscalYear)}。会社目標は営業所×科目の金額です。担当者の積み上げとは別で、個人シートの行には書き戻りません。前年実績は既存の売上取込の参考値です。
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label>
          年度{' '}
          <select value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} style={planInput}>
            {fiscalYearOptions().map((y) => (
              <option key={y} value={y}>
                {fiscalYearLabel(y)}
              </option>
            ))}
          </select>
        </label>
        <span style={planMuted}>
          {confirmed ? '確定済' : '下書き'}
          {loading ? ' …読込中' : ''}
        </span>
        <span style={{ marginLeft: 'auto', ...planMuted }}>会社計 {yen(gridCompanyTotal)}</span>
      </div>

      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
      {hint && <p style={{ color: '#86efac' }}>{hint}</p>}

      <section style={planPanel}>
        <h2 style={{ marginTop: 0, fontSize: 16, color: '#f8fafc' }}>営業所 × 科目</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                {['営業所', ...QUOTA_CATEGORIES, 'ノルマ計', '前年実績', '積み上げ当初'].map((h) => (
                  <th key={h} style={{ ...planTh, textAlign: h === '営業所' ? 'left' : 'right' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUOTA_OFFICES.map((office) => {
                const total = officeTotalFromGrid(office.key)
                const prior = priorByOffice[office.key] || 0
                const plan = QUOTA_CATEGORIES.reduce((s, cat) => s + sumCat(planByOfficeCat, office.key, cat), 0)
                return (
                  <tr
                    key={office.key}
                    style={openOffice === office.key ? { outline: '1px solid #38bdf8' } : undefined}
                  >
                    <td style={planTd}>
                      <button type="button" onClick={() => setOpenOffice(office.key)} style={{ ...planBtn, padding: '4px 8px' }}>
                        {office.label}
                      </button>
                    </td>
                    {QUOTA_CATEGORIES.map((cat) => (
                      <td key={cat} style={{ ...planTd, textAlign: 'right' }}>
                        <input
                          value={amounts[office.key]?.[cat] || ''}
                          disabled={confirmed || saving}
                          onChange={(e) => setCell(office.key, cat, e.target.value)}
                          placeholder={priorByOfficeCat[office.key]?.[cat] ? String(Math.round(priorByOfficeCat[office.key][cat])) : ''}
                          title={
                            priorByOfficeCat[office.key]?.[cat]
                              ? `前年実績 ${yen(priorByOfficeCat[office.key][cat])}`
                              : ''
                          }
                          style={{ ...planInput, width: 110, textAlign: 'right' }}
                        />
                      </td>
                    ))}
                    <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(total)}</td>
                    <td style={{ ...planTd, textAlign: 'right', ...planMuted }}>{prior ? yen(prior) : '—'}</td>
                    <td style={{ ...planTd, textAlign: 'right', ...planMuted }}>{plan ? yen(plan) : '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ ...planTd, fontWeight: 700 }}>会社計</td>
                {QUOTA_CATEGORIES.map((cat) => {
                  const n = QUOTA_OFFICES.reduce(
                    (s, o) => s + (Number.isFinite(parseQuotaAmount(amounts[o.key]?.[cat] || '')) ? parseQuotaAmount(amounts[o.key]?.[cat] || '') : 0),
                    0,
                  )
                  return (
                    <td key={cat} style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                      {yen(n)}
                    </td>
                  )
                })}
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(gridCompanyTotal)}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                  {yen(Object.values(priorByOffice).reduce((s, n) => s + n, 0))}
                </td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>
                  {yen(
                    QUOTA_OFFICES.reduce(
                      (s, o) => s + QUOTA_CATEGORIES.reduce((a, cat) => a + sumCat(planByOfficeCat, o.key, cat), 0),
                      0,
                    ),
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ ...planMuted, fontSize: 12, marginBottom: 0 }}>
          空欄は 0。プレースホルダは前年同科目の実績です。営業所名を押すと下で配分できます。
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!confirmed && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              style={{ ...planBtn, background: '#2563eb', color: '#fff', borderColor: '#1d4ed8' }}
            >
              保存
            </button>
          )}
          {!confirmed && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving || loading || gridCompanyTotal <= 0}
              style={{ ...planBtn, background: '#0f766e', color: '#fff', borderColor: '#0f766e', opacity: gridCompanyTotal > 0 ? 1 : 0.5 }}
            >
              確定
            </button>
          )}
          {confirmed && (
            <button type="button" onClick={() => void handleReopen()} disabled={saving} style={planBtn}>
              改定（下書きに戻す）
            </button>
          )}
        </div>
      </section>

      <section style={planPanel}>
        <h2 style={{ marginTop: 0, fontSize: 16, color: '#f8fafc' }}>
          配分（任意） · {QUOTA_OFFICES.find((o) => o.key === openOffice)?.label}
        </h2>
        <p style={{ ...planMuted, marginTop: 0 }}>
          ノルマの正は上の営業所計です。配分しなくても構いません。合計がノルマを超えると保存できません。
        </p>
        {officeStaffs.length === 0 ? (
          <p style={planMuted}>この営業所に営業担当者がいません。</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    {['担当者', '前年実績', '積み上げ当初', '配分'].map((h) => (
                      <th key={h} style={{ ...planTh, textAlign: h === '担当者' ? 'left' : 'right' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {officeStaffs.map((staff) => (
                    <tr key={staff.id}>
                      <td style={planTd}>{staff.name}</td>
                      <td style={{ ...planTd, textAlign: 'right', ...planMuted }}>
                        {actualByStaff[staff.id] ? yen(actualByStaff[staff.id]) : '—'}
                      </td>
                      <td style={{ ...planTd, textAlign: 'right', ...planMuted }}>
                        {planByStaffId[staff.id] ? yen(planByStaffId[staff.id]) : '—'}
                      </td>
                      <td style={{ ...planTd, textAlign: 'right' }}>
                        <input
                          value={allocEdits[staff.id] || ''}
                          disabled={confirmed || saving}
                          onChange={(e) => setAllocEdits((prev) => ({ ...prev, [staff.id]: e.target.value }))}
                          style={{ ...planInput, width: 140, textAlign: 'right' }}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...planTd, fontWeight: 700 }}>未配分</td>
                    <td style={planTd} />
                    <td style={planTd} />
                    <td style={{ ...planTd, textAlign: 'right', fontWeight: 700, color: allocRemain < 0 ? '#fca5a5' : '#86efac' }}>
                      {yen(allocRemain)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ ...planMuted, fontSize: 12 }}>
              営業所ノルマ {yen(allocCap)} · 配分計 {yen(allocSum)}
              {bundle.year ? ` · 保存済配分 ${yen(allocationTotalForOffice(bundle.allocations, openOffice))}` : ''}
            </p>
            {!confirmed && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => handleSuggest('actual')} disabled={saving} style={planBtn}>
                  前年実績比で提案
                </button>
                <button type="button" onClick={() => handleSuggest('plan')} disabled={saving} style={planBtn}>
                  積み上げ比で提案
                </button>
                <button
                  type="button"
                  onClick={() => setAllocEdits({})}
                  disabled={saving}
                  style={planBtn}
                >
                  配分を空に
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAlloc()}
                  disabled={saving || allocRemain < 0}
                  style={{ ...planBtn, background: '#b45309', color: '#fff', borderColor: '#b45309', opacity: allocRemain < 0 ? 0.5 : 1 }}
                >
                  配分を保存
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <p style={{ ...planMuted, fontSize: 12 }}>
        保存済み会社計 {yen(companyQuotaTotal(bundle.lines))}
        {openOffice ? ` · 選択所の保存済 ${yen(officeQuotaTotal(bundle.lines, openOffice))}` : ''}
      </p>
    </div>
  )
}

export default function AnnualQuotaPage() {
  return (
    <Suspense fallback={<div style={{ ...planPageStyle, padding: 24 }}>読み込み中…</div>}>
      <AnnualQuotaContent />
    </Suspense>
  )
}
