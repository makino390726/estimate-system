/** factory-materials heater_models.product_category と同じ */
export const FACTORY_PRODUCT_CATEGORIES = [
  '暖房機',
  'たばこ乾燥機',
  '食品乾燥機',
  '光合成促進装置',
  '作業器機',
  'その他',
] as const

/** 見積商品マスタ側。入力は金額必須、品名・数量は任意 */
export const AMOUNT_ONLY_CATEGORIES = ['肥料', '農薬', '資材', '工事'] as const

export const PLAN_CATEGORIES = [...FACTORY_PRODUCT_CATEGORIES, ...AMOUNT_ONLY_CATEGORIES] as const

export type PlanCategory = (typeof PLAN_CATEGORIES)[number]

export type PlanConfidence = 'high' | 'mid' | 'low'

export const CONFIDENCE_LABEL: Record<PlanConfidence, string> = {
  high: '●',
  mid: '▲',
  low: '□',
}

export const CONFIDENCE_OPTIONS: Array<{ value: PlanConfidence; label: string }> = [
  { value: 'high', label: '● 高い' },
  { value: 'mid', label: '▲ 中' },
  { value: 'low', label: '□ 低い' },
]

/** 品名なしの金額行。machine_code は NOT NULL のため固定キーを入れる */
export const LUMP_MACHINE_CODE = 'lump'

export const CLOSED_CASE_STATUSES = ['受注', '注文', '完了'] as const

/** 旧紙分類 → factory-materials の product_category（既存行の互換） */
export const LEGACY_CATEGORY_MAP: Record<string, string | null> = {
  光合成: '光合成促進装置',
  たばこ: 'たばこ乾燥機',
  干芋: '食品乾燥機',
  作業機械: '作業器機',
  特殊: 'その他',
  他: 'その他',
  SP: '暖房機',
  'CVD-ES': '暖房機',
  EC: '暖房機',
  マイコン: '暖房機',
  送風機: '暖房機',
  バーナー: '暖房機',
  肥料: null,
  農薬: null,
  資材: null,
  工事: null,
}

export function isAmountOnlyPlanCategory(category: string): boolean {
  return (AMOUNT_ONLY_CATEGORIES as readonly string[]).includes(category)
}

export function isProductPlanCategory(category: string): boolean {
  return isAmountOnlyPlanCategory(category)
}

export function isFactoryPlanCategory(category: string): boolean {
  if ((FACTORY_PRODUCT_CATEGORIES as readonly string[]).includes(category)) return true
  const mapped = LEGACY_CATEGORY_MAP[category]
  return Boolean(mapped)
}

export function isKnownPlanCategory(category: string): boolean {
  return (
    (PLAN_CATEGORIES as readonly string[]).includes(category) ||
    category in LEGACY_CATEGORY_MAP
  )
}

/** 計画カテゴリを factory-materials の product_category に揃える */
export function factoryCategoryFor(planCategory: string): string | null {
  if (isAmountOnlyPlanCategory(planCategory)) return null
  if ((FACTORY_PRODUCT_CATEGORIES as readonly string[]).includes(planCategory)) {
    return planCategory
  }
  if (planCategory in LEGACY_CATEGORY_MAP) return LEGACY_CATEGORY_MAP[planCategory]
  return 'その他'
}

export function displayPlanCategory(category: string): string {
  if (isAmountOnlyPlanCategory(category)) return category
  const factory = factoryCategoryFor(category)
  if (!factory) return category
  return `生産品（${factory}）`
}

/** 進捗・Excel対比用。暖房機・食品乾燥機・たばこ乾燥機等は生産品 */
export const PROGRESS_CATEGORIES = ['生産品', ...AMOUNT_ONLY_CATEGORIES] as const

export function progressCategoryFor(category: string): string {
  const raw = String(category || '').trim()
  if (isAmountOnlyPlanCategory(raw)) return raw
  return '生産品'
}

export function isProductionPlanCategory(category: string): boolean {
  return progressCategoryFor(category) === '生産品'
}

export function progressCategoryLabel(category: string): string {
  return progressCategoryFor(category)
}

/** Excel 科目 → 計画上の実績バケツ。石油・その他資材は資材 */
export function excelPlanCategoryFor(kamoku: string): string | null {
  const k = String(kamoku || '').trim()
  if (k === '石油' || k === 'その他資材') return '資材'
  if (k === '生産品' || k === '肥料' || k === '農薬' || k === '資材' || k === '工事') return k
  return null
}

/** 計画カテゴリ → Excel 実績の集計キー */
export function planCategoryToExcelBucket(category: string): string {
  return progressCategoryFor(category)
}

export function productIdPrefixesForCategory(category: string): string[] {
  switch (category) {
    case '肥料':
      return ['4']
    case '農薬':
      return ['5']
    case '資材':
      return ['6', '9']
    case '工事':
      return ['7']
    default:
      return []
  }
}

export const DEFAULT_GROSS_MARGIN = 0.18

export function defaultGrossProfit(amount: number): number {
  return Math.round(amount * DEFAULT_GROSS_MARGIN)
}

/** 確定後の追加行。下書き中の行は当初 */
export type PlanChangeKind = 'initial' | 'interim'

export const CHANGE_KIND_LABEL: Record<PlanChangeKind, string> = {
  initial: '当初',
  interim: '中間修正',
}

export const CHANGE_KIND_OPTIONS: Array<{ value: PlanChangeKind; label: string; hint: string }> = [
  { value: 'initial', label: '当初計画の変更', hint: '経営の上乗せ・当初の訂正' },
  { value: 'interim', label: '中間計画の変更', hint: '確定後の途中見直し。同じ品名は中間の数量・金額が中間計画になります' },
]

export function lineChangeKind(line: { change_kind?: string | null }): PlanChangeKind {
  return line.change_kind === 'interim' ? 'interim' : 'initial'
}
