import { fiscalMonthSlots } from '@/lib/annualPlanFiscal'

export type SalesLine = {
  slip_no: string
  billed_on: string
  product_name: string
  customer_name: string
  kamoku: string
  department: string
  staff_name: string
  unit_price: number
  amount: number
}

export type AnalysisColumn = {
  key: string
  label: string
  align?: 'left' | 'right'
}

export type AnalysisTable = {
  title: string
  columns: AnalysisColumn[]
  rows: Record<string, string | number>[]
}

export type SalesAnalysisPayload = {
  kpis: { label: string; value: string }[]
  tables: AnalysisTable[]
  note: string
  rowCount: number
  priorRowCount: number
}

const SUBJECTS = ['製品', '運賃', '修理', '部品', '工事', '対物']
const TOP_N = 30

function yen(value: number) {
  return `${Math.round(value).toLocaleString('ja-JP')} 円`
}

function num(value: number) {
  return Math.round(value).toLocaleString('ja-JP')
}

function share(value: number, total: number) {
  if (!total) return '—'
  return `${((value / total) * 100).toFixed(1)}%`
}

function yoyPct(current: number, prior: number) {
  if (!prior) return '—'
  return `${(((current - prior) / Math.abs(prior)) * 100).toFixed(1)}%`
}

function text(value: string, fallback: string) {
  const trimmed = value.trim()
  return trimmed || fallback
}

function sumBy(lines: SalesLine[], keyOf: (line: SalesLine) => string) {
  const map = new Map<string, number>()
  for (const line of lines) {
    const key = keyOf(line)
    map.set(key, (map.get(key) || 0) + line.amount)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

function totalOf(lines: SalesLine[]) {
  return lines.reduce((sum, line) => sum + line.amount, 0)
}

function distinct(lines: SalesLine[], keyOf: (line: SalesLine) => string) {
  const set = new Set<string>()
  for (const line of lines) {
    const key = keyOf(line).trim()
    if (key) set.add(key)
  }
  return set.size
}

function slipCount(lines: SalesLine[]) {
  const slips = new Set<string>()
  let blank = 0
  for (const line of lines) {
    if (line.slip_no) slips.add(line.slip_no)
    else blank += 1
  }
  return slips.size + blank
}

function billedDate(line: SalesLine) {
  const raw = line.billed_on.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

function latestBilledOn(lines: SalesLine[]) {
  let latest = ''
  for (const line of lines) {
    const date = billedDate(line)
    if (date > latest) latest = date
  }
  return latest
}

function shiftYear(iso: string, delta: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year + delta, month, 0)).getUTCDate()
  const clamped = Math.min(day, lastDay)
  const shifted = new Date(Date.UTC(year + delta, month - 1, clamped))
  return shifted.toISOString().slice(0, 10)
}

function slashDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${year}/${Number(month)}/${Number(day)}`
}

function slotsUntil(fiscalYear: number, endIso: string) {
  const slots = fiscalMonthSlots(fiscalYear)
  const index = slots.findIndex((slot) => slot.key === endIso.slice(0, 7))
  return index < 0 ? slots : slots.slice(0, index + 1)
}

function monthKey(line: SalesLine, fiscalYear: number) {
  const raw = line.billed_on.slice(0, 7)
  const slot = fiscalMonthSlots(fiscalYear).find((item) => item.key === raw)
  return slot?.label || '日付なし'
}

function monthAmount(lines: SalesLine[], fiscalYear: number) {
  const slots = fiscalMonthSlots(fiscalYear)
  const amounts = new Map(slots.map((slot) => [slot.label, 0]))
  let unknown = 0
  for (const line of lines) {
    const label = monthKey(line, fiscalYear)
    if (!amounts.has(label)) unknown += line.amount
    else amounts.set(label, (amounts.get(label) || 0) + line.amount)
  }
  return { slots, amounts, unknown }
}

function ranked(lines: SalesLine[], keyOf: (line: SalesLine) => string, limit = TOP_N) {
  return sumBy(lines, keyOf).slice(0, limit)
}

function abcClass(start: number, total: number) {
  if (!total) return 'C'
  const ratio = start / total
  if (ratio < 0.8) return 'A'
  if (ratio < 0.95) return 'B'
  return 'C'
}

export function buildSalesAnalysis(
  view: string,
  current: SalesLine[],
  prior: SalesLine[],
  fiscalYear: number,
): SalesAnalysisPayload {
  const comparesPrior = view.startsWith('yoy_') || view === 'lifecycle'
  const currentEnd = latestBilledOn(current)
  const priorEnd = currentEnd ? shiftYear(currentEnd, -1) : ''
  const priorImported = prior.length > 0
  if (comparesPrior && priorEnd) {
    prior = prior.filter((line) => {
      const date = billedDate(line)
      return date !== '' && date <= priorEnd
    })
  }
  const total = totalOf(current)
  const priorTotal = totalOf(prior)
  const currentStart = `${fiscalYear - 1}-09-01`
  const priorStart = `${fiscalYear - 2}-09-01`
  let note = ''
  if (comparesPrior && !priorImported) {
    note = `${fiscalYear - 1}年度の売上Excelは未取込です。比較は空欄になります。`
  } else if (comparesPrior && currentEnd) {
    note = `前年同期（${slashDate(priorStart)}〜${slashDate(priorEnd)}）と比較しています。当期は ${slashDate(currentStart)}〜${slashDate(currentEnd)} です。`
  } else if (comparesPrior) {
    note = '当期の請求日がないため、前年同期の範囲を決められません。'
  }
  const base = { note, rowCount: current.length, priorRowCount: prior.length }

  if (view === 'summary') {
    const months = monthAmount(current, fiscalYear)
    let running = 0
    return {
      ...base,
      kpis: [
        { label: '総売上（税抜）', value: yen(total) },
        { label: '伝票件数', value: `${num(slipCount(current))} 件` },
        { label: '得意先数', value: `${num(distinct(current, (line) => line.customer_name))} 社` },
        { label: '担当者数', value: `${num(distinct(current, (line) => line.staff_name))} 名` },
        { label: '月平均売上', value: yen(total / 12) },
      ],
      tables: [
        {
          title: '月別売上',
          columns: [
            { key: 'month', label: '月' },
            { key: 'amount', label: '税抜', align: 'right' },
            { key: 'running', label: '累計', align: 'right' },
          ],
          rows: months.slots.map((slot) => {
            const amount = months.amounts.get(slot.label) || 0
            running += amount
            return { month: slot.label, amount: yen(amount), running: yen(running) }
          }),
        },
        {
          title: '科目構成',
          columns: [
            { key: 'name', label: '科目' },
            { key: 'amount', label: '税抜', align: 'right' },
            { key: 'share', label: '構成比', align: 'right' },
          ],
          rows: sumBy(current, (line) => text(line.kamoku, '（科目なし）')).map(([name, amount]) => ({
            name,
            amount: yen(amount),
            share: share(amount, total),
          })),
        },
      ],
    }
  }

  if (view === 'yoy_summary') {
    return {
      ...base,
      kpis: [
        { label: `${fiscalYear}年度（同期）`, value: yen(total) },
        { label: '前年同期', value: yen(priorTotal) },
        { label: '差額', value: yen(total - priorTotal) },
        { label: '前年比', value: yoyPct(total, priorTotal) },
        { label: '得意先数の差', value: num(distinct(current, (line) => line.customer_name) - distinct(prior, (line) => line.customer_name)) },
      ],
      tables: [],
    }
  }

  if (view === 'yoy_monthly') {
    const currentMonths = monthAmount(current, fiscalYear)
    const priorMonths = monthAmount(prior, fiscalYear - 1)
    const slots = currentEnd ? slotsUntil(fiscalYear, currentEnd) : currentMonths.slots
    const partialDay = currentEnd && Number(currentEnd.slice(8, 10)) < new Date(Date.UTC(Number(currentEnd.slice(0, 4)), Number(currentEnd.slice(5, 7)), 0)).getUTCDate()
      ? Number(currentEnd.slice(8, 10))
      : 0
    return {
      ...base,
      kpis: [
        { label: `${fiscalYear}年度（同期）`, value: yen(total) },
        { label: '前年同期', value: yen(priorTotal) },
      ],
      tables: [
        {
          title: '月別比較',
          columns: [
            { key: 'month', label: '月' },
            { key: 'current', label: `${fiscalYear}年度`, align: 'right' },
            { key: 'prior', label: '前年同期', align: 'right' },
            { key: 'diff', label: '差額', align: 'right' },
            { key: 'rate', label: '前年比', align: 'right' },
          ],
          rows: slots.map((slot, index) => {
            const now = currentMonths.amounts.get(slot.label) || 0
            const before = priorMonths.amounts.get(slot.label) || 0
            const month = partialDay && index === slots.length - 1 ? `${slot.label}（${partialDay}日まで）` : slot.label
            return { month, current: yen(now), prior: yen(before), diff: yen(now - before), rate: yoyPct(now, before) }
          }),
        },
      ],
    }
  }

  const compareTable = (title: string, keyOf: (line: SalesLine) => string, limit = TOP_N): AnalysisTable => {
    const now = new Map(sumBy(current, keyOf))
    const before = new Map(sumBy(prior, keyOf))
    const names = [...new Set([...now.keys(), ...before.keys()])]
    const rows = names
      .map((name) => {
        const currentAmount = now.get(name) || 0
        const priorAmount = before.get(name) || 0
        return { name, currentAmount, priorAmount, diff: currentAmount - priorAmount }
      })
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, limit)
      .map((row) => ({
        name: row.name,
        current: yen(row.currentAmount),
        prior: yen(row.priorAmount),
        diff: yen(row.diff),
        rate: yoyPct(row.currentAmount, row.priorAmount),
      }))
    return {
      title,
      columns: [
        { key: 'name', label: '名称' },
        { key: 'current', label: `${fiscalYear}年度`, align: 'right' },
        { key: 'prior', label: '前年同期', align: 'right' },
        { key: 'diff', label: '差額', align: 'right' },
        { key: 'rate', label: '前年比', align: 'right' },
      ],
      rows,
    }
  }

  if (view === 'yoy_person') {
    return { ...base, kpis: [{ label: '差額', value: yen(total - priorTotal) }], tables: [compareTable('担当者別比較', (line) => text(line.staff_name, '（担当なし）'), 50)] }
  }
  if (view === 'yoy_subject') {
    return { ...base, kpis: [{ label: '差額', value: yen(total - priorTotal) }], tables: [compareTable('科目別比較', (line) => text(line.kamoku, '（科目なし）'), 20)] }
  }
  if (view === 'yoy_product') {
    return { ...base, kpis: [{ label: '差額', value: yen(total - priorTotal) }], tables: [compareTable('商品別比較', (line) => text(line.product_name, '（商品名なし）'))] }
  }
  if (view === 'yoy_customer' || view === 'lifecycle') {
    const nowNames = new Set(current.map((line) => line.customer_name.trim()).filter(Boolean))
    const priorNames = new Set(prior.map((line) => line.customer_name.trim()).filter(Boolean))
    const fresh = [...nowNames].filter((name) => !priorNames.has(name))
    const gone = [...priorNames].filter((name) => !nowNames.has(name))
    const nowMap = new Map(sumBy(current, (line) => text(line.customer_name, '（得意先なし）')))
    const priorMap = new Map(sumBy(prior, (line) => text(line.customer_name, '（得意先なし）')))
    return {
      ...base,
      kpis: [
        { label: '新規得意先', value: `${num(fresh.length)} 社` },
        { label: '離脱得意先', value: `${num(gone.length)} 社` },
        { label: '継続得意先', value: `${num([...nowNames].filter((name) => priorNames.has(name)).length)} 社` },
      ],
      tables: [
        compareTable('増減の大きい得意先', (line) => text(line.customer_name, '（得意先なし）')),
        {
          title: '新規得意先',
          columns: [
            { key: 'name', label: '得意先' },
            { key: 'amount', label: `${fiscalYear}年度`, align: 'right' },
          ],
          rows: fresh
            .map((name) => ({ name, amount: nowMap.get(name) || 0 }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, TOP_N)
            .map((row) => ({ name: row.name, amount: yen(row.amount) })),
        },
        {
          title: '離脱得意先',
          columns: [
            { key: 'name', label: '得意先' },
            { key: 'amount', label: '前年同期', align: 'right' },
          ],
          rows: gone
            .map((name) => ({ name, amount: priorMap.get(name) || 0 }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, TOP_N)
            .map((row) => ({ name: row.name, amount: yen(row.amount) })),
        },
      ],
    }
  }

  if (view === 'department' || view === 'person' || view === 'subject' || view === 'product') {
    const keyOf =
      view === 'department'
        ? (line: SalesLine) => text(line.department, '（部門なし）')
        : view === 'person'
          ? (line: SalesLine) => text(line.staff_name, '（担当なし）')
          : view === 'subject'
            ? (line: SalesLine) => text(line.kamoku, '（科目なし）')
            : (line: SalesLine) => text(line.product_name, '（商品名なし）')
    const title = view === 'department' ? '部門別' : view === 'person' ? '担当者別' : view === 'subject' ? '科目別' : '商品別'
    if (view === 'person') {
      const slips = new Map<string, Set<string>>()
      const blanks = new Map<string, number>()
      for (const line of current) {
        const name = text(line.staff_name, '（担当なし）')
        if (line.slip_no) {
          if (!slips.has(name)) slips.set(name, new Set())
          slips.get(name)?.add(line.slip_no)
        } else blanks.set(name, (blanks.get(name) || 0) + 1)
      }
      return {
        ...base,
        kpis: [{ label: '総売上（税抜）', value: yen(total) }],
        tables: [
          {
            title,
            columns: [
              { key: 'name', label: '担当者' },
              { key: 'amount', label: '税抜', align: 'right' },
              { key: 'slips', label: '伝票件数', align: 'right' },
              { key: 'avg', label: '平均伝票単価', align: 'right' },
              { key: 'share', label: '構成比', align: 'right' },
            ],
            rows: sumBy(current, keyOf).map(([name, amount]) => {
              const count = (slips.get(name)?.size || 0) + (blanks.get(name) || 0)
              return { name, amount: yen(amount), slips: num(count), avg: yen(count ? amount / count : 0), share: share(amount, total) }
            }),
          },
        ],
      }
    }
    return {
      ...base,
      kpis: [{ label: '総売上（税抜）', value: yen(total) }],
      tables: [
        {
          title,
          columns: [
            { key: 'name', label: '名称' },
            { key: 'amount', label: '税抜', align: 'right' },
            { key: 'share', label: '構成比', align: 'right' },
          ],
          rows: ranked(current, keyOf, view === 'product' ? TOP_N : 50).map(([name, amount]) => ({
            name,
            amount: yen(amount),
            share: share(amount, total),
          })),
        },
      ],
    }
  }

  if (view === 'customer') {
    const pairs = sumBy(current, (line) => text(line.customer_name, '（得意先なし）'))
    const grand = pairs.reduce((sum, [, amount]) => sum + amount, 0)
    let running = 0
    const classes = { A: 0, B: 0, C: 0 }
    const rows = pairs.map(([name, amount]) => {
      const start = running
      running += amount
      const cls = abcClass(start, grand) as 'A' | 'B' | 'C'
      classes[cls] += 1
      return { name, amount, running, cls }
    })
    return {
      ...base,
      kpis: [
        { label: 'A（累計80%まで）', value: `${num(classes.A)} 社` },
        { label: 'B（80–95%）', value: `${num(classes.B)} 社` },
        { label: 'C', value: `${num(classes.C)} 社` },
      ],
      tables: [
        {
          title: '得意先ランキング',
          columns: [
            { key: 'rank', label: '順位', align: 'right' },
            { key: 'name', label: '得意先' },
            { key: 'amount', label: '税抜', align: 'right' },
            { key: 'share', label: '構成比', align: 'right' },
            { key: 'cum', label: '累計比', align: 'right' },
            { key: 'cls', label: 'ABC' },
          ],
          rows: rows.slice(0, TOP_N).map((row, index) => ({
            rank: index + 1,
            name: row.name,
            amount: yen(row.amount),
            share: share(row.amount, grand),
            cum: share(row.running, grand),
            cls: row.cls,
          })),
        },
      ],
    }
  }

  if (view === 'monthly') {
    const slots = fiscalMonthSlots(fiscalYear)
    const departments = sumBy(current, (line) => text(line.department, '（部門なし）')).slice(0, 8).map(([name]) => name)
    const matrix = new Map<string, Map<string, number>>()
    for (const slot of slots) matrix.set(slot.label, new Map(departments.map((name) => [name, 0])))
    for (const line of current) {
      const label = monthKey(line, fiscalYear)
      const bucket = matrix.get(label)
      const name = text(line.department, '（部門なし）')
      if (bucket && bucket.has(name)) bucket.set(name, (bucket.get(name) || 0) + line.amount)
    }
    return {
      ...base,
      kpis: [{ label: '総売上（税抜）', value: yen(total) }],
      tables: [
        {
          title: '月×部門',
          columns: [{ key: 'month', label: '月' }, ...departments.map((name) => ({ key: name, label: name, align: 'right' as const }))],
          rows: slots.map((slot) => {
            const row: Record<string, string | number> = { month: slot.label }
            for (const name of departments) row[name] = yen(matrix.get(slot.label)?.get(name) || 0)
            return row
          }),
        },
      ],
    }
  }

  if (view === 'seasonal') {
    const months = monthAmount(current, fiscalYear)
    const avg = total / 12
    return {
      ...base,
      kpis: [{ label: '月平均', value: yen(avg) }],
      tables: [
        {
          title: '季節指数（月平均=100）',
          columns: [
            { key: 'month', label: '月' },
            { key: 'amount', label: '税抜', align: 'right' },
            { key: 'index', label: '指数', align: 'right' },
          ],
          rows: months.slots.map((slot) => {
            const amount = months.amounts.get(slot.label) || 0
            return { month: slot.label, amount: yen(amount), index: avg ? (amount / avg * 100).toFixed(1) : '—' }
          }),
        },
      ],
    }
  }

  if (view === 'large_deals') {
    const deals = new Map<string, { amount: number; customer: string; staff: string; count: number }>()
    current.forEach((line, index) => {
      const key = line.slip_no || `明細${index + 1}`
      const hit = deals.get(key) || { amount: 0, customer: line.customer_name, staff: line.staff_name, count: 0 }
      hit.amount += line.amount
      hit.count += 1
      if (!hit.customer) hit.customer = line.customer_name
      if (!hit.staff) hit.staff = line.staff_name
      deals.set(key, hit)
    })
    return {
      ...base,
      kpis: [{ label: '伝票件数', value: `${num(deals.size)} 件` }],
      tables: [
        {
          title: '伝票金額の上位',
          columns: [
            { key: 'slip', label: '伝票NO' },
            { key: 'customer', label: '得意先' },
            { key: 'staff', label: '担当' },
            { key: 'amount', label: '税抜', align: 'right' },
          ],
          rows: [...deals.entries()]
            .sort((a, b) => b[1].amount - a[1].amount)
            .slice(0, TOP_N)
            .map(([slip, deal]) => ({
              slip,
              customer: text(deal.customer, '—'),
              staff: text(deal.staff, '—'),
              amount: yen(deal.amount),
            })),
        },
      ],
    }
  }

  if (view === 'price') {
    const products = new Map<string, { min: number; max: number; sum: number; count: number; amount: number }>()
    for (const line of current) {
      if (!line.unit_price) continue
      const name = text(line.product_name, '（商品名なし）')
      const hit = products.get(name) || { min: line.unit_price, max: line.unit_price, sum: 0, count: 0, amount: 0 }
      hit.min = Math.min(hit.min, line.unit_price)
      hit.max = Math.max(hit.max, line.unit_price)
      hit.sum += line.unit_price
      hit.count += 1
      hit.amount += line.amount
      products.set(name, hit)
    }
    return {
      ...base,
      kpis: [{ label: '対象商品', value: `${num([...products.values()].filter((item) => item.count >= 3).length)} 件` }],
      tables: [
        {
          title: '同一商品の単価幅（3件以上）',
          columns: [
            { key: 'name', label: '商品' },
            { key: 'count', label: '明細数', align: 'right' },
            { key: 'min', label: '最低単価', align: 'right' },
            { key: 'avg', label: '平均単価', align: 'right' },
            { key: 'max', label: '最高単価', align: 'right' },
            { key: 'amount', label: '税抜', align: 'right' },
          ],
          rows: [...products.entries()]
            .filter(([, item]) => item.count >= 3 && item.max > item.min)
            .sort((a, b) => b[1].max - b[1].min - (a[1].max - a[1].min))
            .slice(0, TOP_N)
            .map(([name, item]) => ({
              name,
              count: num(item.count),
              min: yen(item.min),
              avg: yen(item.sum / item.count),
              max: yen(item.max),
              amount: yen(item.amount),
            })),
        },
      ],
    }
  }

  if (view === 'heatmap' || view === 'pivot') {
    const slots = fiscalMonthSlots(fiscalYear)
    const staffs = sumBy(current, (line) => text(line.staff_name, '（担当なし）')).slice(0, 40).map(([name]) => name)
    if (view === 'heatmap') {
      const matrix = new Map(staffs.map((name) => [name, new Map(slots.map((slot) => [slot.label, 0]))]))
      for (const line of current) {
        const name = text(line.staff_name, '（担当なし）')
        const row = matrix.get(name)
        const label = monthKey(line, fiscalYear)
        if (row?.has(label)) row.set(label, (row.get(label) || 0) + line.amount)
      }
      return {
        ...base,
        kpis: [{ label: '表示担当', value: `${num(staffs.length)} 名` }],
        tables: [
          {
            title: '担当者 × 月',
            columns: [{ key: 'name', label: '担当者' }, ...slots.map((slot) => ({ key: slot.label, label: slot.label, align: 'right' as const }))],
            rows: staffs.map((name) => {
              const row: Record<string, string | number> = { name }
              for (const slot of slots) row[slot.label] = yen(matrix.get(name)?.get(slot.label) || 0)
              return row
            }),
          },
        ],
      }
    }
    const subjects = [...SUBJECTS]
    for (const [name] of sumBy(current, (line) => text(line.kamoku, '（科目なし）'))) {
      if (!subjects.includes(name)) subjects.push(name)
    }
    const matrix = new Map(staffs.map((name) => [name, new Map(subjects.map((subject) => [subject, 0]))]))
    for (const line of current) {
      const name = text(line.staff_name, '（担当なし）')
      const row = matrix.get(name)
      const subject = text(line.kamoku, '（科目なし）')
      if (row?.has(subject)) row.set(subject, (row.get(subject) || 0) + line.amount)
    }
    return {
      ...base,
      kpis: [{ label: '総売上（税抜）', value: yen(total) }],
      tables: [
        {
          title: '担当者 × 科目',
          columns: [{ key: 'name', label: '担当者' }, ...subjects.map((subject) => ({ key: subject, label: subject, align: 'right' as const }))],
          rows: staffs.map((name) => {
            const row: Record<string, string | number> = { name }
            for (const subject of subjects) row[subject] = yen(matrix.get(name)?.get(subject) || 0)
            return row
          }),
        },
      ],
    }
  }

  return { ...base, kpis: [], tables: [], note: 'この分析メニューはありません。' }
}
