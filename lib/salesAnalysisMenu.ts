export type SalesAnalysisItem = {
  id: string
  label: string
  description: string
  needsPriorYear: boolean
}

export type SalesAnalysisGroup = {
  title: string
  items: SalesAnalysisItem[]
}

export const SALES_ANALYSIS_GROUPS: SalesAnalysisGroup[] = [
  {
    title: '経営ダッシュボード',
    items: [
      { id: 'summary', label: '経営サマリー', description: '売上概要・月次推移・科目構成', needsPriorYear: false },
      { id: 'yoy_summary', label: '年度比較サマリー', description: '前年同期との総合比較', needsPriorYear: true },
    ],
  },
  {
    title: '年度比較分析',
    items: [
      { id: 'yoy_monthly', label: '月別年度比較', description: '前年同期の月次比較', needsPriorYear: true },
      { id: 'yoy_person', label: '担当者別比較', description: '担当者別の前年同期比', needsPriorYear: true },
      { id: 'yoy_customer', label: '得意先比較', description: '前年同期の新規・離脱・増減', needsPriorYear: true },
      { id: 'yoy_subject', label: '科目別比較', description: '科目ごとの前年同期比', needsPriorYear: true },
      { id: 'yoy_product', label: '商品別比較', description: '商品ごとの前年同期比', needsPriorYear: true },
    ],
  },
  {
    title: '詳細分析',
    items: [
      { id: 'monthly', label: '月別推移', description: '部門・担当者の月次推移', needsPriorYear: false },
      { id: 'department', label: '部門別', description: '部門別売上・構成比', needsPriorYear: false },
      { id: 'person', label: '担当者別', description: '売上・件数・平均単価', needsPriorYear: false },
      { id: 'subject', label: '科目別', description: '製品・修理・部品など', needsPriorYear: false },
      { id: 'customer', label: '得意先分析', description: 'ランキング・ABC分析', needsPriorYear: false },
      { id: 'product', label: '商品分析', description: '商品別ランキング', needsPriorYear: false },
    ],
  },
  {
    title: '営業・顧客分析',
    items: [
      { id: 'lifecycle', label: '新規・離脱顧客', description: '前年同期と比べた増減・離脱', needsPriorYear: true },
      { id: 'seasonal', label: '季節指数', description: '繁忙期・閑散期の把握', needsPriorYear: false },
      { id: 'large_deals', label: '大型案件', description: '伝票単位の上位案件', needsPriorYear: false },
      { id: 'price', label: '単価分析', description: '同一商品の単価ばらつき', needsPriorYear: false },
      { id: 'heatmap', label: '担当×月ヒートマップ', description: '担当者の月次パターン', needsPriorYear: false },
      { id: 'pivot', label: '担当×科目', description: '担当者ごとの科目内訳', needsPriorYear: false },
    ],
  },
]

export function findSalesAnalysisItem(id: string): SalesAnalysisItem | null {
  for (const group of SALES_ANALYSIS_GROUPS) {
    const hit = group.items.find((item) => item.id === id)
    if (hit) return hit
  }
  return null
}
