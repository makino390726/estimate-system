/**
 * 日付バリデーション・フォーマッティングユーティリティ
 * 
 * Excel インポート時に日付データが YYYY-MM-DD 形式で正しく処理されることを保証
 */

/**
 * 与えられた値が有効な YYYY-MM-DD 形式かチェック
 */
export function isValidDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false
  
  const parts = trimmed.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  
  // 年月日の妥当性チェック
  if (year < 1900 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  
  // より厳密なチェック（実在しない日付をフィルタリング）
  const date = new Date(`${trimmed}T00:00:00Z`)
  if (isNaN(date.getTime())) return false
  
  // 日付が意図した通りかチェック（例：2月30日のような無効な日付の場合）
  const utcYear = date.getUTCFullYear()
  const utcMonth = date.getUTCMonth() + 1
  const utcDay = date.getUTCDate()
  
  const yearMatch = utcYear === year
  const monthMatch = utcMonth === month
  const dayMatch = utcDay === day
  
  return yearMatch && monthMatch && dayMatch
}

/**
 * 日付文字列をサニタイズしてフォーマット済みの YYYY-MM-DD を返す
 * 無効な場合は null を返す
 */
export function sanitizeDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  
  const str = String(value).trim()
  if (!str) return null
  
  // 既に正しい形式の場合
  if (isValidDateString(str)) {
    return str
  }
  
  // 他の形式で試す
  // 例：2025/01/14 → 2025-01-14
  const slashMatch = str.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)
  if (slashMatch) {
    const year = slashMatch[1]
    const month = String(Number(slashMatch[2])).padStart(2, '0')
    const day = String(Number(slashMatch[3])).padStart(2, '0')
    const formatted = `${year}-${month}-${day}`
    
    if (isValidDateString(formatted)) {
      return formatted
    }
  }
  
  return null
}

/**
 * HTML date input 用の値を取得（YYYY-MM-DD形式、不正な場合は空文字列）
 */
export function getDateInputValue(value: unknown): string {
  const sanitized = sanitizeDateString(value)
  return sanitized || ''
}

/**
 * 今日の日付を YYYY-MM-DD 形式で返す
 */
export function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 複数の候補から最初の有効な日付を返す
 */
export function getFirstValidDate(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const sanitized = sanitizeDateString(candidate)
    if (sanitized) return sanitized
  }
  return null
}

/**
 * デバッグ用：日付値の検証結果をコンソールに出力
 */
export function debugDateValue(label: string, value: unknown): void {
  const sanitized = sanitizeDateString(value)
  const isValid = isValidDateString(sanitized)
  
  console.log(
    `[DateValidator] ${label}: input="${value}" → sanitized="${sanitized}" → valid=${isValid}`
  )
}
