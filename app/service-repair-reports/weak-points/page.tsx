'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  analyzeServiceRepairs,
  type ServiceRepairAnalysis,
  type ServiceRepairRow,
} from '@/lib/serviceRepairWeakPoints'

const pageStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 1200,
  margin: '0 auto',
  minHeight: '100vh',
  color: '#0f172a',
}
const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: 16,
  padding: 20,
}
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #cbd5e1',
  color: '#334155',
  fontSize: 13,
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #e2e8f0',
  fontSize: 13,
  verticalAlign: 'top',
}

function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ ...panelStyle, padding: '14px 16px' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function HBars({ items, color }: { items: { label: string; count: number }[]; color: string }) {
  const max = Math.max(...items.map((item) => item.count), 1)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 13 }}>
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </div>
          <div style={{ background: '#e2e8f0', borderRadius: 4, height: 10 }}>
            <div style={{ width: `${(item.count / max) * 100}%`, height: '100%', background: color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Donut({ slices }: { slices: { label: string; count: number; color: string }[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0) || 1
  const radius = 68
  const circ = 2 * Math.PI * radius
  let offset = 0
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 180 180" width="180" height="180" aria-hidden>
        <g transform="rotate(-90 90 90)">
          {slices.map((slice) => {
            const length = (slice.count / total) * circ
            const circle = (
              <circle
                key={slice.label}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="28"
                strokeDasharray={`${length} ${circ - length}`}
                strokeDashoffset={-offset}
              />
            )
            offset += length
            return circle
          })}
        </g>
        <text x="90" y="86" textAnchor="middle" fill="#0f172a" fontSize="22" fontWeight="700">{total}</text>
        <text x="90" y="108" textAnchor="middle" fill="#475569" fontSize="12">件</text>
      </svg>
      <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
        {slices.map((slice) => (
          <div key={slice.label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: slice.color }} />
            <span>{slice.label}</span>
            <strong>{slice.count}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function LineChart({ months }: { months: ServiceRepairAnalysis['months'] }) {
  const width = 720
  const height = 220
  const pad = { left: 32, right: 12, top: 16, bottom: 28 }
  const max = Math.max(...months.flatMap((month) => [month.heater, month.other]), 1)
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const x = (index: number) => pad.left + (months.length <= 1 ? innerW / 2 : (index / (months.length - 1)) * innerW)
  const y = (value: number) => pad.top + innerH - (value / max) * innerH
  const path = (key: 'heater' | 'other') => months.map((month, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(month[key])}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="月別出張件数">
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#cbd5e1" />
      <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#cbd5e1" />
      <text x="8" y={pad.top + 4} fill="#475569" fontSize="11">{max}</text>
      <path d={path('heater')} fill="none" stroke="#dc2626" strokeWidth="2" />
      <path d={path('other')} fill="none" stroke="#2563eb" strokeWidth="2" />
      {months.map((month, index) => (
        <g key={month.label}>
          <circle cx={x(index)} cy={y(month.heater)} r="2.5" fill="#dc2626" />
          <circle cx={x(index)} cy={y(month.other)} r="2.5" fill="#2563eb" />
          {index % 2 === 0 && (
            <text x={x(index)} y={height - 8} textAnchor="middle" fill="#475569" fontSize="10">{month.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

function Columns({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((item) => item.count), 1)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 6, alignItems: 'end', height: 180 }}>
      {items.map((item) => (
        <div key={item.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{item.count}</div>
          <div style={{ height: 130, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: '100%', height: `${(item.count / max) * 100}%`, background: '#334155', borderRadius: '4px 4px 0 0', minHeight: item.count ? 4 : 0 }} />
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{item.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function ServiceRepairWeakPointsPage() {
  const [analysis, setAnalysis] = useState<ServiceRepairAnalysis | null>(null)
  const [repairRequestCount, setRepairRequestCount] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const [{ data, error: reportError }, requestCount] = await Promise.all([
        supabase
          .from('service_repair_reports')
          .select('branch_id, work_date, category, model, treatment_details, remarks')
          .order('work_date', { ascending: true })
          .limit(5000),
        supabase.from('repair_requests').select('id', { count: 'exact', head: true }),
      ])
      if (reportError) {
        setError(reportError.message)
        return
      }
      setAnalysis(analyzeServiceRepairs((data || []) as ServiceRepairRow[]))
      setRepairRequestCount(requestCount.count ?? 0)
    }
    load()
  }, [])

  const heater = analysis?.heaterCount || 0
  const nozzle = analysis?.heaterParts[0]?.count || 0
  const nozzleRate = heater ? ((nozzle / heater) * 100).toFixed(1) : '0.0'
  const seasonRate = heater ? Math.round(((analysis?.seasonHeaters || 0) / heater) * 100) : 0
  const kCount = analysis?.combustion.find((item) => item.label === 'K系')?.count || 0
  const kRate = heater ? Math.round((kCount / heater) * 100) : 0

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>三州製品の出張修理統計とウィークポイント</h1>
          <p style={{ margin: '8px 0 0', color: '#475569' }}>
            出張修理管理表の分野・型式・処置内容から集計しています。件数は出張回数で、設置台数あたりの故障率ではありません。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/service-repair-reports">
            <button className="btn-3d" style={{ padding: '10px 16px', background: '#2563eb', border: '1px solid #1d4ed8' }}>
              出張修理管理表
            </button>
          </Link>
          <Link href="/selectors">
            <button className="btn-3d btn-reset" style={{ padding: '10px 16px', background: '#16a34a', border: '1px solid #15803d' }}>
              ← メニューに戻る
            </button>
          </Link>
        </div>
      </div>

      {error && <div style={{ ...panelStyle, marginBottom: 16, color: '#fecaca' }}>{error}</div>}
      {!analysis && !error && <div style={{ ...panelStyle }}>読み込み中...</div>}

      {analysis && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <StatCard value={String(analysis.total)} label="出張修理（全件）" color="#0f172a" />
            <StatCard value={String(analysis.sanshuCount)} label={`三州製品として分類（${analysis.sanshuRate.toFixed(1)}%）`} color="#1d4ed8" />
            <StatCard value={String(heater)} label={`ハウス暖房機（${analysis.total ? ((heater / analysis.total) * 100).toFixed(1) : '0.0'}%）`} color="#b91c1c" />
            <StatCard value={String(nozzle)} label={`暖房機のノズル交換（${nozzleRate}%）`} color="#c2410c" />
          </div>

          <div style={{ ...panelStyle, background: '#fff7ed', borderColor: '#fdba74' }}>
            母数は出張件数です。顧客名は出していません。
            {analysis.dateFrom && ` 作業日は ${analysis.dateFrom} から ${analysis.dateTo} です。`}
            {repairRequestCount === 0 && ' 修理案件管理の受付は0件のため、症状分類と交換部品マスタは使っていません。'}
            出荷台帳に多いL型の修理は少なく、型式の書き漏らしと、旧K・F系への偏りの両方があり得ます。
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <section style={panelStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>製品系列別の出張件数</h2>
              <Donut slices={analysis.families} />
              <p style={{ color: '#475569', fontSize: 12, marginBottom: 0 }}>
                その他は {analysis.otherBreakdown.map((item) => `${item.label}${item.count}件`).join('、')}。
              </p>
            </section>
            <section style={panelStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>月別出張件数</h2>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 8 }}>
                <span><span style={{ color: '#dc2626' }}>●</span> ハウス暖房機</span>
                <span><span style={{ color: '#2563eb' }}>●</span> 暖房機以外</span>
              </div>
              <LineChart months={analysis.months} />
            </section>
          </div>

          <p style={{ margin: 0, lineHeight: 1.7 }}>
            暖房機{heater}件のうち{analysis.seasonHeaters}件（{seasonRate}%）が2025年10月〜2026年2月です。夏は乾燥機・たばこ・梱包機に入れ替わります。弱点はシーズンに繰り返される部品で、600型が多いこと自体は出荷台数比がないため弱点とは断定できません。系統ではK系が{kCount}件（{kRate}%）です。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <section style={panelStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>容量別の出張件数</h2>
              <Columns items={analysis.capacities} />
            </section>
            <section style={panelStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>燃焼方式の系統</h2>
              <HBars items={analysis.combustion} color="#1e293b" />
            </section>
          </div>

          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>暖房機の処置に出てくる部品</h2>
            <HBars items={analysis.heaterParts} color="#dc2626" />
            <p style={{ color: '#475569', fontSize: 12 }}>
              1件の処置が複数部品に触れるため、合計は暖房機{heater}件を超えます。ノズル清掃の記載は別に{analysis.nozzleClean}件、交換の記載がない点検・調整は{analysis.inspectOnly}件です。
            </p>
          </section>

          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>系列ごとのウィークポイント</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['製品', '件数', '繰り返し出る部位', '読み取り'].map((header) => (
                      <th key={header} style={thStyle}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['ハウス暖房機 SK系', String(heater), `ノズル交換${nozzle}、電極${analysis.heaterParts[1].count}、送風機${analysis.heaterParts[2].count}、基板${analysis.heaterParts[3].count}、炎検知${analysis.heaterParts[4].count}`, '旧K系の燃焼消耗。シーズン入りで表面化する'],
                    ['光合成促進装置 SG/SGR', String(analysis.co2.total), `ノズル交換${analysis.co2.nozzle}、送風ファン${analysis.co2.fan}`, 'ノズル不良でハイリミットが作動した記録がある。母数は小さい'],
                    ['葉たばこ乾燥機・マイコン', String(analysis.tobacco.total), `温度センサ${analysis.tobacco.sensor}、マイコン・基板${analysis.tobacco.board}、ダンパ${analysis.tobacco.damper}`, '湿球・センサと制御。燃焼部品は少ない'],
                    ['梱包機', String(analysis.packer.total), 'AP-LSは基板・ロードセル、AT-1500/サンローダは加圧部', '機種で弱点が分かれる'],
                    ['食品乾燥機 SP・鰹節', String(analysis.food.total), `金属ホース${analysis.food.hose}、温度センサ${analysis.food.sensor}、カマ割れ${analysis.food.kama}`, '燃料ホースとセンサ。鰹節は燃焼室の割れ'],
                    ['他社（フルタ・豊国）', String(analysis.otherBreakdown[0].count), '送風機、ヒンジ、マイコン', '三州製品の弱点には数えない'],
                  ].map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => <td key={`${row[0]}-${index}`} style={tdStyle}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <section style={panelStyle}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>梱包機は機種で分かれる</h2>
              <p>
                AP-LSは{analysis.packer.apls}件中、基板{analysis.packer.aplsBoard}件、較正{analysis.packer.aplsCal}件、ロードセル{analysis.packer.aplsLoad}件です。計量部とメイン基板が弱点です。
              </p>
              <p style={{ marginBottom: 0 }}>
                サンローダとAT-1500は{analysis.packer.sun}件中、加圧部{analysis.packer.sunPress}件、チェーン{analysis.packer.sunChain}件、モータ{analysis.packer.sunMotor}件です。駆動と加圧機構側です。
              </p>
            </section>
            <section style={panelStyle}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>乾燥機側で設計に近い記録</h2>
              <p>
                食品乾燥機では金属ホースの交換が{analysis.food.hose}件、温度センサが{analysis.food.sensor}件です。熱が当たる燃料経路と検知素子です。鰹節乾燥機ではカマ割れが{analysis.food.kama}件あり、消耗品交換ではなく本体側の損傷です。
              </p>
              <p style={{ marginBottom: 0 }}>
                葉たばこ側はセンサ{analysis.tobacco.sensor}件、マイコン・基板{analysis.tobacco.board}件、ダンパ{analysis.tobacco.damper}件です。
              </p>
            </section>
          </div>

          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>営業所</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {analysis.branches.map((branch) => (
                <div key={branch.name}>{branch.name} {branch.total}件（暖房機 {branch.heater}件）</div>
              ))}
            </div>
          </section>

          <div style={{ ...panelStyle, background: '#f8fafc', color: '#334155', fontSize: 13 }}>
            自由記述のため、部品名を書かない「点検」「動作確認」は弱点に入っていません。1台が複数回出張していても台数には分解していません。記録がある営業所だけの分布です。
          </div>
        </div>
      )}
    </div>
  )
}
