/**
 * Excelフォーマットプリセット定義
 * 
 * 異なるフォーマットのExcelファイルを統一的に扱うための設定ファイル
 * 既存の取り込み設定は維持しつつ、新しいフォーマットに対応
 */

export type ExcelFormatPreset = {
  id: string
  name: string
  description: string
  layoutType: 'vertical' | 'horizontal'
  
  // 表紙シートのセル位置設定
  cover: {
    customerName: string[]  // 候補セル位置（優先順）
    subject: string[]
    deliveryPlace: string[]
    deliveryDeadline: string[]
    deliveryTerms: string[]
    validityText: string[]
    paymentTerms: string[]
    estimateDate: string[]
    subtotal: string[]
    taxAmount: string[]
    totalAmount: string[]
  }
  
  // ラベルキーワード設定（動的検索用）
  labels: {
    subject: string[]
    deliveryPlace: string[]
    deliveryDeadline: string[]
    deliveryTerms: string[]
    validityText: string[]
    paymentTerms: string[]
    estimateDate: string[]
  }
  
  // 明細シート設定
  details: {
    sheetName: string | string[]  // シート名（複数候補可）
    headerRow: number             // ヘッダー行番号
    startRow: number              // データ開始行
    maxRow: number                // 最大行数
    stopWords: string[]           // 終了判定キーワード
    
    // 明細列のヘッダーキーワード
    columns: {
      productName: string[]
      spec: string[]
      unit: string[]
      quantity: string[]
      unitPrice: string[]
      amount: string[]
      costPrice?: string[]
      costAmount?: string[]
      grossMargin?: string[]
      wholesalePrice?: string[]
    }
  }
  
  // セクション設定（目次シートなど）
  sections?: {
    sheetName: string
    nameColumn: string
    startRow: number
  }
}

/**
 * デフォルトプリセット（現在の標準フォーマット）
 */
export const DEFAULT_PRESET: ExcelFormatPreset = {
  id: 'default',
  name: '標準縦見積書フォーマット',
  description: '現在の標準的な縦見積書フォーマット（表紙・目次・明細シート分割型）',
  layoutType: 'vertical',
  
  cover: {
    customerName: ['D8', 'C8', 'D10', 'C10', 'E8'],
    subject: ['C21', 'D21', 'C22', 'D22', 'K27', 'D27'],
    deliveryPlace: ['C23', 'D23', 'K29', 'D29', 'C29'],
    deliveryDeadline: ['C25', 'D25', 'K31', 'D31', 'C31'],
    deliveryTerms: ['C27', 'D27', 'K33', 'D33', 'C33'],
    validityText: ['C29', 'D29', 'K35', 'D35', 'C35'],
    paymentTerms: ['C31', 'D31', 'K37', 'D37', 'C37'],
    estimateDate: ['AN5', 'AR5', 'AU5', 'D5', 'E5'],
    subtotal: ['AJ78', 'AK78', 'AL78', 'K70', 'L70'],
    taxAmount: ['AJ80', 'AK80', 'AL80', 'K72', 'L72'],
    totalAmount: ['AJ82', 'AK82', 'AL82', 'K74', 'L74']
  },
  
  labels: {
    subject: ['件名', '工事名', '案件名', '品名'],
    deliveryPlace: ['受渡場所', '納入場所', '納品場所', '受け渡し場所'],
    deliveryDeadline: ['受渡期限', '納期', '納入期限', '受け渡し期限'],
    deliveryTerms: ['受渡条件', '納入条件', '受け渡し条件'],
    validityText: ['有効期限', '本書有効期限', '見積有効期限'],
    paymentTerms: ['御支払条件', '支払条件', 'お支払条件', '支払い条件'],
    estimateDate: ['見積日', '作成日', '発行日', '日付']
  },
  
  details: {
    sheetName: ['明細', '見積明細', '詳細'],
    headerRow: 40,
    startRow: 41,
    maxRow: 220,
    stopWords: ['小計', '消費税', '合計', '値引'],
    
    columns: {
      productName: ['品名', '商品名', '製品名', '項目'],
      spec: ['規格', '仕様', 'スペック'],
      unit: ['単位'],
      quantity: ['数量', '数'],
      unitPrice: ['単価', '販売単価'],
      amount: ['金額', '合計', '小計'],
      costPrice: ['原価単価', '原価', '仕入単価'],
      costAmount: ['原価金額', '原価合計'],
      grossMargin: ['粗利', '粗利率', '利益率'],
      wholesalePrice: ['仕切', '仕切価格', '帰社']
    }
  },
  
  sections: {
    sheetName: '目次',
    nameColumn: 'C',
    startRow: 9
  }
}

/**
 * 単一シート縦見積書プリセット（南九州営業所など）
 */
export const SINGLE_SHEET_VERTICAL_PRESET: ExcelFormatPreset = {
  id: 'single_vertical',
  name: '単一シート縦見積書',
  description: '表紙と明細が1つのシートに含まれる縦見積書フォーマット',
  layoutType: 'vertical',
  
  cover: {
    customerName: ['A6', 'B6', 'C6', 'D6', 'E6'],
    subject: ['B15', 'A15', 'C15', 'D15'],
    deliveryPlace: ['B18', 'A18', 'C18'],
    deliveryDeadline: ['B20', 'A20', 'C20'],
    deliveryTerms: ['B22', 'A22', 'C22'],
    validityText: ['B24', 'A24', 'C24'],
    paymentTerms: ['B28', 'A28', 'C28'],
    estimateDate: ['H5', 'I5', 'J5', 'K5'],
    subtotal: ['B31', 'I49', 'H49', 'I50'],
    taxAmount: ['I50', 'I51', 'H51'],
    totalAmount: ['B31', 'I51', 'H51']
  },
  
  labels: {
    subject: ['件名', '工事名', '案件名'],
    deliveryPlace: ['受渡場所', '納入場所', '納品場所'],
    deliveryDeadline: ['受渡期限', '納期', '納入期限'],
    deliveryTerms: ['受渡条件', '納入条件'],
    validityText: ['有効期限', '本書有効期限'],
    paymentTerms: ['御支払条件', '支払条件'],
    estimateDate: ['見積日', '作成日', '発行日']
  },
  
  details: {
    sheetName: ['Sheet1', '見積書', '明細', '自動巻上'],  // 任意のシート名に対応
    headerRow: 34,  // Row34にヘッダー
    startRow: 35,   // Row35からデータ開始
    maxRow: 200,
    stopWords: ['小計', '消費税', '合計', '値引', '※', '注記'],
    
    columns: {
      productName: ['品名', '品　　　　　　名', '商品名', '製品名', '項目'],
      spec: ['規格', '規　　格　　寸　　法', '仕様', 'スペック'],
      unit: ['単位'],
      quantity: ['数量', '数'],
      unitPrice: ['単価', '販売単価'],
      amount: ['金額', '価格', '価　格', '合計', '小計'],
      costPrice: ['原価単価', '原価', '仕入単価', '今回仕入'],
      costAmount: ['原価金額', '原価合計'],
      grossMargin: ['粗利', '粗利率', '利益率'],
      wholesalePrice: ['仕切金額', '仕切', '仕切価格']
    }
  }
}

/**
 * 南九州営業所フォーマットプリセット（新フォーマット）
 */
export const MINAMIKYUSHU_PRESET: ExcelFormatPreset = {
  id: 'minamikyushu',
  name: '南九州営業所フォーマット',
  description: '貴社仕切金額列を含む新フォーマット（表紙・目次・明細シート分割型）',
  layoutType: 'vertical',
  
  cover: {
    customerName: ['B5', 'C5', 'D5', 'B7'],
    subject: ['C21', 'D21', 'B21'],
    deliveryPlace: ['C23', 'D23', 'B23'],
    deliveryDeadline: ['C25', 'D25', 'B25'],
    deliveryTerms: ['C27', 'D27', 'B27'],
    validityText: ['C29', 'D29', 'B29'],
    paymentTerms: ['C31', 'D31', 'B31'],
    estimateDate: ['K7', 'L7', 'M7', 'K5'],
    subtotal: ['H19', 'I19', 'H21', 'I21'],
    taxAmount: ['H20', 'I20', 'H22', 'I22'],
    totalAmount: ['C10', 'H21', 'I21', 'H23']
  },
  
  labels: {
    subject: ['件名', '工事名', '案件名', '品名'],
    deliveryPlace: ['受渡場所', '納入場所', '納品場所', '受け渡し場所'],
    deliveryDeadline: ['受渡期限', '納期', '納入期限', '受け渡し期限'],
    deliveryTerms: ['受渡条件', '納入条件', '受け渡し条件'],
    validityText: ['有効期限', '本書有効期限', '見積有効期限'],
    paymentTerms: ['御支払条件', '支払条件', 'お支払条件', '支払い条件'],
    estimateDate: ['見積日', '作成日', '発行日', '日付']
  },
  
  details: {
    sheetName: ['明細', '見積明細', '詳細'],
    headerRow: 2,
    startRow: 3,
    maxRow: 200,
    stopWords: ['小計', '消費税', '合計', '値引', '諸経費', '出精値引'],
    
    columns: {
      productName: ['名　　　称', '品名', '商品名', '製品名', '項目'],
      spec: ['規格・寸法', '規格', '仕様', 'スペック'],
      unit: ['単位'],
      quantity: ['数量', '数'],
      unitPrice: ['単  価', '単価', '販売単価'],
      amount: ['金  額', '金額', '合計', '小計'],
      costPrice: ['原価単価', '原価', '仕入単価'],
      costAmount: ['原価金額', '原価合計'],
      grossMargin: ['粗利', '粗利率', '利益率'],
      wholesalePrice: ['貴社仕切金額', '仕切金額', '仕切', '仕切価格']
    }
  },
  
  sections: {
    sheetName: '目次',
    nameColumn: 'B',
    startRow: 4
  }
}

/**
 * 横見積書プリセット
 */
export const HORIZONTAL_PRESET: ExcelFormatPreset = {
  id: 'horizontal',
  name: '横見積書フォーマット',
  description: '単一シート型の横見積書フォーマット',
  layoutType: 'horizontal',
  
  cover: {
    customerName: ['D8', 'C8', 'E8', 'D10'],
    subject: ['K27', 'K25', 'L27', 'K21'],
    deliveryPlace: ['K29', 'K27', 'L29', 'K23'],
    deliveryDeadline: ['K31', 'K29', 'L31', 'K25'],
    deliveryTerms: ['K33', 'K31', 'L33', 'K27'],
    validityText: ['K35', 'K33', 'L35', 'K29'],
    paymentTerms: ['K37', 'K35', 'L37', 'K31'],
    estimateDate: ['AN5', 'AR5', 'AU5', 'K5'],
    subtotal: ['AJ78', 'K70', 'L70', 'M70'],
    taxAmount: ['AJ80', 'K72', 'L72', 'M72'],
    totalAmount: ['AJ82', 'K74', 'L74', 'M74']
  },
  
  labels: {
    subject: ['件名', '工事名', '案件名', '品名'],
    deliveryPlace: ['受渡場所', '納入場所', '納品場所'],
    deliveryDeadline: ['受渡期限', '納期', '納入期限'],
    deliveryTerms: ['受渡条件', '納入条件'],
    validityText: ['有効期限', '本書有効期限'],
    paymentTerms: ['御支払条件', '支払条件'],
    estimateDate: ['見積日', '作成日', '発行日']
  },
  
  details: {
    sheetName: ['Sheet1', '見積書', '明細'],
    headerRow: 15,
    startRow: 16,
    maxRow: 100,
    stopWords: ['小計', '消費税', '合計'],
    
    columns: {
      productName: ['品名', '商品名', '製品名'],
      spec: ['規格', '仕様'],
      unit: ['単位'],
      quantity: ['数量'],
      unitPrice: ['単価'],
      amount: ['金額'],
      costPrice: ['原価単価', '原価'],
      costAmount: ['原価金額'],
      grossMargin: ['粗利率'],
      wholesalePrice: ['仕切価格']
    }
  }
}

/**
 * 簡易フォーマットプリセット（シンプルな見積書用）
 */
export const SIMPLE_PRESET: ExcelFormatPreset = {
  id: 'simple',
  name: 'シンプル見積書',
  description: '簡易的な見積書フォーマット（最小限の項目）',
  layoutType: 'vertical',
  
  cover: {
    customerName: ['B5', 'C5', 'D5', 'B6', 'C6'],
    subject: ['B10', 'C10', 'D10', 'B8', 'C8'],
    deliveryPlace: ['B12', 'C12', 'D12'],
    deliveryDeadline: ['B14', 'C14', 'D14'],
    deliveryTerms: ['B16', 'C16', 'D16'],
    validityText: ['B18', 'C18', 'D18'],
    paymentTerms: ['B20', 'C20', 'D20'],
    estimateDate: ['F5', 'G5', 'H5'],
    subtotal: ['G50', 'H50', 'I50'],
    taxAmount: ['G52', 'H52', 'I52'],
    totalAmount: ['G54', 'H54', 'I54']
  },
  
  labels: {
    subject: ['件名', '工事名', '品名'],
    deliveryPlace: ['納入場所', '場所'],
    deliveryDeadline: ['納期', '期限'],
    deliveryTerms: ['納入条件', '条件'],
    validityText: ['有効期限'],
    paymentTerms: ['支払条件'],
    estimateDate: ['見積日', '日付']
  },
  
  details: {
    sheetName: ['Sheet1', '明細', '見積'],
    headerRow: 25,
    startRow: 26,
    maxRow: 150,
    stopWords: ['小計', '合計', '総合計'],
    
    columns: {
      productName: ['品名', '項目'],
      spec: ['規格', '仕様', '備考'],
      unit: ['単位'],
      quantity: ['数量'],
      unitPrice: ['単価'],
      amount: ['金額', '合計']
    }
  }
}

/**
 * 全プリセット一覧
 */
export const ALL_PRESETS: ExcelFormatPreset[] = [
  DEFAULT_PRESET,
  SINGLE_SHEET_VERTICAL_PRESET,
  MINAMIKYUSHU_PRESET,
  HORIZONTAL_PRESET,
  SIMPLE_PRESET
]

/**
 * プリセットIDから取得
 */
export function getPresetById(id: string): ExcelFormatPreset | undefined {
  return ALL_PRESETS.find(p => p.id === id)
}

/**
 * プリセット名から取得
 */
export function getPresetByName(name: string): ExcelFormatPreset | undefined {
  return ALL_PRESETS.find(p => p.name === name)
}

/**
 * 自動判定用：シート構造からプリセットを推測
 */
export function detectPreset(workbook: any): ExcelFormatPreset {
  const sheetNames = workbook.SheetNames || []
  
  // 表紙・目次・明細シートがあれば縦見積フォーマット
  const hasCover = sheetNames.some((n: string) => n.includes('表紙'))
  const hasIndex = sheetNames.some((n: string) => n.includes('目次'))
  const hasDetails = sheetNames.some((n: string) => n.includes('明細'))
  
  if (hasCover && hasDetails) {
    // 明細シートのヘッダーで判定
    const detailsSheet = workbook.Sheets['明細']
    if (detailsSheet) {
      // Row2にヘッダーがある = 南九州営業所フォーマット
      const headerRow2 = detailsSheet['B2']?.v || ''
      if (headerRow2.includes('名　　　称') || detailsSheet['I2']?.v?.includes('貴社仕切')) {
        console.log('[Preset Detection] 南九州営業所フォーマットを検出（Row2ヘッダー）')
        return MINAMIKYUSHU_PRESET
      }
      
      // Row40にヘッダーがある = 標準縦見積書フォーマット
      const headerRow40 = detailsSheet['B40']?.v || ''
      if (headerRow40.includes('品名') || headerRow40.includes('商品名')) {
        console.log('[Preset Detection] 標準縦見積書フォーマットを検出（Row40ヘッダー）')
        return DEFAULT_PRESET
      }
    }
    
    // デフォルトは標準フォーマット
    console.log('[Preset Detection] 標準縦見積書フォーマットを使用（デフォルト）')
    return DEFAULT_PRESET
  }
  
  // 単一シートの場合、Row30-50でヘッダーを探索して判定
  if (sheetNames.length === 1) {
    const firstSheet = workbook.Sheets[sheetNames[0]]
    if (firstSheet) {
      // Row34付近にヘッダーがあるか確認
      for (let r = 30; r <= 45; r++) {
        const cellA = firstSheet[`A${r}`]?.v || ''
        const cellB = firstSheet[`B${r}`]?.v || ''
        const cellC = firstSheet[`C${r}`]?.v || ''
        const cellF = firstSheet[`F${r}`]?.v || ''
        const cellG = firstSheet[`G${r}`]?.v || ''
        const cellH = firstSheet[`H${r}`]?.v || ''
        const cellI = firstSheet[`I${r}`]?.v || ''
        
        // 「品名」「数量」「単価」「金額」などがあれば単一シート縦見積
        const hasProductCol = cellA.includes('品')
        const hasQtyCol = cellF.includes('数') || cellG.includes('単位') || cellH.includes('単価')
        const hasPriceCol = cellH.includes('単価') || cellI.includes('価格')
        
        if (hasProductCol && hasQtyCol && hasPriceCol) {
          console.log(`[Preset Detection] 単一シート縦見積書フォーマットを検出（Row${r}にヘッダー）`)
          return SINGLE_SHEET_VERTICAL_PRESET
        }
      }
    }
    
    // ヘッダーが見つからない場合は横見積の可能性
    console.log('[Preset Detection] 横見積書フォーマットを検出（単一シート）')
    return HORIZONTAL_PRESET
  }
  
  // デフォルトにフォールバック
  console.log('[Preset Detection] デフォルトプリセットを使用')
  return DEFAULT_PRESET
}
