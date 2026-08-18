'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_OPTIONS,
  PLAN_CATEGORIES,
  displayPlanCategory,
  type PlanConfidence,
} from '@/lib/annualPlanCategories'
import {
  addPlanLine,
  confirmPlan,
  deletePlanLine,
  fetchPlanLines,
  fetchPlanStaffs,
  formatPlanDbError,
  getOrCreatePlan,
  lineTotals,
  type AnnualPlan,
  type AnnualPlanLine,
  type StaffOption,
} from '@/lib/annualPlanClient'
import {
  defaultSheetFiscalYear,
  fiscalYearLabel,
  fiscalYearOptions,
} from '@/lib/annualPlanFiscal'
import type { PlanMachine } from '@/lib/annualPlanMachines'
import {
  planBtn,
  planInput,
  planMuted,
  planPageStyle,
  planPanel,
  planTd,
  planTh,
} from '@/lib/annualPlanUi'

function AnnualPlanSheetContent() {
  const searchParams = useSearchParams()
  const [staffs, setStaffs] = useState<StaffOption[]>([])
  const [staffId, setStaffId] = useState(() => searchParams.get('staff') || '')
  const [fiscalYear, setFiscalYear] = useState(() => {
    const q = Number(searchParams.get('fy'))
    return Number.isFinite(q) && q > 2000 ? q : defaultSheetFiscalYear()
  })
  const [plan, setPlan] = useState<AnnualPlan | null>(null)
  const [lines, setLines] = useState<AnnualPlanLine[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [category, setCategory] = useState<string>(PLAN_CATEGORIES[0])
  const [machines, setMachines] = useState<PlanMachine[]>([])
  const [machineCode, setMachineCode] = useState('')
  const [machineWarning, setMachineWarning] = useState<string | null>(null)
  const [qty, setQty] = useState('1')
  const [amount, setAmount] = useState('')
  const [confidence, setConfidence] = useState<PlanConfidence>('high')

  const totals = useMemo(() => lineTotals(lines), [lines])
  const selectedMachine = machines.find((m) => m.code === machineCode) || null
  const canAdd =
    Boolean(staffId && category && machineCode && Number(qty) > 0 && Number(amount) > 0) && !saving

  const loadPlan = useCallback(async () => {
    if (!staffId) {
      setPlan(null)
      setLines([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const nextPlan = await getOrCreatePlan(fiscalYear, staffId)
      const nextLines = await fetchPlanLines(nextPlan.id)
      setPlan(nextPlan)
      setLines(nextLines)
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
      setPlan(null)
      setLines([])
    } finally {
      setLoading(false)
    }
  }, [fiscalYear, staffId])

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchPlanStaffs()
        setStaffs(list)
        if (!staffId && list[0]) setStaffId(list[0].id)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadPlan()
  }, [loadPlan])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setMachines([])
      setMachineCode('')
      setMachineWarning(null)
      try {
        const res = await fetch(`/api/plan/annual/machines?category=${encodeURIComponent(category)}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok || !json.ok) {
          setMachineWarning(json.error || '機種の取得に失敗しました')
          return
        }
        setMachines(json.machines || [])
        setMachineWarning(json.warning || null)
        if (json.machines?.[0]) setMachineCode(json.machines[0].code)
      } catch (e) {
        if (!cancelled) setMachineWarning(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [category])

  const handleAdd = async () => {
    if (!plan || !canAdd || !selectedMachine) return
    setSaving(true)
    setError('')
    try {
      const line = await addPlanLine({
        planId: plan.id,
        category,
        machine_code: selectedMachine.code,
        machine_name: selectedMachine.name,
        machine_source: selectedMachine.source,
        qty: Number(qty),
        amount: Number(amount),
        confidence,
      })
      setLines((prev) => [...prev, line])
      setAmount('')
      setQty('1')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (line: AnnualPlanLine) => {
    if (!plan) return
    const reason =
      plan.status === 'confirmed' ? window.prompt('変更理由（確定後の削除）', '') : ''
    if (plan.status === 'confirmed' && (reason == null || !reason.trim())) return
    setSaving(true)
    try {
      await deletePlanLine(plan.id, line.id, reason || undefined)
      setLines((prev) => prev.filter((r) => r.id !== line.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!plan || lines.length === 0) return
    if (!window.confirm('現在の行合計を当初計画として確定します。確定後も行の追加・削除はできます。')) return
    setSaving(true)
    try {
      const next = await confirmPlan(plan, lines)
      setPlan(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = planInput

  return (
    <div style={planPageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: '#f8fafc' }}>年度計画（個人シート）</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/plan/annual?fy=${fiscalYear}`}>
            <button style={{ ...planBtn, background: '#3b82f6', color: '#fff', borderColor: '#2563eb' }}>集計</button>
          </Link>
          <Link href="/selectors">
            <button style={{ ...planBtn, background: '#16a34a', color: '#fff', borderColor: '#15803d' }}>メニューへ戻る</button>
          </Link>
        </div>
      </div>

      <p style={{ ...planMuted, marginTop: 0 }}>
        {fiscalYearLabel(fiscalYear)}。カテゴリは factory-materials の機種マスタと同じです（暖房機・たばこ乾燥機など）。選んだカテゴリの機種だけが出ます。肥料・農薬・資材は見積の商品マスタです。
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <label>
          担当者{' '}
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={inputStyle}>
            {staffs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          年度{' '}
          <select value={String(fiscalYear)} onChange={(e) => setFiscalYear(Number(e.target.value))} style={inputStyle}>
            {fiscalYearOptions().map((y) => (
              <option key={y} value={y}>
                {fiscalYearLabel(y)}
              </option>
            ))}
          </select>
        </label>
        <span style={{ alignSelf: 'center', ...planMuted }}>
          {plan?.status === 'confirmed' ? '確定済（途中変更可）' : '下書き'}
          {loading ? ' …読込中' : ''}
        </span>
      </div>

      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}

      <section style={planPanel}>
        <h2 style={{ marginTop: 0, fontSize: 16, color: '#f8fafc' }}>行を追加</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ color: '#e2e8f0' }}>
            1. カテゴリ
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {PLAN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={{ color: '#e2e8f0' }}>
            2. 機種（{machines.length}件）
            <select value={machineCode} onChange={(e) => setMachineCode(e.target.value)} style={inputStyle}>
              {machines.length === 0 && <option value="">機種がありません</option>}
              {machines.map((m) => (
                <option key={`${m.source}-${m.code}`} value={m.code}>
                  {m.code} {m.name && m.name !== m.code ? ` ${m.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label style={{ color: '#e2e8f0' }}>
            3. 計画台数
            <input type="number" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ color: '#e2e8f0' }}>
            4. 計画額（円）
            <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#e2e8f0' }}>5. 確度</span>
          {CONFIDENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setConfidence(opt.value)}
              style={{
                ...planBtn,
                background: confidence === opt.value ? '#38bdf8' : '#1e293b',
                color: confidence === opt.value ? '#0f172a' : '#e2e8f0',
                borderColor: confidence === opt.value ? '#38bdf8' : '#475569',
              }}
            >
              {opt.label}
            </button>
          ))}
          <button type="button" onClick={() => void handleAdd()} disabled={!canAdd} style={{ ...planBtn, background: '#2563eb', color: '#fff', borderColor: '#1d4ed8', opacity: canAdd ? 1 : 0.5 }}>
            追加
          </button>
        </div>
        {machineWarning && <p style={{ color: '#fbbf24', marginBottom: 0 }}>{machineWarning}</p>}
      </section>

      <h2 style={{ fontSize: 16, color: '#f8fafc' }}>追加済みの行</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              {['カテゴリ', '機種', '台数', '計画額', '粗利', '確度', ''].map((h) => (
                <th key={h || 'actions'} style={{ ...planTh, textAlign: h === 'カテゴリ' || h === '機種' ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...planTd, color: '#94a3b8' }}>
                  まだ行がありません。上のフォームから追加してください。
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <td style={planTd}>{displayPlanCategory(line.category)}</td>
                <td style={planTd}>
                  {line.machine_code}
                  {line.machine_name ? ` ${line.machine_name}` : ''}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>{Number(line.qty).toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{Number(line.amount).toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{Number(line.gross_profit).toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'center' }}>{CONFIDENCE_LABEL[line.confidence]}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>
                  <button type="button" onClick={() => void handleDelete(line)} disabled={saving} style={planBtn}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>計画額 {totals.amount.toLocaleString('ja-JP')} 円</strong>
        <strong>粗利 {totals.gp.toLocaleString('ja-JP')} 円</strong>
        <span>確度見込 {Math.round(totals.weighted).toLocaleString('ja-JP')} 円（●100% ▲50% □0%）</span>
        {plan?.status !== 'confirmed' && (
          <button type="button" onClick={() => void handleConfirm()} disabled={saving || lines.length === 0} style={{ ...planBtn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>
            当初計画として確定
          </button>
        )}
        {plan?.status === 'confirmed' && plan.initial_amount != null && (
          <span style={planMuted}>
            当初 {Number(plan.initial_amount).toLocaleString('ja-JP')} 円
          </span>
        )}
      </div>
    </div>
  )
}

export default function AnnualPlanSheetPage() {
  return (
    <Suspense fallback={<div style={{ ...planPageStyle, padding: 24 }}>読み込み中…</div>}>
      <AnnualPlanSheetContent />
    </Suspense>
  )
}
