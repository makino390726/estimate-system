import { normalizeStaffNameKey } from '@/lib/staffNameMatch'

export type PlanStaffMatch = { id: string; name: string }

function stripTrailingDigits(key: string): string {
  return key.replace(/[0-9０-９]+$/g, '')
}

/**
 * Excel の担当（久木崎、屋比久２、田中　伸一）を staffs 行に解決する。
 * 完全一致 → 末尾数字除去 → 前方一致（候補1件、または最長）。
 */
export function resolveExcelStaffId(
  rawName: string,
  staffs: readonly PlanStaffMatch[],
): string | null {
  const key = normalizeStaffNameKey(rawName)
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
