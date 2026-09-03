'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CHANGE_KIND_LABEL,
  CHANGE_KIND_OPTIONS,
  CONFIDENCE_LABEL,
  CONFIDENCE_OPTIONS,
  AMOUNT_ONLY_CATEGORIES,
  FACTORY_PRODUCT_CATEGORIES,
  OTHER_CODE_RANGE_CAPTION,
  OTHER_MACHINE_CODE,
  PLAN_CATEGORIES,
  displayPlanCategory,
  isAmountOnlyPlanCategory,
  isOtherMachineCode,
  lineChangeKind,
  type PlanChangeKind,
  type PlanConfidence,
} from '@/lib/annualPlanCategories'
import {
  addPlanLine,
  confirmPlan,
  deletePlanLine,
  displayPlanLineMachine,
  fetchPlanChanges,
  fetchPlanLines,
  fetchPlanStaffs,
  latestChangeReasonByLine,
  formatPlanDbError,
  getOrCreatePlan,
  splitPlanTotals,
  updateLineChangeKind,
  updatePlanLineCustomerName,
  updatePlanLineQtyAmount,
  planLineItemKey,
  fetchItemMonthProgress,
  fetchSalesActualSummary,
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
import { AnnualQuotaHint } from '@/components/AnnualQuotaHint'
import { AnnualInitialLineTotals } from '@/components/AnnualInitialLineTotals'
import { AnnualItemMonthProgress } from '@/components/AnnualItemMonthProgress'
import { officeKeyFromStaff } from '@/lib/branches'
import {
  allocationForStaff,
  fetchOfficeQuotas,
  officeQuotaTotal,
  quotaFloorError,
  type OfficeQuotaBundle,
} from '@/lib/annualPlanQuota'
import type { ItemMonthProgressResult } from '@/lib/annualPlanItemProgress'

const PRODUCT_PAGE_SIZE = 20

function parsePlanNumber(value: string): number {
  const s = String(value || '')
    .replace(/,/g, '')
    .replace(/円/g, '')
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

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
  const [customerName, setCustomerName] = useState('')
  const [remarkEdits, setRemarkEdits] = useState<Record<string, string>>({})
  const [itemProgress, setItemProgress] = useState<ItemMonthProgressResult | null>(null)
  const [itemProgressLoading, setItemProgressLoading] = useState(false)
  const [excelByCategory, setExcelByCategory] = useState<Record<string, number>>({})
  const [interimEdits, setInterimEdits] = useState<Record<string, { qty: string; amount: string }>>({})
  const [saveHint, setSaveHint] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [quotas, setQuotas] = useState<OfficeQuotaBundle>({ year: null, lines: [], allocations: [] })
  const [changeReasons, setChangeReasons] = useState<Record<string, string>>({})

  const [otherName, setOtherName] = useState('')
  const [otherDraft, setOtherDraft] = useState('')
  const [otherModalOpen, setOtherModalOpen] = useState(false)
  const [machineCodeBeforeOther, setMachineCodeBeforeOther] = useState('')

  const amountOnly = isAmountOnlyPlanCategory(category)
  const otherMode = !pickedProduct && isOtherMachineCode(machineCode)
  const freeAmountMode = amountOnly && !pickedProduct && !otherMode && !machineCode
  const lumpMode = freeAmountMode
  const confirmed = plan?.status === 'confirmed'
  const totals = useMemo(() => splitPlanTotals(lines), [lines])
  const selectedStaff = staffs.find((s) => s.id === staffId)
  const officeKey = selectedStaff ? officeKeyFromStaff(selectedStaff) : null
  const staffAlloc = allocationForStaff(quotas.allocations, staffId)
  const officeQuotaAmt = officeKey ? officeQuotaTotal(quotas.lines, officeKey) : 0
  const staffQuotaAmt = staffAlloc && staffAlloc.amount > 0 ? Math.round(staffAlloc.amount) : 0
  const confirmQuotaError = quotaFloorError(totals.initial.amount, staffQuotaAmt)
  const selectedMachine = pickedProduct || machines.find((m) => m.code === machineCode) || null
  const qtyNum = Number(qty)
  const unitNum = Number(unitPrice)
  const calcAmount = qtyNum > 0 && unitNum > 0 ? Math.round(qtyNum * unitNum) : 0
  const amountNum = lumpMode || otherMode ? Number(amount) : calcAmount
  const baseCanAdd = otherMode
    ? Boolean(staffId && category && otherName.trim() && amountNum > 0)
    : lumpMode
      ? Boolean(staffId && category && amountNum > 0)
      : Boolean(staffId && category && selectedMachine && qtyNum > 0 && calcAmount > 0)
  const canAdd = baseCanAdd && (!confirmed || Boolean(changeKind)) && !saving

  const loadPlan = useCallback(async () => {
    if (!staffId) {
      setPlan(null)
      setLines([])
      setRemarkEdits({})
      setChangeReasons({})
      return
    }
    setLoading(true)
    setError('')
    try {
      const nextPlan = await getOrCreatePlan(fiscalYear, staffId)
      const [nextLines, nextChanges] = await Promise.all([
        fetchPlanLines(nextPlan.id),
        fetchPlanChanges(nextPlan.id).catch(() => []),
      ])
      setPlan(nextPlan)
      setLines(nextLines)
      setChangeReasons(latestChangeReasonByLine(nextChanges))
      setRemarkEdits({})
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
      setPlan(null)
      setLines([])
      setRemarkEdits({})
      setChangeReasons({})
    } finally {
      setLoading(false)
    }
  }, [fiscalYear, staffId])

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchPlanStaffs()
        setStaffs(list)
        if (staffId && list.some((s) => s.id === staffId)) return
        setStaffId(list[0]?.id || '')
      } catch (e) {
        setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
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
      try {
        const next = await fetchOfficeQuotas(fiscalYear)
        if (!cancelled) setQuotas(next)
      } catch {
        if (!cancelled) setQuotas({ year: null, lines: [], allocations: [] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fiscalYear])

  useEffect(() => {
    if (!staffId) {
      setItemProgress(null)
      setExcelByCategory({})
      return
    }
    let cancelled = false
    setItemProgressLoading(true)
    void (async () => {
      try {
        const [next, sales] = await Promise.all([
          fetchItemMonthProgress(fiscalYear, staffId),
          fetchSalesActualSummary(fiscalYear).catch(() => null),
        ])
        if (!cancelled) {
          setItemProgress(next)
          setExcelByCategory(sales?.byStaffCategory[staffId] || {})
        }
      } catch {
        if (!cancelled) {
          setItemProgress(null)
          setExcelByCategory({})
        }
      } finally {
        if (!cancelled) setItemProgressLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fiscalYear, staffId, lines])

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
      setOtherName('')
      setOtherDraft('')
      setOtherModalOpen(false)
      setMachineCodeBeforeOther('')
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
    if (lumpMode || otherMode) return
    const price = pickedProduct?.retailPrice ?? machines.find((m) => m.code === machineCode)?.retailPrice ?? null
    setUnitPrice(price ? String(price) : '')
  }, [lumpMode, otherMode, machineCode, pickedProduct, machines])

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
    if (!lumpMode && !otherMode && !selectedMachine) return
    const nextKind = confirmed ? changeKind || 'interim' : 'initial'
    const reason =
      confirmed && nextKind === 'interim'
        ? window.prompt('中間計画の変更理由を入力してください。', '')
        : undefined
    if (confirmed && nextKind === 'interim' && (reason == null || !reason.trim())) return
    setSaving(true)
    setError('')
    try {
      const line = await addPlanLine({
        planId: plan.id,
        category,
        machine_code: otherMode ? OTHER_MACHINE_CODE : selectedMachine?.code,
        machine_name: otherMode ? otherName.trim() : selectedMachine?.name || null,
        machine_source: otherMode
          ? amountOnly
            ? 'product'
            : 'factory'
          : lumpMode || pickedProduct
            ? 'product'
            : selectedMachine?.source || 'factory',
        qty: lumpMode || otherMode ? (qtyNum > 0 ? qtyNum : 0) : qtyNum,
        amount: amountNum,
        confidence,
        change_kind: nextKind,
        customer_name: customerName,
        reason: reason?.trim(),
      })
      setLines((prev) => [...prev, line])
      if (reason?.trim()) {
        setChangeReasons((prev) => ({ ...prev, [String(line.id)]: reason.trim() }))
      }
      setAmount('')
      setCustomerName('')
      setPickedProduct(null)
      setProductQuery('')
      setProductHits([])
      setProductPage(1)
      setProductTotal(0)
      setProductTotalPages(1)
      if (lumpMode || otherMode || amountOnly) {
        setQty('')
        setMachineCode('')
        setOtherName('')
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
    if (plan.status === 'confirmed' && staffQuotaAmt > 0) {
      const next = splitPlanTotals(lines.filter((r) => r.id !== line.id))
      const msg = quotaFloorError(
        lineChangeKind(line) === 'initial' ? next.initial.amount : next.current.amount,
        staffQuotaAmt,
      )
      if (msg) {
        setError(msg)
        return
      }
    }
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
      setRemarkEdits((prev) => {
        const next = { ...prev }
        delete next[String(line.id)]
        return next
      })
      setRemarkEdits((prev) => {
        const next = { ...prev }
        delete next[String(line.id)]
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRetag = async (line: AnnualPlanLine) => {
    if (!plan || plan.status !== 'confirmed') return
    const kind = lineChangeKind(line)
    if (kind === 'initial') {
      const already = lines.some(
        (row) => row.id !== line.id && lineChangeKind(row) === 'interim' && planLineItemKey(row) === planLineItemKey(line),
      )
      if (already) {
        setError('同じ品名の中間修正が既にあります。中間修正の行で数量・金額を変更してください。')
        return
      }
      const reason = window.prompt(
        'この行を中間修正計画にします。当初の行は残ります。複製した行で数量・金額を変更できます。理由を入力してください。',
        '',
      )
      if (reason == null || !reason.trim()) return
      setSaving(true)
      setError('')
      try {
        const created = await addPlanLine({
          planId: plan.id,
          category: line.category,
          machine_code: line.machine_code,
          machine_name: line.machine_name,
          machine_source: line.machine_source || 'factory',
          qty: Number(line.qty || 0),
          amount: Number(line.amount || 0),
          confidence: line.confidence,
          gross_profit: Number(line.gross_profit || 0),
          change_kind: 'interim',
          customer_name: line.customer_name,
          reason: reason.trim(),
        })
        setLines((prev) => [...prev, created])
        setChangeReasons((prev) => ({ ...prev, [String(created.id)]: reason.trim() }))
        setInterimEdits((prev) => ({
          ...prev,
          [String(created.id)]: {
            qty: Number(created.qty) > 0 ? String(created.qty) : '',
            amount: String(Math.round(Number(created.amount) || 0)),
          },
        }))
      } catch (e) {
        setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
      } finally {
        setSaving(false)
      }
      return
    }

    const hasInitial = lines.some(
      (row) => row.id !== line.id && lineChangeKind(row) === 'initial' && planLineItemKey(row) === planLineItemKey(line),
    )
    if (hasInitial && staffQuotaAmt > 0) {
      const next = splitPlanTotals(lines.filter((row) => row.id !== line.id))
      const msg = quotaFloorError(next.current.amount, staffQuotaAmt)
      if (msg) {
        setError(msg)
        return
      }
    }
    const reason = window.prompt(
      hasInitial ? '中間修正を取り消して当初計画に戻す理由' : 'この行を当初計画へ移す理由',
      '',
    )
    if (reason == null || !reason.trim()) return
    setSaving(true)
    setError('')
    try {
      if (hasInitial) {
        await deletePlanLine(plan.id, line.id, reason.trim())
        setLines((prev) => prev.filter((row) => row.id !== line.id))
        setInterimEdits((prev) => {
          const next = { ...prev }
          delete next[line.id]
          return next
        })
        setRemarkEdits((prev) => {
          const next = { ...prev }
          delete next[String(line.id)]
          return next
        })
      } else {
        const updated = await updateLineChangeKind(plan.id, line, 'initial', reason.trim())
        setLines((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
      }
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveInterim = async (line: AnnualPlanLine) => {
    if (!plan) {
      setError('計画が読み込めていません。画面を再読み込みしてください。')
      return
    }
    const lineId = String(line.id)
    const edit = interimEdits[lineId] || interimEdits[line.id] || {
      qty: Number(line.qty) > 0 ? String(line.qty) : '',
      amount: String(Math.round(Number(line.amount) || 0)),
    }
    const qty = parsePlanNumber(edit.qty)
    const amount = parsePlanNumber(edit.amount)
    if (!Number.isFinite(amount) || !(amount > 0)) {
      const msg = '中間修正の計画額を入力してください。'
      setError(msg)
      setSaveHint({ id: lineId, text: msg, ok: false })
      return
    }
    const nextCurrent =
      totals.current.amount - Math.round(Number(line.amount || 0)) + Math.round(amount)
    const quotaMsg = quotaFloorError(nextCurrent, staffQuotaAmt)
    if (quotaMsg) {
      setError(quotaMsg)
      setSaveHint({ id: lineId, text: quotaMsg, ok: false })
      return
    }
    setSaving(true)
    setError('')
    setSaveHint({ id: lineId, text: '保存中…', ok: true })
    try {
      const updated = await updatePlanLineQtyAmount(
        plan.id,
        { ...line, id: lineId },
        Number.isFinite(qty) && qty > 0 ? qty : 0,
        amount,
        '中間修正',
      )
      setLines((prev) => prev.map((row) => (String(row.id) === String(updated.id) ? updated : row)))
      setInterimEdits((prev) => ({
        ...prev,
        [String(updated.id)]: {
          qty: Number(updated.qty) > 0 ? String(updated.qty) : '',
          amount: String(Math.round(Number(updated.amount) || 0)),
        },
      }))
      setSaveHint({ id: lineId, text: '保存しました', ok: true })
    } catch (e) {
      const msg = formatPlanDbError(e instanceof Error ? e.message : String(e))
      setError(msg)
      setSaveHint({ id: lineId, text: msg, ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRemarks = async (line: AnnualPlanLine, value: string) => {
    if (!plan) return
    const next = value.trim()
    const prev = String(line.customer_name || '').trim()
    if (next === prev) return
    setSaving(true)
    setError('')
    try {
      const updated = await updatePlanLineCustomerName(plan.id, line, next)
      setLines((prevLines) => prevLines.map((row) => (String(row.id) === String(updated.id) ? updated : row)))
      setRemarkEdits((prevEdits) => {
        const copy = { ...prevEdits }
        delete copy[String(line.id)]
        return copy
      })
    } catch (e) {
      setError(formatPlanDbError(e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!plan || lines.length === 0) return
    if (plan.status === 'confirmed') return
    if (confirmQuotaError) {
      setError(confirmQuotaError)
      return
    }
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
          <Link href={`/plan/annual/quota?fy=${fiscalYear}`}>
            <button style={{ ...planBtn, background: '#b45309', color: '#fff', borderColor: '#b45309' }}>ノルマ</button>
          </Link>
          <Link href="/selectors">
            <button style={{ ...planBtn, background: '#16a34a', color: '#fff', borderColor: '#15803d' }}>メニューへ戻る</button>
          </Link>
        </div>
      </div>

      <p style={{ ...planMuted, marginTop: 0 }}>
        {fiscalYearLabel(fiscalYear)}。生産品（暖房機・たばこ乾燥機など）は機種マスタから選ぶと定価×数量です。「その他」を選ぶと品名を入力でき、Excel実績は機種指定分を除いた商品CD範囲で集計します。肥料・農薬・資材・工事も同様です。
        {confirmed
          ? ' 確定後の「中間へ」は、当初の行を残したまま中間修正計画を作ります。中間修正の行で数量・金額を変更してください。同じ品名は中間計画では中間修正の数量・金額に置き換わります。上のフォームから追加する場合は「当初計画の変更」か「中間計画の変更」を選んでください。'
          : ' 下書きの行は確定時に当初計画になります。必達目標がある場合、当初計画はノルマ以上が必要です（上限なし）。'}
      </p>
      {staffs.length === 0 && (
        <p style={{ color: '#fde68a' }}>
          営業担当者が未設定です。
          <Link href="/staffs" style={{ color: '#7dd3fc', marginLeft: 8 }}>
            担当者マスタ
          </Link>
          で「営業担当者」にチェックを入れてください。
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <label>
          担当者{' '}
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={inputStyle} disabled={staffs.length === 0}>
            {staffs.length === 0 ? (
              <option value="">営業担当者がいません</option>
            ) : (
              staffs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
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
        <span style={{ alignSelf: 'center', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
          担当者必達額（ノルマ）{' '}
          {staffAlloc && staffAlloc.amount > 0 ? (
            <span style={{ color: '#f87171', fontWeight: 700 }}>
              {staffAlloc.amount.toLocaleString('ja-JP')} 円
            </span>
          ) : (
            <span style={planMuted}>未設定</span>
          )}
        </span>
        <span style={{ alignSelf: 'center', ...planMuted }}>
          {plan?.status === 'confirmed' ? '確定済（途中変更可）' : '下書き'}
          {loading ? ' …読込中' : ''}
        </span>
      </div>

      {staffAlloc && staffAlloc.amount > 0 ? (
        <AnnualQuotaHint
          title="必達目標（ノルマ）"
          quotaAmount={staffAlloc.amount}
          planAmount={totals.initial.amount}
          caption="当初計画はノルマ額を下回ってはいけません。ノルマを超える計画に上限はありません。"
        />
      ) : officeQuotaAmt > 0 ? (
        <p style={{ ...planMuted, marginTop: 0 }}>
          営業所ノルマ {officeQuotaAmt.toLocaleString('ja-JP')} 円（必達目標は未設定）。あなたの当初{' '}
          {totals.initial.amount.toLocaleString('ja-JP')} 円。必達目標はノルマ画面で設定します。
        </p>
      ) : null}

      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}

      <section style={planPanel}>
        <h2 style={{ marginTop: 0, fontSize: 16, color: '#f8fafc' }}>行を追加</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ color: '#e2e8f0' }}>
            1. カテゴリ
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <optgroup label="生産品">
                {FACTORY_PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {displayPlanCategory(c)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="その他科目">
                {AMOUNT_ONLY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label style={{ color: '#e2e8f0' }}>
            2. 機種マスタ{amountOnly ? '（任意）' : pickedProduct ? '（商品マスタを使用中）' : otherMode ? '（その他）' : '（必須）'} {machines.length}件
            <select
              value={pickedProduct ? '' : machineCode}
              onChange={(e) => {
                const next = e.target.value
                setPickedProduct(null)
                if (isOtherMachineCode(next)) {
                  setMachineCodeBeforeOther(machineCode)
                  setMachineCode(OTHER_MACHINE_CODE)
                  setOtherDraft(otherName)
                  setOtherModalOpen(true)
                  setUnitPrice('')
                  setAmount('')
                  setQty((q) => (Number(q) > 0 ? q : amountOnly ? '' : '1'))
                  return
                }
                setOtherName('')
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
              {!amountOnly && !pickedProduct && machines.length === 0 && !otherMode && <option value="">機種がありません</option>}
              <option value={OTHER_MACHINE_CODE}>その他（品名を入力）</option>
              {machines.map((m) => (
                <option key={`${m.source}-${m.code}`} value={m.code}>
                  {m.code} {m.name && m.name !== m.code ? ` ${m.name}` : ''}
                </option>
              ))}
            </select>
            {otherMode && otherName && (
              <p style={{ ...planMuted, margin: '6px 0 0' }}>
                品名: {otherName}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setOtherDraft(otherName)
                    setOtherModalOpen(true)
                  }}
                  style={{ ...planBtn, padding: '2px 8px' }}
                >
                  変更
                </button>
              </p>
            )}
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
                        setOtherName('')
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
            3. {lumpMode || otherMode ? '数量（任意）' : '計画台数（必須）'}
            <input
              type="number"
              min={0}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={lumpMode || otherMode ? '空欄可' : ''}
              style={inputStyle}
            />
          </label>
          {lumpMode || otherMode ? (
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
          <label style={{ gridColumn: '1 / -1', color: '#e2e8f0' }}>
            備考（販売予定先）
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="得意先名・農協名など（任意）"
              style={inputStyle}
            />
          </label>
        </div>
        {!lumpMode && !otherMode && (
          <p style={{ ...planMuted, marginBottom: 0 }}>
            計画額 {calcAmount.toLocaleString('ja-JP')} 円（数量 × {hasListPrice ? '定価' : '単価'}。金額は自動計算）
          </p>
        )}
        {otherMode && (
          <p style={{ ...planMuted, marginBottom: 0 }}>{OTHER_CODE_RANGE_CAPTION}</p>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
          <thead>
            <tr>
              {['区分', '変更理由', 'カテゴリ', '機種（品名）', '備考（販売予定先）', '台数', '計画額', '粗利', '確度', ''].map((h) => (
                <th key={h || 'actions'} style={{ ...planTh, textAlign: h === 'カテゴリ' || h.startsWith('機種') || h === '区分' || h === '変更理由' || h.startsWith('備考') ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...planTd, color: '#94a3b8' }}>
                  まだ行がありません。上のフォームから追加してください。
                </td>
              </tr>
            )}
            {lines.map((line) => {
              const lineId = String(line.id)
              const interim = lineChangeKind(line) === 'interim'
              const edit = interimEdits[lineId] || {
                qty: Number(line.qty) > 0 ? String(line.qty) : '',
                amount: String(Math.round(Number(line.amount) || 0)),
              }
              const unitPrice = Number(line.qty) > 0 ? Number(line.amount) / Number(line.qty) : 0
              return (
              <tr key={lineId} style={interim ? { background: 'rgba(251, 191, 36, 0.08)' } : undefined}>
                <td style={planTd}>{CHANGE_KIND_LABEL[lineChangeKind(line)]}</td>
                <td style={{ ...planTd, maxWidth: 220, whiteSpace: 'pre-wrap' }}>
                  {changeReasons[lineId] ? (
                    <span style={{ color: interim ? '#fde68a' : '#cbd5e1' }}>{changeReasons[lineId]}</span>
                  ) : (
                    <span style={planMuted}>{interim ? '—' : ''}</span>
                  )}
                </td>
                <td style={planTd}>{displayPlanCategory(line.category)}</td>
                <td style={planTd}>{displayPlanLineMachine(line)}</td>
                <td style={planTd}>
                  <input
                    value={remarkEdits[lineId] ?? (line.customer_name || '')}
                    disabled={saving}
                    onChange={(e) =>
                      setRemarkEdits((prev) => ({
                        ...prev,
                        [lineId]: e.target.value,
                      }))
                    }
                    onBlur={(e) => void handleSaveRemarks(line, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                    placeholder="任意"
                    style={{ ...inputStyle, minWidth: 140 }}
                  />
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>
                  {interim ? (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={edit.qty}
                      disabled={saving}
                      onChange={(e) => {
                        const qty = e.target.value
                        const qtyNum = parsePlanNumber(qty)
                        const nextAmount =
                          unitPrice > 0 && Number.isFinite(qtyNum) && qtyNum >= 0
                            ? String(Math.round(qtyNum * unitPrice))
                            : edit.amount
                        setInterimEdits((prev) => ({
                          ...prev,
                          [lineId]: { qty, amount: nextAmount },
                        }))
                      }}
                      style={{ ...inputStyle, width: 88, textAlign: 'right' }}
                    />
                  ) : Number(line.qty) > 0 ? (
                    Number(line.qty).toLocaleString('ja-JP')
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>
                  {interim ? (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={edit.amount}
                      disabled={saving}
                      onChange={(e) =>
                        setInterimEdits((prev) => ({
                          ...prev,
                          [lineId]: { qty: edit.qty, amount: e.target.value },
                        }))
                      }
                      style={{ ...inputStyle, width: 120, textAlign: 'right' }}
                    />
                  ) : (
                    Number(line.amount).toLocaleString('ja-JP')
                  )}
                </td>
                <td style={{ ...planTd, textAlign: 'right' }}>{Number(line.gross_profit).toLocaleString('ja-JP')}</td>
                <td style={{ ...planTd, textAlign: 'center' }}>{CONFIDENCE_LABEL[line.confidence]}</td>
                <td style={{ ...planTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {confirmed && (
                    <button
                      type="button"
                      onClick={() => void handleRetag(line)}
                      disabled={saving}
                      style={{ ...planBtn, marginRight: 6 }}
                    >
                      {interim ? '当初へ' : '中間へ'}
                    </button>
                  )}
                  {interim && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void handleSaveInterim(line)}
                      disabled={saving}
                      style={{ ...planBtn, marginRight: 6, background: '#b45309', color: '#fff', borderColor: '#b45309' }}
                    >
                      {saveHint?.id === lineId && saveHint.text === '保存中…' ? '保存中…' : '修正を保存'}
                    </button>
                  )}
                  <button type="button" onClick={() => void handleDelete(line)} disabled={saving} style={planBtn}>
                    削除
                  </button>
                  {saveHint?.id === lineId && saveHint.text !== '保存中…' && (
                    <div style={{ marginTop: 6, fontSize: 12, color: saveHint.ok ? '#86efac' : '#fca5a5' }}>
                      {saveHint.text}
                    </div>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AnnualInitialLineTotals title="当初計画 行計" lines={lines} excelByCategory={excelByCategory} />

      <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>当初 {totals.initial.amount.toLocaleString('ja-JP')} 円</strong>
        <strong>中間修正 {totals.interim.amount.toLocaleString('ja-JP')} 円</strong>
        <strong>中間計画 {totals.current.amount.toLocaleString('ja-JP')} 円</strong>
        <span>確度見込 {Math.round(totals.current.weighted).toLocaleString('ja-JP')} 円（●100% ▲50% □0%）</span>
        {plan?.status !== 'confirmed' && (
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving || lines.length === 0 || Boolean(confirmQuotaError)}
            style={{
              ...planBtn,
              background: '#0f766e',
              color: '#fff',
              borderColor: '#0f766e',
              opacity: saving || lines.length === 0 || confirmQuotaError ? 0.5 : 1,
            }}
          >
            当初計画として確定
          </button>
        )}
      </div>
      {plan?.status !== 'confirmed' && confirmQuotaError && (
        <p style={{ color: '#fca5a5', marginTop: 8 }}>{confirmQuotaError}</p>
      )}

      <div style={{ marginTop: 28 }}>
        <AnnualItemMonthProgress
          data={itemProgress}
          loading={itemProgressLoading}
          emptyText="計画の品名がありません。上で行を追加すると、ここに月次の残台数が出ます。"
        />
      </div>

      {otherModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div style={{ ...planPanel, width: '100%', maxWidth: 420, margin: 0 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#f8fafc' }}>その他の品名</h3>
            <p style={{ ...planMuted, marginTop: 0, fontSize: 12 }}>{OTHER_CODE_RANGE_CAPTION}</p>
            <input
              autoFocus
              value={otherDraft}
              onChange={(e) => setOtherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const name = otherDraft.trim()
                  if (!name) return
                  setOtherName(name)
                  setOtherModalOpen(false)
                }
                if (e.key === 'Escape') {
                  setOtherModalOpen(false)
                  if (!otherName.trim()) {
                    setMachineCode(machineCodeBeforeOther)
                  }
                }
              }}
              placeholder="品名を入力"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setOtherModalOpen(false)
                  if (!otherName.trim()) setMachineCode(machineCodeBeforeOther)
                }}
                style={planBtn}
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!otherDraft.trim()}
                onClick={() => {
                  const name = otherDraft.trim()
                  if (!name) return
                  setOtherName(name)
                  setOtherModalOpen(false)
                }}
                style={{ ...planBtn, background: '#2563eb', color: '#fff', borderColor: '#1d4ed8', opacity: otherDraft.trim() ? 1 : 0.5 }}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
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
