import { isPurchasingExcelDepartment, PURCHASING_EXCEL_STAFF_NAME } from '@/lib/branches'
import { normalizeStaffNameKey } from '@/lib/staffNameMatch'

export type PlanStaffMatch = { id: string; name: string }

/** Excel 担当名 → 年度計画の担当。大倉野・スタンドは購買の大迫に寄せる */
const EXCEL_STAFF_ALIASES: Array<{ needles: string[]; name: string }> = [
  { needles: ['大倉野', 'スタンド'], name: PURCHASING_EXCEL_STAFF_NAME },
]

function stripTrailingDigits(key: string): string {
  return key.replace(/[0-9０-９]+$/g, '')
}

function aliasedExcelStaffName(rawName: string): string {
  const key = normalizeStaffNameKey(rawName)
  if (!key) return rawName
  for (const alias of EXCEL_STAFF_ALIASES) {
    if (alias.needles.some((n) => key.includes(normalizeStaffNameKey(n)))) return alias.name
  }
  return rawName
}

export function isOsakoExcelAlias(rawName: string | null | undefined): boolean {
  const raw = String(rawName || '')
  return Boolean(raw) && aliasedExcelStaffName(raw) === PURCHASING_EXCEL_STAFF_NAME
}

/**
 * Excel の担当（久木崎、屋比久２、田中　伸一）を staffs 行に解決する。
 * 完全一致 → 末尾数字除去 → 前方一致（候補1件、または最短）。
 * 﨑/崎などの人名異体字は normalizeStaffNameKey で揃える。
 */
export function resolveExcelStaffId(
  rawName: string,
  staffs: readonly PlanStaffMatch[],
): string | null {
  const key = normalizeStaffNameKey(aliasedExcelStaffName(rawName))
  if (!key) return null

  const rows = staffs
    .map((s) => ({ id: String(s.id), name: s.name, key: normalizeStaffNameKey(s.name) }))
    .filter((s) => s.key)

  const exact = rows.find((s) => s.key === key)
  if (exact) return exact.id

  const stripped = stripTrailingDigits(key)
  if (stripped && stripped !== key) {
    const strippedExact = rows.find((s) => s.key === stripped)
    if (strippedExact) return strippedExact.id
  }

  const needle = stripped || key
  if (needle.length < 2) return null

  const candidates = rows.filter(
    (s) => s.key.startsWith(needle) || needle.startsWith(s.key),
  )
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].id

  const equal = candidates.find((s) => s.key === needle)
  if (equal) return equal.id
  candidates.sort((a, b) => a.key.length - b.key.length)
  return candidates[0].id
}

/** 管理・農材・燃料、および Excel 担当「大倉野」「スタンド」は大迫。 */
export function resolveSalesActualStaffId(
  input: {
    department?: string | null
    staff_name_raw?: string | null
    staff_id?: string | null
  },
  staffs: readonly PlanStaffMatch[],
): string | null {
  if (isPurchasingExcelDepartment(input.department) || isOsakoExcelAlias(input.staff_name_raw)) {
    return resolveExcelStaffId(PURCHASING_EXCEL_STAFF_NAME, staffs)
  }
  if (input.staff_id) return String(input.staff_id)
  return resolveExcelStaffId(String(input.staff_name_raw || ''), staffs)
}
