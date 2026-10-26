'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fiscalYearFromDate, fiscalYearLabel, fiscalYearOptions } from '@/lib/annualPlanFiscal'
import { planInput, planMuted, planPageStyle, planPanel, planTd, planTh } from '@/lib/annualPlanUi'
import type { AnalysisTable } from '@/lib/salesAnalysisBuild'
import { findSalesAnalysisItem } from '@/lib/salesAnalysisMenu'

type Payload = {
  ok: boolean
  error?: string
  note?: string
  rowCount?: number
  priorRowCount?: number
  kpis?: { label: string; value: string }[]
  tables?: AnalysisTable[]
}

export default function SalesAnalysisViewPage() {
  const params = useParams<{ view: string }>()
  const view = String(params.view || '')
  const item = findSalesAnalysisItem(view)
  const [fiscalYear, setFiscalYear] = useState(fiscalYearFromDate())
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!item) return
    let alive = true
    setLoading(true)
    fetch(`/api/plan/sales-analysis?fy=${fiscalYear}&view=${encodeURIComponent(view)}`)
      .then((res) => res.json())
      .then((json: Payload) => {
        if (alive) setPayload(json)
      })
      .catch((error: unknown) => {
        if (alive) setPayload({ ok: false, error: error instanceof Error ? error.message : '集計に失敗しました' })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [fiscalYear, item, view])

  if (!item) {
    return (
      <div style={{ ...planPageStyle, minHeight: 0, maxWidth: 'none', margin: 0 }}>
        <p>この分析メニューはありません。</p>
      </div>
    )
  }

  return (
    <div style={{ ...planPageStyle, minHeight: 0, maxWidth: 'none', margin: 0 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>{item.label}</h1>
      <p style={{ ...planMuted, marginTop: 0 }}>{item.description}</p>
      <label style={{ ...planMuted, display: 'inline-flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        年度
        <select value={fiscalYear} onChange={(event) => setFiscalYear(Number(event.target.value))} style={{ ...planInput, width: 'auto', minWidth: 280 }}>
          {(fiscalYearOptions().includes(fiscalYear) ? fiscalYearOptions() : [fiscalYear, ...fiscalYearOptions()]).map((year) => (
            <option key={year} value={year}>
              {fiscalYearLabel(year)}
            </option>
          ))}
        </select>
      </label>
      {loading && <p style={planMuted}>集計中…</p>}
      {!loading && payload && !payload.ok && <p style={{ color: '#fca5a5' }}>{payload.error || '集計に失敗しました'}</p>}
      {!loading && payload?.ok && payload.rowCount === 0 && (
        <p style={{ color: '#fde68a' }}>
          {fiscalYearLabel(fiscalYear)}の売上Excelがまだありません。年度計画進捗の「売上Excel取込」から取り込んでください。
        </p>
      )}
      {!loading && payload?.ok && !!payload.rowCount && (
        <>
          {payload.note && <p style={{ color: '#fde68a' }}>{payload.note}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {(payload.kpis || []).map((kpi) => (
              <div key={kpi.label} style={planPanel}>
                <div style={{ fontSize: 12, ...planMuted }}>{kpi.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi.value}</div>
              </div>
            ))}
          </div>
          {(payload.tables || []).map((table) => (
            <section key={table.title} style={{ ...planPanel, overflowX: 'auto' }}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>{table.title}</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column.key} style={{ ...planTh, textAlign: column.align || 'left' }}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length === 0 && (
                    <tr>
                      <td colSpan={table.columns.length} style={planTd}>
                        該当データがありません。
                      </td>
                    </tr>
                  )}
                  {table.rows.map((row, index) => (
                    <tr key={`${table.title}-${index}`}>
                      {table.columns.map((column) => (
                        <td key={column.key} style={{ ...planTd, textAlign: column.align || 'left' }}>
                          {row[column.key] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
