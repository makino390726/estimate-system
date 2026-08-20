'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CHANGE_KIND_LABEL,
  CHANGE_KIND_OPTIONS,
  CONFIDENCE_LABEL,
  CONFIDENCE_OPTIONS,
  PLAN_CATEGORIES,
  displayPlanCategory,
  isAmountOnlyPlanCategory,
  lineChangeKind,
  type PlanChangeKind,
  type PlanConfidence,
} from '@/lib/annualPlanCategories'
import {
  addPlanLine,
  confirmPlan,
  deletePlanLine,
  displayPlanLineMachine,
  fetchPlanLines,
  fetchPlanStaffs,
  formatPlanDbError,
  getOrCreatePlan,
  splitPlanTotals,
  updateLineChangeKind,
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

const PRODUCT_PAGE_SIZE = 20

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
  const [productQuery, setProductQuery] = useState('')
  const [productHits, setProductHits] = useState<PlanMachine[]>([])
  const [productSearching, setProductSearching] = useState(false)
  const [productPage, setProductPage] = useState(1)
  const [productTotal, setProductTotal] = useState(0)
  const [productTotalPages, setProductTotalPages] = useState(1)
  const [pickedProduct, setPickedProduct] = useState<PlanMachine | null>(null)
  const [qty, setQty] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [confidence, setConfidence] = useState<PlanConfidence>('high')
  const [changeKind, setChangeKind] = useState<PlanChangeKind | null>(null)

  const amountOnly = isAmountOnlyPlanCategory(category)
  const pickedMasterProduct = Boolean(pickedProduct) || (amountOnly && Boolean(machineCode))
  const lumpMode = amountOnly && !pickedMasterProduct
  const confirmed = plan?.status === 'confirmed'
  const totals = useMemo(() => splitPlanTotals(lines), [lines])
  const selectedMachine = pickedProduct || machines.find((m) => m.code === machineCode) || null
  const qtyNum = Number(qty)
  const unitNum = Number(unitPrice)
  const calcAmount = qtyNum > 0 && unitNum > 0 ? Math.round(qtyNum * unitNum) : 0
  const amountNum = lumpMode ? Number(amount) : calcAmount
  const baseCanAdd = lumpMode
    ? Boolean(staffId && category && amountNum > 0)
    : Boolean(staffId && category && selectedMachine && qtyNum > 0 && calcAmount > 0)
  const canAdd = baseCanAdd && (!confirmed || Boolean(changeKind)) && !saving

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
      setUnitPrice('')
      setPickedProduct(null)
      setProductQuery('')
      setProductHits([])
      setProductPage(1)
      setProductTotal(0)
      setProductTotalPages(1)
      try {
        const res = await fetch(`/api/plan/annual/machines?category=${encodeURIComponent(category)}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok || !json.ok) {
          setMachineWarning(json.error || '機種の取得に失敗しました')
          return
        }
        const list = (json.machines || []) as PlanMachine[]
        setMachines(list)
        setMachineWarning(json.warning || null)
        if (isAmountOnlyPlanCategory(category)) {
          setQty('')
          setAmount('')
        } else {
          setQty('1')
          if (list[0]) {
            setMachineCode(list[0].code)
            setUnitPrice(list[0].retailPrice ? String(list[0].retailPrice) : '')
          }
        }
      } catch (e) {
        if (!cancelled) setMachineWarning(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [category])

  useEffect(() => {
    if (lumpMode) return
    const price = pickedProduct?.retailPrice ?? machines.find((m) => m.code === machineCode)?.retailPrice ?? null
    setUnitPrice(price ? String(price) : '')
  }, [lumpMode, machineCode, pickedProduct, machines])

  useEffect(() => {
    const q = productQuery.trim()
    if (q.length < 1) {
      setProductHits([])
      setProductSearching(false)
      setProductTotal(0)
      setProductTotalPages(1)
      return
    }
    let cancelled = false
    setProductSearching(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            q,
            page: String(productPage),
            pageSize: String(PRODUCT_PAGE_SIZE),
          })
          const res = await fetch(`/api/products/search?${params.toString()}`)
          const json = await res.json()
          if (cancelled) return
          if (!res.ok || !json.ok) {
            setProductHits([])
            setProductTotal(0)
            setProductTotalPages(1)
            return
          }
          const hits = ((json.products || []) as Array<{ id: string; name: string; retail_price?: number | null }>).map((row) => {
            const price = Number(row.retail_price)
            return {
              code: String(row.id),
              name: String(row.name || row.id),
              source: 'product' as const,
              productCode: String(row.id),
              retailPrice: Number.isFinite(price) && price > 0 ? price : null,
              costPrice: null,
            }
          })
          const total = Number(json.total || 0)
          const totalPages = Math.max(1, Number(json.totalPages || Math.ceil(total / PRODUCT_PAGE_SIZE) || 1))
          setProductHits(hits)
          setProductTotal(total)
          setProductTotalPages(totalPages)
          if (productPage > totalPages) setProductPage(totalPages)
        } catch {
          if (!cancelled) {
            setProductHits([])
            setProductTotal(0)
            setProductTotalPages(1)
          }
        } finally {
          if (!cancelled) setProductSearching(false)
        }
      })()
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [productQuery, productPage])

  const handleAdd = async () => {
    if (!plan || !canAdd) return
    if (!lumpMode && !selectedMachine) return
    setSaving(true)
    setError('')
    try {
      const line = await addPlanLine({
        planId: plan.id,
        category,
        machine_code: selectedMachine?.code,
        machine_name: selectedMachine?.name || null,
        machine_source: lumpMode || pickedMasterProduct ? 'product' : selectedMachine?.source || 'factory',
        qty: lumpMode ? (qtyNum > 0 ? qtyNum : 0) : qtyNum,
        amount: amountNum,
        confidence,
        change_kind: confirmed ? changeKind || 'interim' : 'initial',
      })
      setLines((prev) => [...prev, line])
      setAmount('')
      setPickedProduct(null)
      setProductQuery('')
      setProductHits([])
      setProductPage(1)
      setProductTotal(0)
      setProductTotalPages(1)
      if (lumpMode || amountOnly) {
        setQty('')
        setMachineCode('')
      } else {
        setQty('1')
      }
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (line: AnnualPlanLine) => {
    if (!plan) return
    const reason =
      plan.status === 'confirmed'
        ? window.prompt(
            lineChangeKind(line) === 'initial' ? '当初計画の変更理由（削除）' : '中間計画の変更理由（削除）',
            '',
          )
        : ''
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

  const handleRetag = async (line: AnnualPlanLine) => {
    if (!plan || plan.status !== 'confirmed') return
    const nextKind: PlanChangeKind = lineChangeKind(line) === 'initial' ? 'interim' : 'initial'
    const reason = window.prompt(
      nextKind === 'initial' ? 'この行を当初計画へ移す理由' : 'この行を中間計画へ移す理由',
      '',
    )
    if (reason == null || !reason.trim()) return
    setSaving(true)
    setError('')
    try {
      const updated = await updateLineChangeKind(plan.id, line, nextKind, reason.trim())
      setLines((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!plan || lines.length === 0) return
    if (plan.status === 'confirmed') return
    if (!window.confirm('現在の行合計を当初計画として確定します。確定後の追加は、当初の変更（経営上乗せなど）か中間計画の変更かを選んで登録できます。')) return
    setSaving(true)
    try {
      const next = await confirmPlan(plan, lines)
      setPlan(next)
      setChangeKind(null)
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = planInput
  const hasListPrice = Boolean(selectedMachine?.retailPrice)

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
        {fiscalYearLabel(fiscalYear)}。生産品は機種マスタから選ぶと定価×数量です。機種登録がないものは商品マスタを検索し、定価があれば定価×数量、なければ単価を手入力します。肥料・農薬・資材・工事は品名なしなら金額のみ、商品を選んだときは定価×数量です。
        {confirmed
          ? ' 確定後の追加は「当初計画の変更」（経営上乗せなど）か「中間計画の変更」かを選んでください。'
          : ' 下書きの行は確定時に当初計画になります。'}
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
            2. 機種マスタ{amountOnly ? '（任意）' : pickedProduct ? '（商品マスタを使用中）' : '（必須）'} {machines.length}件
            <select
              value={pickedProduct ? '' : machineCode}
              onChange={(e) => {
                const next = e.target.value
                setPickedProduct(null)
                setMachineCode(next)
                if (next) {
                  setQty((q) => (Number(q) > 0 ? q : '1'))
                } else if (amountOnly) {
                  setQty('')
                  setAmount('')
                  setUnitPrice('')
                }
              }}
              style={inputStyle}
            >
              {(amountOnly || pickedProduct) && <option value="">（指定なし）</option>}
              {!amountOnly && !pickedProduct && machines.length === 0 && <option value="">機種がありません</option>}
              {machines.map((m) => (
                <option key={`${m.source}-${m.code}`} value={m.code}>
                  {m.code} {m.name && m.name !== m.code ? ` ${m.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ color: '#e2e8f0', display: 'block' }}>
              商品マスタ検索（定価があれば採用）
              <input
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value)
                  setProductPage(1)
                }}
                placeholder="商品名・商品CD"
                style={inputStyle}
              />
            </label>
            {pickedProduct && (
              <p style={{ ...planMuted, margin: '6px 0 0' }}>
                選択中: {pickedProduct.code} {pickedProduct.name}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setPickedProduct(null)
                    setProductQuery('')
                    setProductHits([])
                    setProductPage(1)
                    setProductTotal(0)
                    setProductTotalPages(1)
                  }}
                  style={{ ...planBtn, padding: '2px 8px' }}
                >
                  解除
                </button>
              </p>
            )}
            {!pickedProduct && productQuery.trim() && (
              <div
                style={{
                  marginTop: 6,
                  border: '1px solid #334155',
                  borderRadius: 4,
                  background: '#0b1220',
                }}
              >
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {productSearching && productHits.length === 0 && <p style={{ ...planMuted, margin: 8 }}>検索中…</p>}
                  {!productSearching && productHits.length === 0 && (
                    <p style={{ ...planMuted, margin: 8 }}>該当がありません</p>
                  )}
                  {productHits.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => {
                        setPickedProduct(p)
                        setMachineCode('')
                        setProductHits([])
                        setProductPage(1)
                        setQty((q) => (Number(q) > 0 ? q : '1'))
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #1e293b',
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      {p.code} {p.name}
                      {p.retailPrice
                        ? `　定価 ${p.retailPrice.toLocaleString('ja-JP')} 円`
                        : '　定価なし'}
                    </button>
                  ))}
                </div>
                {productTotal > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                      padding: '6px 8px',
                      borderTop: '1px solid #334155',
                    }}
                  >
                    <span style={{ ...planMuted, fontSize: 12 }}>
                      全 {productTotal.toLocaleString('ja-JP')} 件
                      {productSearching ? ' …読込中' : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        disabled={productPage <= 1 || productSearching}
                        onClick={() => setProductPage(1)}
                        style={{ ...planBtn, padding: '2px 8px', opacity: productPage <= 1 ? 0.4 : 1 }}
                      >
                        先頭
                      </button>
                      <button
                        type="button"
                        disabled={productPage <= 1 || productSearching}
                        onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                        style={{ ...planBtn, padding: '2px 8px', opacity: productPage <= 1 ? 0.4 : 1 }}
                      >
                        前へ
                      </button>
                      <span style={{ color: '#e2e8f0', fontSize: 12 }}>
                        {productPage} / {productTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={productPage >= productTotalPages || productSearching}
                        onClick={() => setProductPage((p) => Math.min(productTotalPages, p + 1))}
                        style={{ ...planBtn, padding: '2px 8px', opacity: productPage >= productTotalPages ? 0.4 : 1 }}
                      >
                        次へ
                      </button>
                      <button
                        type="button"
                        disabled={productPage >= productTotalPages || productSearching}
                        onClick={() => setProductPage(productTotalPages)}
                        style={{ ...planBtn, padding: '2px 8px', opacity: productPage >= productTotalPages ? 0.4 : 1 }}
                      >
                        末尾
                      </button>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <label style={{ color: '#e2e8f0' }}>
            3. {lumpMode ? '数量（任意）' : '計画台数（必須）'}
            <input
              type="number"
              min={0}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={lumpMode ? '空欄可' : ''}
              style={inputStyle}
            />
          </label>
          {lumpMode ? (
            <label style={{ color: '#e2e8f0' }}>
              4. 計画額（円・必須）
              <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
            </label>
          ) : (
            <label style={{ color: '#e2e8f0' }}>
              4. 単価（円）{hasListPrice ? '・定価' : '・手入力'}
              <input
                type="number"
                min={0}
                step={1}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder={hasListPrice ? '' : '定価が無いので入力'}
                style={inputStyle}
              />
            </label>
          )}
        </div>
        {!lumpMode && (
          <p style={{ ...planMuted, marginBottom: 0 }}>
            計画額 {calcAmount.toLocaleString('ja-JP')} 円（数量 × {hasListPrice ? '定価' : '単価'}。金額は自動計算）
          </p>
        )}
        {lumpMode && (
          <p style={{ ...planMuted, marginBottom: 0 }}>品名なしのため、粗利は計画額の18%です。</p>
        )}
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
        </div>
        {confirmed && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#e2e8f0' }}>6. 追加区分（必須）</span>
            {CHANGE_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setChangeKind(opt.value)}
                style={{
                  ...planBtn,
                  background: changeKind === opt.value ? '#fbbf24' : '#1e293b',
                  color: changeKind === opt.value ? '#0f172a' : '#e2e8f0',
                  borderColor: changeKind === opt.value ? '#fbbf24' : '#475569',
                }}
              >
                {opt.label}
              </button>
            ))}
            <span style={planMuted}>{CHANGE_KIND_OPTIONS.find((o) => o.value === changeKind)?.hint || '当初の上乗せか、中間の見直しかを選んでから追加'}</span>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
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
              {['区分', 'カテゴリ', '機種（品名）', '台数', '計画額', '粗利', '確度', ''].map((h) => (
                <th key={h || 'actions'} style={{ ...planTh, textAlign: h === 'カテゴリ' || h.startsWith('機種') || h === '区分' ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...planTd, color: '#94a3b8' }}>
                  まだ行がありません。上のフォームから追加してください。
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <td style={planTd}>{CHANGE_KIND_LABEL[lineChangeKind(line)]}</td>
                <td style={planTd}>{displayPlanCategory(line.category)}</td>
                <td style={planTd}>{displayPlanLineMachine(line)}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>
                  {Number(line.qty) > 0 ? Number(line.qty).toLocaleString('ja-JP') : '—'}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>{Number(line.amount).toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>{Number(line.gross_profit).toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'center' }}>{CONFIDENCE_LABEL[line.confidence]}</td>
                <td style={{ ...planTd, textAlign: 'right' }}>
                  {confirmed && (
                    <button
                      type="button"
                      onClick={() => void handleRetag(line)}
                      disabled={saving}
                      style={{ ...planBtn, marginRight: 6 }}
                    >
                      {lineChangeKind(line) === 'initial' ? '中間へ' : '当初へ'}
                    </button>
                  )}
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
        <strong>当初 {totals.initial.amount.toLocaleString('ja-JP')} 円</strong>
        <strong>中間変更 {totals.interim.amount.toLocaleString('ja-JP')} 円</strong>
        <strong>中間計画 {totals.current.amount.toLocaleString('ja-JP')} 円</strong>
        <span>確度見込 {Math.round(totals.current.weighted).toLocaleString('ja-JP')} 円（●100% ▲50% □0%）</span>
        {plan?.status !== 'confirmed' && (
          <button type="button" onClick={() => void handleConfirm()} disabled={saving || lines.length === 0} style={{ ...planBtn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}>
            当初計画として確定
          </button>
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
