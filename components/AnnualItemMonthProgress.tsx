'use client'

import type { ItemMonthProgressResult } from '@/lib/annualPlanItemProgress'
import { planMuted, planTd, planTh } from '@/lib/annualPlanUi'

function fmtQty(n: number) {
  if (!Number.isFinite(n) || n === 0) return ''
  return n.toLocaleString('ja-JP')
}

function fmtUnmatchedCell(qty: number, amount: number) {
  const yen = Number.isFinite(amount) && amount !== 0 ? `${Math.round(amount).toLocaleString('ja-JP')}円` : ''
  if (qty > 0 && yen) return `${qty.toLocaleString('ja-JP')}台 / ${yen}`
  if (yen) return yen
  if (qty > 0) return `${qty.toLocaleString('ja-JP')}台`
  return ''
}

function planCell(qty: number, amount: number, useQty: boolean) {
  if (useQty) return `${qty.toLocaleString('ja-JP')} 台`
  return `${Math.round(amount).toLocaleString('ja-JP')} 円`
}

function remainingText(row: ItemMonthProgressResult['rows'][number]) {
  if (row.useQty) {
    if (row.remainingQty > 0) return `あと ${row.remainingQty.toLocaleString('ja-JP')} 台`
    if (row.remainingQty === 0) return '完了'
    return `超過 ${Math.abs(row.remainingQty).toLocaleString('ja-JP')} 台`
  }
  if (row.remainingAmount > 0) return `あと ${Math.round(row.remainingAmount).toLocaleString('ja-JP')} 円`
  if (row.remainingAmount === 0) return '完了'
  return `超過 ${Math.round(Math.abs(row.remainingAmount)).toLocaleString('ja-JP')} 円`
}

function remainingColor(row: ItemMonthProgressResult['rows'][number]) {
  const left = row.useQty ? row.remainingQty : row.remainingAmount
  if (left > 0) return '#fbbf24'
  if (left === 0) return '#86efac'
  return '#fca5a5'
}

export function AnnualItemMonthProgress(props: {
  title?: string
  caption?: string
  data: ItemMonthProgressResult | null
  loading?: boolean
  emptyText?: string
}) {
  const data = props.data
  const unmatchedCats =
    data?.unmatchedByCategory && data.unmatchedByCategory.length > 0
      ? data.unmatchedByCategory
      : data && data.unmatched.qtyTotal + data.unmatched.amountTotal > 0
        ? [{ category: 'その他', ...data.unmatched }]
        : []

  return (
    <section>
      <h2 style={{ fontSize: 16, color: '#f8fafc', marginBottom: 4 }}>{props.title || '品名別 月次進捗'}</h2>
      <p style={{ ...planMuted, fontSize: 12, marginTop: 0 }}>
        {props.caption ||
          '品名ごとにExcel売上（請求日）の月次を突合します。中間列は中間修正があれば修正後、なければ当初のままです。残は中間計画に対する値です。その他は商品CD（先頭000無視）で分け、機種指定した商品は除きます。計画に無い売上はExcel科目別に税抜で出ます。'}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ ...planTh, textAlign: 'left' }}>カテゴリ</th>
              <th style={{ ...planTh, textAlign: 'left' }}>品名</th>
              <th style={{ ...planTh, textAlign: 'right' }}>当初</th>
              <th style={{ ...planTh, textAlign: 'right' }}>中間</th>
              {(data?.months || []).map((m) => (
                <th key={m.key} style={{ ...planTh, textAlign: 'right' }}>
                  {m.label}
                </th>
              ))}
              <th style={{ ...planTh, textAlign: 'right' }}>累計</th>
              <th style={{ ...planTh, textAlign: 'right' }}>残</th>
            </tr>
          </thead>
          <tbody>
            {props.loading && (
              <tr>
                <td colSpan={18} style={{ ...planTd, color: '#94a3b8' }}>
                  読み込み中…
                </td>
              </tr>
            )}
            {!props.loading && (!data || (data.rows.length === 0 && unmatchedCats.length === 0)) && (
              <tr>
                <td colSpan={18} style={{ ...planTd, color: '#94a3b8' }}>
                  {props.emptyText || '計画の品名がありません。'}
                </td>
              </tr>
            )}
            {!props.loading &&
              data?.rows.map((row) => (
                <tr key={row.key}>
                  <td style={planTd}>{row.category}</td>
                  <td style={planTd}>
                    {row.label}
                    {row.revised ? (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#fbbf24' }}>中間修正あり</span>
                    ) : null}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right' }}>
                    {planCell(row.planQty, row.planAmount, row.useQty)}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', color: row.revised ? '#fbbf24' : undefined }}>
                    {planCell(row.currentQty ?? row.planQty, row.currentAmount ?? row.planAmount, row.useQty)}
                  </td>
                  {row.soldQty.map((qty, i) => (
                    <td key={data.months[i].key} style={{ ...planTd, textAlign: 'right' }}>
                      {row.useQty ? fmtQty(qty) : fmtQty(Math.round(row.soldAmount[i]))}
                    </td>
                  ))}
                  <td style={{ ...planTd, textAlign: 'right' }}>
                    {row.useQty
                      ? `${row.soldQtyTotal.toLocaleString('ja-JP')} 台`
                      : `${Math.round(row.soldAmountTotal).toLocaleString('ja-JP')} 円`}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', color: remainingColor(row), fontWeight: 700 }}>
                    {remainingText(row)}
                  </td>
                </tr>
              ))}
            {!props.loading &&
              unmatchedCats.map((row) => (
                <tr key={`unmatched-${row.category}`}>
                  <td style={{ ...planTd, color: '#94a3b8' }}>{row.category}</td>
                  <td style={{ ...planTd, color: '#94a3b8' }}>計画に無い売上</td>
                  <td style={{ ...planTd, textAlign: 'right', color: '#94a3b8' }}>—</td>
                  <td style={{ ...planTd, textAlign: 'right', color: '#94a3b8' }}>—</td>
                  {row.amount.map((amount, i) => (
                    <td key={data?.months[i]?.key || i} style={{ ...planTd, textAlign: 'right', color: '#94a3b8' }}>
                      {fmtUnmatchedCell(row.qty[i], amount)}
                    </td>
                  ))}
                  <td style={{ ...planTd, textAlign: 'right', color: '#94a3b8' }}>
                    {fmtUnmatchedCell(row.qtyTotal, row.amountTotal)}
                  </td>
                  <td style={{ ...planTd, textAlign: 'right', color: '#94a3b8' }}>—</td>
                </tr>
              ))}
            {!props.loading && unmatchedCats.length > 1 && data && (
              <tr>
                <td style={{ ...planTd, color: '#cbd5e1', fontWeight: 700 }}>合計</td>
                <td style={{ ...planTd, color: '#cbd5e1', fontWeight: 700 }}>計画に無い売上</td>
                <td style={{ ...planTd, textAlign: 'right' }}>—</td>
                <td style={{ ...planTd, textAlign: 'right' }}>—</td>
                {data.unmatched.amount.map((amount, i) => (
                  <td key={data.months[i].key} style={{ ...planTd, textAlign: 'right', color: '#cbd5e1', fontWeight: 700 }}>
                    {fmtUnmatchedCell(data.unmatched.qty[i], amount)}
                  </td>
                ))}
                <td style={{ ...planTd, textAlign: 'right', color: '#cbd5e1', fontWeight: 700 }}>
                  {fmtUnmatchedCell(data.unmatched.qtyTotal, data.unmatched.amountTotal)}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
