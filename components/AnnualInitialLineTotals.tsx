'use client'

import { initialLineTotalsByCategory, type AnnualPlanLine } from '@/lib/annualPlanClient'
import { planMuted, planTd, planTh } from '@/lib/annualPlanUi'

function yen(n: number) {
  return `${Math.round(n).toLocaleString('ja-JP')} 円`
}

function pct(n: number, d: number) {
  if (!(d > 0)) return '—'
  return `${(Math.round((n / d) * 1000) / 10).toLocaleString('ja-JP')}%`
}

function qtyText(n: number) {
  return n > 0 ? n.toLocaleString('ja-JP') : '—'
}

function remainingText(plan: number, actual: number) {
  const left = plan - actual
  if (!(plan > 0) && !(actual > 0)) return '—'
  if (left > 0) return `あと ${yen(left)}`
  if (left === 0) return '完了'
  return `超過 ${yen(Math.abs(left))}`
}

function remainingColor(plan: number, actual: number) {
  const left = plan - actual
  if (!(plan > 0) && !(actual > 0)) return undefined
  if (left > 0) return '#fbbf24'
  if (left === 0) return '#86efac'
  return '#fca5a5'
}

export function AnnualInitialLineTotals(props: {
  title?: string
  lines: AnnualPlanLine[]
  excelByCategory?: Record<string, number>
}) {
  const { rows, grandInitial, grandCurrent } = initialLineTotalsByCategory(props.lines)
  const excelByCategory = props.excelByCategory || {}
  const excelTotal = rows.reduce((s, r) => s + Number(excelByCategory[r.cat] || 0), 0)

  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      {props.title ? (
        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#f8fafc' }}>{props.title}</h3>
      ) : null}
      <table style={{ width: '100%', maxWidth: 1100, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['科目', '当初台数', '当初計画額', '中間台数', '中間計画額', 'Excel実績', '対中間', '残'].map((h) => (
              <th key={h} style={{ ...planTh, textAlign: h === '科目' ? 'left' : 'right' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const excel = Number(excelByCategory[r.cat] || 0)
            return (
              <tr key={r.cat}>
                <td style={planTd}>
                  {r.label}
                  {r.hasInterim ? (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#fbbf24' }}>中間修正あり</span>
                  ) : null}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>{qtyText(r.initial.qty)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.initial.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{qtyText(r.current.qty)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(r.current.amount)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{yen(excel)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{pct(excel, r.current.amount)}</td>
                <td
                  style={{
                    ...planTd,
                    textAlign: 'right',
                    color: remainingColor(r.current.amount, excel),
                    fontWeight: 700,
                  }}
                >
                  {remainingText(r.current.amount, excel)}
                </td>
              </tr>
            )
          })}
          <tr>
            <td style={{ ...planTd, fontWeight: 700 }}>総合計</td>
            <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{qtyText(grandInitial.qty)}</td>
            <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(grandInitial.amount)}</td>
            <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{qtyText(grandCurrent.qty)}</td>
            <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(grandCurrent.amount)}</td>
            <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{yen(excelTotal)}</td>
            <td style={{ ...planTd, textAlign: 'right', fontWeight: 700 }}>{pct(excelTotal, grandCurrent.amount)}</td>
            <td
              style={{
                ...planTd,
                textAlign: 'right',
                fontWeight: 700,
                color: remainingColor(grandCurrent.amount, excelTotal),
              }}
            >
              {remainingText(grandCurrent.amount, excelTotal)}
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ ...planMuted, fontSize: 12, margin: '8px 0 0' }}>
        中間計画は、中間修正がある品名は修正後の数量・金額、変更のない品名・科目は当初のままです。Excel実績は税抜。達成率と残は中間計画額に対する値です。生産品は暖房機・たばこ乾燥機・食品乾燥機等の合算です。
      </p>
    </div>
  )
}
