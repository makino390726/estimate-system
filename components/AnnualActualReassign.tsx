'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchActualAssignmentLines, saveActualAssignment } from '@/lib/annualPlanClient'
import { fiscalMonthSlots } from '@/lib/annualPlanFiscal'
import type { ActualTrace, AssignmentTarget } from '@/lib/annualPlanItemProgress'
import { planBtn, planInput, planMuted, planTd, planTh } from '@/lib/annualPlanUi'

const VIEWS = [
  { id: '工事その他', label: '工事その他' },
  { id: '資材その他', label: '資材その他' },
  { id: '生産品その他', label: '生産品その他' },
  { id: '肥料その他', label: '肥料その他' },
  { id: '農薬その他', label: '農薬その他' },
  { id: 'coded', label: '商品コード付き' },
  { id: 'changed', label: '振り替え済み' },
  { id: 'all', label: 'すべて' },
]

function money(value: number) {
  return `${Math.round(value).toLocaleString('ja-JP')}円`
}

export function AnnualActualReassign(props: {
  fiscalYear: number
  staffId: string
  planStamp: string
  onSaved: () => void
}) {
  const [view, setView] = useState('工事その他')
  const [monthIndex, setMonthIndex] = useState<number | 'all'>('all')
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<ActualTrace[]>([])
  const [targets, setTargets] = useState<AssignmentTarget[]>([])
  const [total, setTotal] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [ready, setReady] = useState(true)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const months = useMemo(() => fiscalMonthSlots(props.fiscalYear), [props.fiscalYear])
  const monthKey = monthIndex === 'all' ? 'all' : months[monthIndex]?.key || 'all'

  function applyLines(next: Awaited<ReturnType<typeof fetchActualAssignmentLines>>) {
    setRows(next.rows)
    setTargets(next.targets)
    setTotal(next.total)
    setTruncated(next.truncated)
    setReady(next.assignmentsReady)
    setSetupMessage(next.setupMessage)
    setMonthCounts(next.monthCounts || {})
  }

  useEffect(() => {
    if (!props.staffId) {
      setRows([])
      setTotal(0)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const next = await fetchActualAssignmentLines(props.fiscalYear, props.staffId, view, monthKey)
        if (cancelled) return
        applyLines(next)
      } catch (e: unknown) {
        if (!cancelled) {
          setRows([])
          setError(e instanceof Error ? e.message : '売上明細の取得に失敗しました')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.fiscalYear, props.staffId, props.planStamp, view, monthKey])

  async function changeTarget(row: ActualTrace, targetKey: string) {
    if (!ready || targetKey === row.targetKey) return
    setSavingKey(row.fingerprint)
    setError('')
    try {
      await saveActualAssignment(props.fiscalYear, props.staffId, row.fingerprint, targetKey)
      const next = await fetchActualAssignmentLines(props.fiscalYear, props.staffId, view, monthKey)
      applyLines(next)
      props.onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '振り替えの保存に失敗しました')
    } finally {
      setSavingKey('')
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, color: '#f8fafc', marginBottom: 4 }}>実績明細の振り替え</h2>
      <p style={{ ...planMuted, fontSize: 12, marginTop: 0 }}>
        工事その他などに入った明細を、請求月を選んで確認し、資材その他や計画の品目へ振り替えます。商品コードで自動的に紐づいた明細も、同じ操作で訂正できます。空欄に戻すと自動判定に戻ります。請求日・伝票・得意先・品名・数量・金額が同じ明細は、まとめて同じ振り替えになります。
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ ...planMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
          請求月
          <select
            value={monthIndex === 'all' ? 'all' : String(monthIndex)}
            onChange={(e) => setMonthIndex(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{ ...planInput, width: 'auto', minWidth: 160 }}
          >
            <option value="all">すべての月</option>
            {months.map((slot) => (
              <option key={slot.key} value={String(slot.index)}>
                {slot.year}年{slot.label}（{(monthCounts[slot.key] || 0).toLocaleString('ja-JP')}件）
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {VIEWS.map((item) => {
          const active = item.id === view
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              style={{
                ...planBtn,
                background: active ? '#0f766e' : planBtn.background,
                borderColor: active ? '#0f766e' : '#475569',
                color: '#fff',
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {setupMessage && <p style={{ color: '#fcd34d', fontSize: 13 }}>{setupMessage}</p>}
      {error && <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>}
      <p style={{ ...planMuted, fontSize: 12 }}>
        {loading ? '読み込み中…' : `${total.toLocaleString('ja-JP')}件`}
        {truncated ? '（先頭500件を表示しています）' : ''}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              {['請求日', '伝票', '得意先', '商品CD', '品名', '数量', '税抜金額', 'いまの計上先', '振り替え先'].map((label) => (
                <th key={label} style={{ ...planTh, whiteSpace: 'nowrap' }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const known = targets.some((target) => target.key === row.targetKey)
              return (
                <tr key={`${row.fingerprint}:${index}`}>
                  <td style={{ ...planTd, whiteSpace: 'nowrap' }}>{row.billedOn || ''}</td>
                  <td style={{ ...planTd, whiteSpace: 'nowrap' }}>{row.slipNo || ''}</td>
                  <td style={planTd}>{row.customerName || ''}</td>
                  <td style={{ ...planTd, whiteSpace: 'nowrap' }}>{row.productCode || ''}</td>
                  <td style={planTd}>{row.productName || ''}</td>
                  <td style={{ ...planTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {Number(row.qty || 0).toLocaleString('ja-JP')}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(row.amount)}</td>
                  <td style={{ ...planTd, whiteSpace: 'nowrap' }}>
                    {row.targetLabel}
                    {row.overridden ? `（自動: ${row.autoLabel}）` : ''}
                  </td>
                  <td style={{ ...planTd, minWidth: 220 }}>
                    <select
                      value={row.targetKey}
                      disabled={!ready || savingKey === row.fingerprint}
                      onChange={(e) => void changeTarget(row, e.target.value)}
                      style={planInput}
                    >
                      {row.overridden && <option value="">自動判定に戻す（{row.autoLabel}）</option>}
                      {!known && <option value={row.targetKey}>{row.targetLabel}</option>}
                      {targets.map((target) => (
                        <option key={target.key} value={target.key}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td style={planTd} colSpan={9}>
                  {monthKey === 'all' ? 'この区分の明細はありません。' : 'この月の明細はありません。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
