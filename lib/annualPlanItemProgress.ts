import {
  LUMP_MACHINE_CODE,
  PROGRESS_CATEGORIES,
  displayPlanCategory,
  formatPlanMachineLabel,
  isOtherMachineCode,
  lineChangeKind,
  normalizeProductCode,
  otherProgressCategoryForProductCode,
  progressCategoryFor,
} from '@/lib/annualPlanCategories'
import { fiscalMonthIndex, fiscalMonthSlots, type FiscalMonthSlot } from '@/lib/annualPlanFiscal'

export type PlanLineForItemProgress = {
  category: string
  machine_code: string
  machine_name: string | null
  machine_source?: string | null
  qty: number
  amount: number
  change_kind?: string | null
}

function displayLineLabel(line: PlanLineForItemProgress): string {
  return formatPlanMachineLabel(String(line.machine_code || '').trim() || LUMP_MACHINE_CODE, line.machine_name)
}

export type SalesActualItemRow = {
  billed_on: string | null
  product_code: string | null
  product_name: string | null
  qty: number
  amount_ex_tax: number
  plan_category: string | null
}

export type ItemMonthProgressRow = {
  key: string
  category: string
  code: string
  name: string
  label: string
  planQty: number
  planAmount: number
  currentQty: number
  currentAmount: number
  revised: boolean
  useQty: boolean
  soldQty: number[]
  soldAmount: number[]
  soldQtyTotal: number
  soldAmountTotal: number
  remainingQty: number
  remainingAmount: number
}

export type UnmatchedCategoryMonth = {
  category: string
  qty: number[]
  amount: number[]
  qtyTotal: number
  amountTotal: number
}

export type ItemMonthProgressResult = {
  months: FiscalMonthSlot[]
  rows: ItemMonthProgressRow[]
  unmatched: { qty: number[]; amount: number[]; qtyTotal: number; amountTotal: number }
  unmatchedByCategory: UnmatchedCategoryMonth[]
}

function unmatchedCategoryFor(planCategory: string | null): string {
  const raw = String(planCategory || '').trim()
  if (!raw) return 'その他'
  if ((PROGRESS_CATEGORIES as readonly string[]).includes(raw)) return raw
  return progressCategoryFor(raw)
}

function zeros(n: number) {
  return Array.from({ length: n }, () => 0)
}

function emptyUnmatchedBucket(category: string): UnmatchedCategoryMonth {
  return { category, qty: zeros(12), amount: zeros(12), qtyTotal: 0, amountTotal: 0 }
}

export function normalizeItemText(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[‐–—−ー－]/g, '-')
}

function compactItemName(value: string): string {
  return normalizeItemText(value).replace(/[-()[\]（）【】]/g, '')
}

/** 品名のない「その他」「その他資材」など。名称突合の対象にしない */
function isGenericOtherName(name: string): boolean {
  const n = normalizeItemText(name)
  if (!n) return true
  if (n === '他') return true
  if ((PROGRESS_CATEGORIES as readonly string[]).includes(n)) return true
  return /^その他(資材|肥料|農薬|工事|生産品)?$/.test(n)
}

/** 品名やコード欄に書いた 4桁以上の数字を商品CDとみなす */
function extractProductCodes(value: string | null | undefined): string[] {
  const raw = String(value || '').normalize('NFKC')
  const matches = raw.match(/\d{4,}/g) || []
  return [...new Set(matches.map((m) => normalizeProductCode(m)).filter((c) => c.length >= 4))]
}

function isNumericProductCode(value: string): boolean {
  const s = String(value || '')
    .normalize('NFKC')
    .replace(/[\s　-]/g, '')
  return /^\d{4,}$/.test(s)
}

/**
 * 個人シートで商品CDを明確に指定した行だけコード突合する。
 * 機種マスタの短い型番（例: 1）は商品CDにしない。
 */
function reservedCodesForPlan(line: PlanLineForItemProgress, extraCodes: string[]): string[] {
  const code = String(line.machine_code || '').trim()
  if (code === LUMP_MACHINE_CODE) return []
  const out = new Set<string>(extractProductCodes(line.machine_name))
  if (isOtherMachineCode(code)) return [...out]
  if (line.machine_source === 'product' || isNumericProductCode(code)) {
    const n = normalizeProductCode(code)
    if (n.length >= 4) out.add(n)
  }
  for (const extra of extraCodes) {
    const n = normalizeProductCode(extra)
    if (n.length >= 4) out.add(n)
  }
  return [...out]
}

/** 型番っぽい英数（文字と数字の両方、5文字以上）。短いCD部分一致は使わない */
function modelTokens(compact: string): string[] {
  return [...new Set((compact.match(/[a-z0-9]{5,}/g) || []).filter((t) => /[a-z]/.test(t) && /\d/.test(t)))]
}

function nameMatchScore(planName: string, actualName: string): number {
  const planNorm = normalizeItemText(planName)
  const actualNorm = normalizeItemText(actualName)
  if (!planNorm || !actualNorm || isGenericOtherName(planName)) return 0
  if (planNorm === actualNorm) return 200
  const planC = compactItemName(planName)
  const actualC = compactItemName(actualName)
  if (planC.length >= 4 && planC === actualC) return 180
  const min = 5
  if (planC.length >= min && actualC.includes(planC)) return 100 + Math.min(planC.length, 50)
  if (actualC.length >= min && planC.includes(actualC)) return 80 + Math.min(actualC.length, 50)
  let best = 0
  for (const token of modelTokens(planC)) {
    if (actualC.includes(token)) best = Math.max(best, 90 + token.length)
  }
  return best
}

const NAME_MATCH_THRESHOLD = 80

function matchScore(actual: SalesActualItemRow, reservedCodes: string[], planName: string): number {
  const codeNum = normalizeProductCode(actual.product_code || '')
  if (codeNum && reservedCodes.includes(codeNum)) return 1000 + codeNum.length
  return nameMatchScore(planName, actual.product_name || '')
}

export function buildItemMonthProgress(
  fiscalYear: number,
  lines: PlanLineForItemProgress[],
  actuals: SalesActualItemRow[],
  extraCodesByMachine: Record<string, string[]> = {},
): ItemMonthProgressResult {
  const months = fiscalMonthSlots(fiscalYear)
  type Group = {
    key: string
    category: string
    code: string
    name: string
    label: string
    planQty: number
    planAmount: number
    currentQty: number
    currentAmount: number
    revised: boolean
    reservedCodes: string[]
    isOther: boolean
    isGenericOther: boolean
    progressCat: string
  }
  const grouped = new Map<string, Group>()

  for (const line of lines) {
    const kind = lineChangeKind(line)
    const code = String(line.machine_code || '').trim() || LUMP_MACHINE_CODE
    const name = String(line.machine_name || '').trim()
    const key = `${displayPlanCategory(line.category)}::${code}::${name}`
    const extra = extraCodesByMachine[code] || extraCodesByMachine[`${line.category}:${code}`] || []
    const prev = grouped.get(key)
    if (prev) {
      if (kind === 'interim') {
        prev.currentQty += Number(line.qty || 0)
        prev.currentAmount += Number(line.amount || 0)
        prev.revised = true
      } else {
        prev.planQty += Number(line.qty || 0)
        prev.planAmount += Number(line.amount || 0)
      }
      prev.reservedCodes = [...new Set([...prev.reservedCodes, ...reservedCodesForPlan(line, extra)])]
    } else {
      const qty = Number(line.qty || 0)
      const amount = Number(line.amount || 0)
      grouped.set(key, {
        key,
        category: displayPlanCategory(line.category),
        code,
        name,
        label: displayLineLabel(line),
        planQty: kind === 'interim' ? 0 : qty,
        planAmount: kind === 'interim' ? 0 : amount,
        currentQty: kind === 'interim' ? qty : 0,
        currentAmount: kind === 'interim' ? amount : 0,
        revised: kind === 'interim',
        reservedCodes: reservedCodesForPlan(line, extra),
        isOther: isOtherMachineCode(code),
        isGenericOther: isOtherMachineCode(code) && isGenericOtherName(name),
        progressCat: progressCategoryFor(line.category),
      })
    }
  }

  for (const g of grouped.values()) {
    if (!g.revised) {
      g.currentQty = g.planQty
      g.currentAmount = g.planAmount
    }
  }

  const groups = [...grouped.values()]
  const rows: ItemMonthProgressRow[] = groups.map((g) => ({
    key: g.key,
    category: g.category,
    code: g.code,
    name: g.name,
    label: g.label,
    planQty: g.planQty,
    planAmount: g.planAmount,
    currentQty: g.currentQty,
    currentAmount: g.currentAmount,
    revised: g.revised,
    useQty: g.currentQty !== 0 || g.planQty !== 0,
    soldQty: zeros(12),
    soldAmount: zeros(12),
    soldQtyTotal: 0,
    soldAmountTotal: 0,
    remainingQty: g.currentQty,
    remainingAmount: g.currentAmount,
  }))

  const unmatched = { qty: zeros(12), amount: zeros(12), qtyTotal: 0, amountTotal: 0 }
  const unmatchedMap = new Map<string, UnmatchedCategoryMonth>()

  const addSold = (row: ItemMonthProgressRow, month: number, qty: number, amount: number) => {
    row.soldQty[month] += qty
    row.soldAmount[month] += amount
    row.soldQtyTotal += qty
    row.soldAmountTotal += amount
  }

  for (const actual of actuals) {
    const month = actual.billed_on ? fiscalMonthIndex(actual.billed_on, fiscalYear) : null
    if (month == null) continue
    const qty = Number(actual.qty || 0)
    const amount = Number(actual.amount_ex_tax || 0)
    if (qty === 0 && amount === 0) continue

    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (g.code === LUMP_MACHINE_CODE || g.isGenericOther) continue
      const score = matchScore(actual, g.reservedCodes, g.name)
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    if (bestIdx >= 0 && bestScore >= NAME_MATCH_THRESHOLD) {
      addSold(rows[bestIdx], month, qty, amount)
      continue
    }

    const otherBucket =
      otherProgressCategoryForProductCode(actual.product_code || '') || unmatchedCategoryFor(actual.plan_category)
    const otherIdx = groups.findIndex((g) => g.isGenericOther && g.progressCat === otherBucket)
    if (otherIdx >= 0) {
      addSold(rows[otherIdx], month, qty, amount)
      continue
    }

    unmatched.qty[month] += qty
    unmatched.amount[month] += amount
    unmatched.qtyTotal += qty
    unmatched.amountTotal += amount
    const bucket = unmatchedMap.get(otherBucket) || emptyUnmatchedBucket(otherBucket)
    bucket.qty[month] += qty
    bucket.amount[month] += amount
    bucket.qtyTotal += qty
    bucket.amountTotal += amount
    unmatchedMap.set(otherBucket, bucket)
  }

  for (const row of rows) {
    row.remainingQty = row.currentQty - row.soldQtyTotal
    row.remainingAmount = row.currentAmount - row.soldAmountTotal
  }

  rows.sort((a, b) => {
    const cat = a.category.localeCompare(b.category, 'ja')
    if (cat !== 0) return cat
    if (a.useQty !== b.useQty) return a.useQty ? -1 : 1
    return a.label.localeCompare(b.label, 'ja')
  })

  const categoryOrder = [...PROGRESS_CATEGORIES, 'その他']
  const unmatchedByCategory = [...unmatchedMap.values()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a.category)
    const bi = categoryOrder.indexOf(b.category)
    const av = ai < 0 ? categoryOrder.length : ai
    const bv = bi < 0 ? categoryOrder.length : bi
    if (av !== bv) return av - bv
    return a.category.localeCompare(b.category, 'ja')
  })

  return { months, rows, unmatched, unmatchedByCategory }
}
