import { planMuted, planPanel } from '@/lib/annualPlanUi'

function yen(v: number) {
  return `${Math.round(v).toLocaleString('ja-JP')} 円`
}

export function AnnualQuotaHint(props: {
  title: string
  quotaAmount: number
  planAmount: number
  caption?: string
}) {
  if (!(props.quotaAmount > 0)) return null
  const gap = props.planAmount - props.quotaAmount
  const ratio = Math.min(Math.max(props.planAmount / props.quotaAmount, 0), 1)
  const gapLabel = gap >= 0 ? `余裕 ${yen(gap)}` : `不足 ${yen(-gap)}`
  return (
    <div style={{ ...planPanel, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ color: '#e2e8f0' }}>{props.title}</span>
        <span style={planMuted}>
          計画 {yen(props.planAmount)} / ノルマ {yen(props.quotaAmount)} · {gapLabel}
        </span>
      </div>
      <div style={{ height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden', border: '1px solid #334155' }}>
        <div
          style={{
            width: `${Math.round(ratio * 100)}%`,
            height: '100%',
            background: gap >= 0 ? '#22c55e' : '#f59e0b',
          }}
        />
      </div>
      {props.caption && (
        <p style={{ ...planMuted, fontSize: 12, margin: '6px 0 0' }}>{props.caption}</p>
      )}
    </div>
  )
}
