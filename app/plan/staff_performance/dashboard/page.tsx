'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  computeStaffPerformanceTotals,
  fetchStaffPerformanceSummary,
  formatYenShort,
  type StaffSummary,
} from '@/lib/staffPerformanceSummary'

const pageStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 1600,
  margin: '0 auto',
  minHeight: '100vh',
  color: '#e2e8f0',
  background: '#0b1220',
}

const panelStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 600,
  color: '#cbd5e1',
}

type RankItem = {
  label: string
  value: number
  pct: number
}

function RankingChart({
  title,
  items,
  color,
  valueMode = 'yen',
}: {
  title: string
  items: RankItem[]
  color: string
  valueMode?: 'yen' | 'count' | 'percent'
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1)

  const formatValue = (value: number) => {
    if (valueMode === 'count') return `${value.toLocaleString('ja-JP')}件`
    if (valueMode === 'percent') return `${value.toFixed(1)}%`
    return `¥${value.toLocaleString('ja-JP')}`
  }

  return (
    <div style={{ ...panelStyle, padding: 16 }}>
      <h3 style={{ margin: '0 0 14px 0', fontSize: 16, color: '#f8fafc' }}>{title}</h3>
      {items.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>データなし</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                  <span style={{ color: '#64748b', marginRight: 6 }}>{index + 1}.</span>
                  {item.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
                  {valueMode === 'percent'
                    ? formatValue(item.value)
                    : `${formatValue(item.value)} (${item.pct.toFixed(1)}%)`}
                </span>
              </div>
              <div style={{ background: '#1e293b', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(item.value / maxValue) * 100}%`,
                    height: '100%',
                    background: color,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({
  value,
  label,
  color,
  sub,
}: {
  value: string | number
  label: string
  color: string
  sub?: string
}) {
  return (
    <div style={{ ...panelStyle, padding: '16px 18px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function StaffAmountStackChart({
  title,
  rows,
}: {
  title: string
  rows: StaffSummary[]
}) {
  const topRows = [...rows]
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 10)
  const maxTotal = Math.max(...topRows.map((row) => row.total_amount), 1)

  return (
    <div style={{ ...panelStyle, padding: 16 }}>
      <h3 style={{ margin: '0 0 14px 0', fontSize: 16, color: '#f8fafc' }}>{title}</h3>
      {topRows.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>データなし</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {topRows.map((row) => {
            const widthPct = (row.total_amount / maxTotal) * 100
            const contractedPct =
              row.total_amount > 0 ? (row.contracted_amount / row.total_amount) * 100 : 0
            const negotiatingPct =
              row.total_amount > 0 ? (row.negotiating_amount / row.total_amount) * 100 : 0
            const lostPct =
              row.total_amount > 0 ? (row.lost_amount / row.total_amount) * 100 : 0

            return (
              <div key={row.staff_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#cbd5e1' }}>{row.staff_name ?? '(未設定)'}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    ¥{row.total_amount.toLocaleString('ja-JP')}
                  </span>
                </div>
                <div
                  style={{
                    width: `${widthPct}%`,
                    minWidth: row.total_amount > 0 ? 80 : 0,
                    height: 18,
                    display: 'flex',
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: '#1e293b',
                  }}
                >
                  {contractedPct > 0 && (
                    <div
                      title={`成約 ¥${row.contracted_amount.toLocaleString('ja-JP')}`}
                      style={{ width: `${contractedPct}%`, background: '#22c55e' }}
                    />
                  )}
                  {negotiatingPct > 0 && (
                    <div
                      title={`商談中 ¥${row.negotiating_amount.toLocaleString('ja-JP')}`}
                      style={{ width: `${negotiatingPct}%`, background: '#38bdf8' }}
                    />
                  )}
                  {lostPct > 0 && (
                    <div
                      title={`失注 ¥${row.lost_amount.toLocaleString('ja-JP')}`}
                      style={{ width: `${lostPct}%`, background: '#64748b' }}
                    />
                  )}
                </div>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8' }}>
            <span><span style={{ color: '#22c55e' }}>■</span> 成約</span>
            <span><span style={{ color: '#38bdf8' }}>■</span> 商談中</span>
            <span><span style={{ color: '#64748b' }}>■</span> 失注</span>
          </div>
        </div>
      )}
    </div>
  )
}

function buildRanking(
  rows: StaffSummary[],
  pickValue: (row: StaffSummary) => number,
  limit = 10,
): RankItem[] {
  const total = rows.reduce((sum, row) => sum + pickValue(row), 0) || 1
  return [...rows]
    .map((row) => ({
      label: row.staff_name ?? '(未設定)',
      value: pickValue(row),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      pct: (item.value / total) * 100,
    }))
}

function StaffPerformanceDashboardContent() {
  const searchParams = useSearchParams()
  const [fromDate, setFromDate] = useState(searchParams.get('from') || '')
  const [toDate, setToDate] = useState(searchParams.get('to') || '')
  const [rows, setRows] = useState<StaffSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const loadSummary = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const data = await fetchStaffPerformanceSummary(fromDate || undefined, toDate || undefined)
      setRows(data)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'データ取得に失敗しました')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = useMemo(() => computeStaffPerformanceTotals(rows), [rows])

  const totalCountRanking = useMemo(
    () => buildRanking(rows, (row) => row.total_count),
    [rows],
  )
  const totalAmountRanking = useMemo(
    () => buildRanking(rows, (row) => row.total_amount),
    [rows],
  )
  const contractedRanking = useMemo(
    () => buildRanking(rows, (row) => row.contracted_amount),
    [rows],
  )
  const grossProfitRanking = useMemo(
    () => buildRanking(rows, (row) => row.gross_profit_total),
    [rows],
  )
  const lostRanking = useMemo(
    () => buildRanking(rows, (row) => row.lost_amount),
    [rows],
  )
  const contractRateRanking = useMemo(() => {
    return [...rows]
      .filter((row) => row.total_amount > 0 && row.contract_rate != null)
      .sort((a, b) => (b.contract_rate || 0) - (a.contract_rate || 0))
      .slice(0, 10)
      .map((row) => ({
        label: row.staff_name ?? '(未設定)',
        value: row.contract_rate || 0,
        pct: row.contract_rate || 0,
      }))
  }, [rows])

  const periodLabel =
    fromDate || toDate
      ? `${fromDate || '開始未指定'} ～ ${toDate || '終了未指定'}`
      : '全期間'

  const tableLink = `/plan/staff_performance${
    fromDate || toDate
      ? `?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
      : ''
  }`

  return (
    <div style={pageStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 32, color: '#f8fafc' }}>営業成績ダッシュボード</h1>
          <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>
            担当者別営業実績表の集計結果をグラフで可視化します（{periodLabel}）
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={tableLink}>
            <button className="btn-3d btn-search" style={{ padding: '10px 16px' }}>
              実績表に戻る
            </button>
          </Link>
          <Link href="/selectors">
            <button
              className="btn-3d btn-reset"
              style={{ padding: '10px 16px', background: '#16a34a', border: '1px solid #15803d', color: '#fff' }}
            >
              ← メニュー
            </button>
          </Link>
        </div>
      </div>

      <div
        style={{
          ...panelStyle,
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <label style={labelStyle}>開始日</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="input-inset"
            style={{ minWidth: 160 }}
          />
        </div>
        <div>
          <label style={labelStyle}>終了日</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="input-inset"
            style={{ minWidth: 160 }}
          />
        </div>
        <button onClick={() => void loadSummary()} disabled={loading} className="btn-3d btn-primary">
          {loading ? '集計中…' : '再集計'}
        </button>
      </div>

      {errorMessage && (
        <div style={{ color: '#fca5a5', marginBottom: 16 }}>{errorMessage}</div>
      )}

      {loading && (
        <div style={{ ...panelStyle, textAlign: 'center', marginBottom: 20 }}>データ読み込み中…</div>
      )}

      {!loading && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <StatCard
              value={`¥${formatYenShort(totals.total_amount)}`}
              label="取扱額"
              color="#60a5fa"
              sub={`${totals.total_count}件`}
            />
            <StatCard
              value={`¥${formatYenShort(totals.contracted_amount)}`}
              label="成約額"
              color="#4ade80"
              sub={`${totals.contracted_count}件`}
            />
            <StatCard
              value={totals.contract_rate != null ? `${totals.contract_rate.toFixed(1)}%` : '-'}
              label="成約率"
              color="#22d3ee"
            />
            <StatCard
              value={`¥${formatYenShort(totals.negotiating_amount)}`}
              label="商談中金額"
              color="#38bdf8"
              sub={`${totals.negotiating_count}件`}
            />
            <StatCard
              value={`¥${formatYenShort(totals.lost_amount)}`}
              label="失注額"
              color="#94a3b8"
              sub={`${totals.lost_count}件`}
            />
            <StatCard
              value={`¥${formatYenShort(totals.gross_profit_total)}`}
              label="粗利額"
              color="#a78bfa"
              sub={
                totals.avg_gross_margin != null
                  ? `平均 ${totals.avg_gross_margin.toFixed(1)}%`
                  : undefined
              }
            />
          </div>

          <div style={{ ...panelStyle, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18, color: '#f8fafc' }}>全体構成（金額）</h3>
            {totals.total_amount > 0 ? (
              <>
                <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', background: '#1e293b' }}>
                  {totals.contracted_amount > 0 && (
                    <div
                      style={{
                        width: `${(totals.contracted_amount / totals.total_amount) * 100}%`,
                        background: '#22c55e',
                      }}
                      title={`成約 ¥${totals.contracted_amount.toLocaleString('ja-JP')}`}
                    />
                  )}
                  {totals.negotiating_amount > 0 && (
                    <div
                      style={{
                        width: `${(totals.negotiating_amount / totals.total_amount) * 100}%`,
                        background: '#38bdf8',
                      }}
                      title={`商談中 ¥${totals.negotiating_amount.toLocaleString('ja-JP')}`}
                    />
                  )}
                  {totals.lost_amount > 0 && (
                    <div
                      style={{
                        width: `${(totals.lost_amount / totals.total_amount) * 100}%`,
                        background: '#64748b',
                      }}
                      title={`失注 ¥${totals.lost_amount.toLocaleString('ja-JP')}`}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: '#cbd5e1' }}>
                  <span>成約 ¥{totals.contracted_amount.toLocaleString('ja-JP')}</span>
                  <span>商談中 ¥{totals.negotiating_amount.toLocaleString('ja-JP')}</span>
                  <span>失注 ¥{totals.lost_amount.toLocaleString('ja-JP')}</span>
                </div>
              </>
            ) : (
              <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>データなし</p>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <RankingChart title="取扱件数 TOP10" items={totalCountRanking} color="#fbbf24" valueMode="count" />
            <RankingChart title="取扱金額 TOP10" items={totalAmountRanking} color="#60a5fa" valueMode="yen" />
            <RankingChart title="成約額 TOP10" items={contractedRanking} color="#4ade80" valueMode="yen" />
            <RankingChart title="粗利額 TOP10" items={grossProfitRanking} color="#a78bfa" valueMode="yen" />
            <RankingChart title="失注額 TOP10" items={lostRanking} color="#94a3b8" valueMode="yen" />
            <RankingChart title="成約率 TOP10" items={contractRateRanking} color="#22d3ee" valueMode="percent" />
            <StaffAmountStackChart title="担当者別 金額構成 TOP10" rows={rows} />
          </div>
        </>
      )}
    </div>
  )
}

export default function StaffPerformanceDashboardPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#e2e8f0' }}>読み込み中…</div>}>
      <StaffPerformanceDashboardContent />
    </Suspense>
  )
}
