import {
  LUMP_MACHINE_CODE,
  OTHER_MACHINE_CODE,
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

function tokensForPlan(line: PlanLineForItemProgress, extraCodes: string[]): string[] {
  if (isOtherMachineCode(line.machine_code) || line.machine_code === LUMP_MACHINE_CODE) return []
  const raw = [line.machine_code, line.machine_name || '', ...extraCodes]
    .map((v) => normalizeItemText(v))
    .filter((v) => v && v !== LUMP_MACHINE_CODE && v !== OTHER_MACHINE_CODE && v !== 'その他')
  return [...new Set(raw)]
}

function reservedCodesForPlan(line: PlanLineForItemProgress, extraCodes: string[]): string[] {
  if (isOtherMachineCode(line.machine_code) || line.machine_code === LUMP_MACHINE_CODE) return []
  const raw = [line.machine_code, ...extraCodes].map((v) => normalizeProductCode(v)).filter((v) => v.length >= 4)
  return [...new Set(raw)]
}

function matchScore(actual: SalesActualItemRow, tokens: string[], reservedCodes: string[]): number {
  const code = normalizeItemText(actual.product_code || '')
  const codeNum = normalizeProductCode(actual.product_code || '')
  const name = normalizeItemText(actual.product_name || '')
  if (codeNum && reservedCodes.includes(codeNum)) return 1000 + codeNum.length
  let best = 0
  for (const token of tokens) {
    if (!token) continue
    const tokenNum = normalizeProductCode(token)
    if (codeNum && tokenNum && codeNum === tokenNum) {
      best = Math.max(best, 100 + tokenNum.length)
      continue
    }
    if (code && (code === token || code.includes(token) || token.includes(code))) {
      best = Math.max(best, 100 + token.length)
      continue
    }
    if (token.length >= 2 && name && (name === token || name.includes(token))) {
      best = Math.max(best, 40 + token.length)
    }
  }
  return best
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
    tokens: string[]
    reservedCodes: string[]
    isOther: boolean
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
      prev.tokens = [...new Set([...prev.tokens, ...tokensForPlan(line, extra)])]
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
        tokens: tokensForPlan(line, extra),
        reservedCodes: reservedCodesForPlan(line, extra),
        isOther: isOtherMachineCode(code),
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
    useQty: g.currentQty > 0 || g.planQty > 0,
    soldQty: zeros(12),
    soldAmount: zeros(12),
    soldQtyTotal: 0,
    soldAmountTotal: 0,
    remainingQty: g.currentQty,
    remainingAmount: g.currentAmount,
  }))

  const unmatched = { qty: zeros(12), amount: zeros(12), qtyTotal: 0, amountTotal: 0 }
  const unmatchedMap = new Map<string, UnmatchedCategoryMonth>()
  const reservedAll = new Set(groups.flatMap((g) => g.reservedCodes))

  for (const actual of actuals) {
    const month = actual.billed_on ? fiscalMonthIndex(actual.billed_on, fiscalYear) : null
    if (month == null) continue
    const qty = Number(actual.qty || 0)
    const amount = Number(actual.amount_ex_tax || 0)
    if (qty === 0 && amount === 0) continue

    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].isOther) continue
      const score = matchScore(actual, groups[i].tokens, groups[i].reservedCodes)
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    if (bestIdx < 0 || bestScore < 42) {
      const codeNum = normalizeProductCode(actual.product_code || '')
      const otherBucket = otherProgressCategoryForProductCode(actual.product_code || '')
      const otherIdx =
        otherBucket && !(codeNum && reservedAll.has(codeNum))
          ? groups.findIndex((g) => g.isOther && g.progressCat === otherBucket)
          : -1
      if (otherIdx >= 0) {
        const otherRow = rows[otherIdx]
        otherRow.soldQty[month] += qty
        otherRow.soldAmount[month] += amount
        otherRow.soldQtyTotal += qty
        otherRow.soldAmountTotal += amount
        continue
      }
      unmatched.qty[month] += qty
      unmatched.amount[month] += amount
      unmatched.qtyTotal += qty
      unmatched.amountTotal += amount
      const category = unmatchedCategoryFor(actual.plan_category)
      const bucket = unmatchedMap.get(category) || emptyUnmatchedBucket(category)
      bucket.qty[month] += qty
      bucket.amount[month] += amount
      bucket.qtyTotal += qty
      bucket.amountTotal += amount
      unmatchedMap.set(category, bucket)
      continue
    }

    const row = rows[bestIdx]
    row.soldQty[month] += qty
    row.soldAmount[month] += amount
    row.soldQtyTotal += qty
    row.soldAmountTotal += amount
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
