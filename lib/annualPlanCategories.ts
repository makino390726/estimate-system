/** factory-materials heater_models.product_category と同じ */
export const FACTORY_PRODUCT_CATEGORIES = [
  '暖房機',
  'たばこ乾燥機',
  '食品乾燥機',
  '光合成促進装置',
  '作業器機',
  'その他',
] as const

const PRODUCT_CATEGORIES = ['肥料', '農薬', '資材'] as const

export const PLAN_CATEGORIES = [...FACTORY_PRODUCT_CATEGORIES, ...PRODUCT_CATEGORIES] as const

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
}

export function isProductPlanCategory(category: string): boolean {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(category)
}

export function isKnownPlanCategory(category: string): boolean {
  return (
    (PLAN_CATEGORIES as readonly string[]).includes(category) ||
    category in LEGACY_CATEGORY_MAP
  )
}

/** 計画カテゴリを factory-materials の product_category に揃える */
export function factoryCategoryFor(planCategory: string): string | null {
  if (isProductPlanCategory(planCategory)) return null
  if ((FACTORY_PRODUCT_CATEGORIES as readonly string[]).includes(planCategory)) {
    return planCategory
  }
  if (planCategory in LEGACY_CATEGORY_MAP) return LEGACY_CATEGORY_MAP[planCategory]
  return 'その他'
}

export function displayPlanCategory(category: string): string {
  return factoryCategoryFor(category) ?? category
}

export const DEFAULT_GROSS_MARGIN = 0.18

export function defaultGrossProfit(amount: number): number {
  return Math.round(amount * DEFAULT_GROSS_MARGIN)
}
