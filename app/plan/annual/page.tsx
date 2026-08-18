'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  fetchAllLinesForPlans,
  fetchAllPlansForYear,
  fetchOrderedAmountByStaff,
  fetchPlanStaffs,
  formatPlanDbError,
  lineTotals,
  type AnnualPlan,
  type AnnualPlanLine,
  type StaffOption,
} from '@/lib/annualPlanClient'
import {
  fiscalElapsedPct,
  fiscalYearFromDate,
  fiscalYearLabel,
  fiscalYearOptions,
} from '@/lib/annualPlanFiscal'
import { PLAN_CATEGORIES, displayPlanCategory } from '@/lib/annualPlanCategories'
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

function pct(n: number, d: number) {
  if (d <= 0) return '—'
  return `${Math.round((n / d) * 100)}%`
}

function pctNum(n: number, d: number) {
  if (d <= 0) return 0
  return Math.round((n / d) * 100)
}

function UsageMeter(props: { closed: number; plan: number; elapsed: number }) {
  const closedPct = Math.min(pctNum(props.closed, props.plan), 100)
  const elapsed = Math.min(Math.max(props.elapsed, 0), 100)
  return (
    <div style={{ ...planPanel, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <span>
          成約 {pct(props.closed, props.plan)} / 経過 {elapsed}%
        </span>
        <span>
          {yen(props.closed)} / {yen(props.plan)}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 18,
          background: '#1e293b',
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid #334155',
        }}
      >
        <div style={{ width: `${closedPct}%`, height: '100%', background: '#22c55e' }} />
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
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, ...planMuted }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', marginRight: 6 }} />
          成約額
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#38bdf8', marginRight: 6 }} />
          年度の経過
        </span>
      </div>
    </div>
  )
}

function GroupedBars(props: {
  title: string
  caption: string
  rows: Array<{ label: string; plan: number; weighted: number }>
}) {
  const max = Math.max(...props.rows.map((r) => Math.max(r.plan, r.weighted)), 1)
  return (
    <div style={{ ...planPanel, padding: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#f8fafc' }}>{props.title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {props.rows.map((r) => (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 13 }}>
              <span>{r.label}</span>
              <span style={planMuted}>
                {yen(r.plan)} / 見込 {yen(r.weighted)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.plan / max) * 100}%`, height: '100%', background: '#94a3b8' }} />
              </div>
              <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(r.weighted / max) * 100}%`, height: '100%', background: '#38bdf8' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ ...planMuted, fontSize: 12, margin: '10px 0 0' }}>{props.caption}</p>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, ...planMuted }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#94a3b8', marginRight: 6 }} />
          計画額
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#38bdf8', marginRight: 6 }} />
          確度見込（●100% ▲50% □0%）
        </span>
      </div>
    </div>
  )
}

function qtyByConfidence(lines: AnnualPlanLine[]) {
  return {
    high: lines.filter((l) => l.confidence === 'high').reduce((s, r) => s + Number(r.qty || 0), 0),
    mid: lines.filter((l) => l.confidence === 'mid').reduce((s, r) => s + Number(r.qty || 0), 0),
    low: lines.filter((l) => l.confidence === 'low').reduce((s, r) => s + Number(r.qty || 0), 0),
  }
}

function machineKey(line: AnnualPlanLine) {
  return `${displayPlanCategory(line.category)}::${line.machine_code}::${line.machine_name || ''}`
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
  const [ordered, setOrdered] = useState<Map<string, { amount: number; count: number }>>(new Map())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [machineCategory, setMachineCategory] = useState('すべて')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const [staffList, planList] = await Promise.all([
          fetchPlanStaffs(),
          fetchAllPlansForYear(fiscalYear),
        ])
        setStaffs(staffList)
        setPlans(planList)
        const lineList = await fetchAllLinesForPlans(planList.map((p) => p.id))
        setLines(lineList)
        setOrdered(await fetchOrderedAmountByStaff(fiscalYear))
      } catch (e) {
        setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
        setPlans([])
        setLines([])
      } finally {
        setLoading(false)
      }
    })()
  }, [fiscalYear])

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

  const companyLines = lines
  const companyTotals = lineTotals(companyLines)
  const companyClosed = [...ordered.values()].reduce((s, r) => s + r.amount, 0)
  const elapsed = fiscalElapsedPct(new Date(), fiscalYear)
  const companyConf = qtyByConfidence(lines)

  const categoryRows = useMemo(() => {
    return PLAN_CATEGORIES.map((cat) => {
      const catLines = lines.filter((l) => displayPlanCategory(l.category) === cat)
      return { cat, lines: catLines, totals: lineTotals(catLines), conf: qtyByConfidence(catLines) }
    }).filter((r) => r.totals.amount > 0 || r.totals.qty > 0)
  }, [lines])

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
          code: first.machine_code,
          name: first.machine_name || '',
          lines: group,
          totals: lineTotals(group),
          conf: qtyByConfidence(group),
        }
      })
      .filter((r) => machineCategory === 'すべて' || r.category === machineCategory)
      .sort((a, b) => {
        const cat = a.category.localeCompare(b.category, 'ja')
        if (cat !== 0) return cat
        return b.totals.amount - a.totals.amount
      })
  }, [lines, machineCategory])

  const machineTotals = useMemo(() => {
    const groupedLines = machineRows.flatMap((r) => r.lines)
    return { totals: lineTotals(groupedLines), conf: qtyByConfidence(groupedLines) }
  }, [machineRows])

  return (
    <div style={planPageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: '#f8fafc' }}>年度計画 進捗</h1>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <span style={planMuted}>経過 {elapsed}%{loading ? ' …集計中' : ''}</span>
      </div>

      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          ['計画額', yen(companyTotals.amount)],
          ['成約額（○・作成日）', yen(companyClosed)],
          ['売上達成率', pct(companyClosed, companyTotals.amount)],
          ['粗利計画', yen(companyTotals.gp)],
        ].map(([label, value]) => (
          <div key={label} style={planPanel}>
            <div style={{ fontSize: 12, ...planMuted }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>{value}</div>
          </div>
        ))}
      </div>
      <p style={{ ...planMuted, fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        成約は見込み区分○で、見積作成日が年度内の案件です。成約日・カテゴリ紐づけは次の改修です。
      </p>

      <UsageMeter closed={companyClosed} plan={companyTotals.amount} elapsed={elapsed} />

      {categoryRows.length > 0 && (
        <GroupedBars
          title="カテゴリ別 計画額と確度見込"
          caption={`${fiscalYearLabel(fiscalYear)} · 横は金額。成約のカテゴリ別は見積紐づけ後に追加します。`}
          rows={categoryRows.map((r) => ({
            label: r.cat,
            plan: r.totals.amount,
            weighted: r.totals.weighted,
          }))}
        />
      )}

      <h2 style={{ fontSize: 16, color: '#f8fafc' }}>担当者別</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              {['担当者', '状態', '計画額', '粗利計画', '成約額', '達成率', ''].map((h) => (
                <th key={h || 'actions'} style={planTh}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffs.map((staff) => {
              const row = planByStaff.get(staff.id)
              const t = lineTotals(row?.lines || [])
              const closed = ordered.get(staff.id)?.amount || 0
              return (
                <tr key={staff.id}>
                  <td style={planTd}>{staff.name}</td>
                  <td style={planTd}>{row?.plan.status === 'confirmed' ? '確定' : row ? '下書き' : '未作成'}</td>
                  <td style={{ ...planTd, textAlign: 'right' }}>{yen(t.amount)}</td>
                  <td style={{ ...planTd, textAlign: 'right' }}>{yen(t.gp)}</td>
                  <td style={{ ...planTd, textAlign: 'right' }}>{yen(closed)}</td>
                  <td style={{ ...planTd, textAlign: 'right' }}>{pct(closed, t.amount)}</td>
                  <td style={planTd}>
                    <Link href={`/plan/annual/sheet?fy=${fiscalYear}&staff=${encodeURIComponent(staff.id)}`} style={{ color: '#7dd3fc' }}>
                      シート
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 24, color: '#f8fafc' }}>カテゴリ別</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              {['カテゴリ', '台数', '●', '▲', '□', '計画額', '粗利', '確度見込', '構成比'].map((h) => (
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
                <td style={planTd}>{r.cat}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.totals.qty.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.high.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.mid.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.low.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.gp)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.weighted)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(r.totals.amount, companyTotals.amount)}</td>
              </tr>
            ))}
            {categoryRows.length > 0 && (
              <tr>
                <td style={{ ...planTd, fontWeight: 700 }}>合計</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{companyTotals.qty.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{companyConf.high.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{companyConf.mid.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{companyConf.low.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyTotals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(companyTotals.gp)}</td>
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
            {PLAN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span style={planMuted}>{machineRows.length} 機種</span>
      </div>
      {machineRows.length > 0 && (
        <GroupedBars
          title="機種別 計画額と確度見込"
          caption={`${fiscalYearLabel(fiscalYear)} · 担当者を合算。カテゴリ絞り込みがそのまま反映されます。`}
          rows={machineRows.slice(0, 20).map((r) => ({
            label: r.name && r.name !== r.code ? `${r.code} ${r.name}` : r.code,
            plan: r.totals.amount,
            weighted: r.totals.weighted,
          }))}
        />
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              {['カテゴリ', '機種', '台数', '●', '▲', '□', '計画額', '粗利', '確度見込'].map((h) => (
                <th key={h} style={{ ...planTh, textAlign: h === 'カテゴリ' || h === '機種' ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {machineRows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...planTd, color: '#94a3b8' }}>
                  計画行がありません。
                </td>
              </tr>
            )}
            {machineRows.map((r) => (
              <tr key={r.key}>
                <td style={planTd}>{r.category}</td>
                <td style={planTd}>
                  {r.code}
                  {r.name && r.name !== r.code ? ` ${r.name}` : ''}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.totals.qty.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.high.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.mid.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{r.conf.low.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.gp)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.totals.weighted)}</td>
              </tr>
            ))}
            {machineRows.length > 0 && (
              <tr>
                <td style={{ ...planTd, fontWeight: 700 }} colSpan={2}>
                  合計
                </td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{machineTotals.totals.qty.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{machineTotals.conf.high.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{machineTotals.conf.mid.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{machineTotals.conf.low.toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(machineTotals.totals.amount)}</td>
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
