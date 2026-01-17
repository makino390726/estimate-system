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
    estimateNumber: string[]
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
    
    // デフォルト列位置（A, B, C...形式）
    defaultColumns?: {
      productName: string
      spec: string
      quantity: string
      unitPrice: string
      amount: string
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
    estimateDate: ['AN5,AR5,AU5', 'D5', 'E5'],
    estimateNumber: ['G5', 'H5', 'F5', 'AN3', 'AR3'],
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
      productName: ['商品名', '名称', '品名', '製品名', '項目'],
      spec: ['規格', '仕様', 'スペック'],
      unit: ['単位'],
      quantity: ['数量', '数'],
      unitPrice: ['単価', '販売単価'],
      amount: ['金額', '合計', '小計'],
      costPrice: ['原価単価', '原価', '仕入単価'],
      costAmount: ['原価金額', '原価合計'],
      grossMargin: ['粗利', '粗利率', '利益率'],
      wholesalePrice: ['仕切', '仕切価格', '帰社']
    },
    
    defaultColumns: {
      productName: 'D',
      spec: 'N',
      quantity: 'X',
      unitPrice: 'AE',
      amount: 'AJ'
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
    estimateDate: ['H5,I5,J5', 'K5'],
    estimateNumber: ['F5', 'G5', 'E5', 'H3'],
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
    },
    
    defaultColumns: {
      productName: 'D',
      spec: 'N',
      quantity: 'X',
      unitPrice: 'AE',
      amount: 'AJ'
    }
  }
}

/**
 * 南九州営業所フォーマットプリセット（新フォーマット）
 */
export const MINAMIKYUSHU_PRESET: ExcelFormatPreset = {
  id: 'minamikyushu',
  name: '南九州営業所見積書フォーマット',
  description: '南九州営業所の見積書フォーマット（列位置が異なる特殊フォーマット）',
  layoutType: 'vertical',
  
  cover: {
    customerName: ['B5', 'C8', 'B8', 'D8', 'C9', 'D9'],
    subject: ['C21', 'J27', 'J26', 'J28', 'K27'],
    deliveryPlace: ['J29', 'J28', 'J30', 'K29'],
    deliveryDeadline: ['J31', 'J30', 'J32', 'K31'],
    deliveryTerms: ['J33', 'J32', 'J34', 'K33'],
    validityText: ['J35', 'J34', 'J36', 'K35'],
    paymentTerms: ['J37', 'J36', 'J38', 'K37'],
    estimateDate: ['AM5,AN5,AO5', 'L35,M35,N35', 'K35'],
    estimateNumber: ['L2', 'AN1,AO1,AS1,AV1', 'G5', 'H5', 'F5', 'I5'],
    subtotal: ['AL78', 'AL80', 'L78', 'M78'],
    taxAmount: ['AL80', 'AL82', 'L80', 'M80'],
    totalAmount: ['AL82', 'AL84', 'L82', 'M82']
  },
  
  labels: {
    subject: ['件　　　　 名', '件名', '工事名', '案件名'],
    deliveryPlace: ['受 渡 場 所', '受渡場所', '納入場所'],
    deliveryDeadline: ['受 渡 期 限', '受渡期限', '納期'],
    deliveryTerms: ['受 渡 条 件', '受渡条件', '納入条件'],
    validityText: ['有 効 期 限', '有効期限', '本書有効期限'],
    paymentTerms: ['御支払条件', '支払条件', 'お支払条件'],
    estimateDate: ['見積日', '作成日', '発行日']
  },
  
  details: {
    sheetName: ['訂正後', '当初', '明細', '見積明細', '詳細'],
    headerRow: 40,
    startRow: 41,
    maxRow: 220,
    stopWords: ['小計', '消費税', '合計', '値引'],
    
    columns: {
      productName: ['品　　　　名', '品名', '名　　　称', '名称', '商品名', '製品名'],
      spec: ['規　格　・寸　法', '規格・寸法', '規格寸法', '規格', '仕様'],
      unit: ['単位'],
      quantity: ['数　量', '数量', '数'],
      unitPrice: ['単　価', '単価', '販売単価'],
      amount: ['金　額', '金額', '合計', '小計'],
      costPrice: ['原価単価', '原価', '仕入単価'],
      costAmount: ['原価金額', '原価合計'],
      grossMargin: ['粗利', '粗利率', '利益率'],
      wholesalePrice: ['貴社仕切金額', '仕切金額', '仕切', '仕切価格']
    },
    
    defaultColumns: {
      productName: 'A',
      spec: 'L',
      quantity: 'W',
      unitPrice: 'AE',
      amount: 'AJ'
    }
  },
  
  sections: {
    sheetName: '目次',
    nameColumn: 'C',
    startRow: 9
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
    estimateDate: ['AN5,AR5,AU5', 'K5'],
    estimateNumber: ['G5', 'H5', 'F5', 'AN3'],
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
    },
    
    defaultColumns: {
      productName: 'D',
      spec: 'N',
      quantity: 'X',
      unitPrice: 'AE',
      amount: 'AJ'
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
    estimateDate: ['F5,G5,H5'],
    estimateNumber: ['F3', 'G3', 'H3', 'E5'],
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
    },
    
    defaultColumns: {
      productName: 'B',
      spec: 'C',
      quantity: 'D',
      unitPrice: 'E',
      amount: 'F'
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
  const normalize = (s: string) => String(s ?? '').replace(/\u3000/g, '').replace(/\s+/g, '').trim()

  // 表紙・目次・明細シートがあれば縦見積フォーマット
  const hasCover = sheetNames.some((n: string) => n.includes('表紙'))
  const hasIndex = sheetNames.some((n: string) => n.includes('目次'))
  const hasDetails = sheetNames.some((n: string) => n.includes('明細'))
  
  // ★Row40でヘッダーを探して南九州フォーマットを判定（新基準）
  const sheet = workbook.Sheets[sheetNames[0]]
  if (sheet) {
    const a40 = normalize(sheet['A40']?.v || '')
    const l40 = normalize(sheet['L40']?.v || '')
    const w40 = normalize(sheet['W40']?.v || '')
    const aa40 = normalize(sheet['AA40']?.v || '')
    const ad40 = normalize(sheet['AD40']?.v || '')
    
    // Row40: 品名(A40), 規格・寸法(L40), 数量(W40), 単位(AA40), 単価(AD40)
    if ((a40.includes('品名') || a40.includes('品')) && 
        (l40.includes('規格') || l40.includes('寸法')) && 
        (w40.includes('数量') || w40.includes('数'))) {
      console.log('[Preset Detection] 南九州営業所フォーマットを検出（Row40: A=品名, L=規格, W=数量）')
      return MINAMIKYUSHU_PRESET
    }
  }
  
  if (hasCover && hasDetails) {
    // 明細シート候補の中から実体を取得
    const detailName = sheetNames.find((n: string) => normalize(n).includes('明細') || normalize(n).includes('見積明細') || normalize(n).includes('詳細'))
    const detailsSheet = detailName ? workbook.Sheets[detailName] : undefined
    if (detailsSheet) {
      // Row2にヘッダーがある = 南九州営業所フォーマット（正規化して判定）
      const b2 = normalize(detailsSheet['B2']?.v || '')
      const i2 = normalize(detailsSheet['I2']?.v || '')
      if (b2.includes('名称') || i2.includes('貴社仕切') || i2.includes('仕切金額')) {
        console.log('[Preset Detection] 南九州営業所フォーマットを検出（Row2ヘッダー, 正規化一致）')
        return MINAMIKYUSHU_PRESET
      }

      // Row40にヘッダーがある = 標準縦見積書フォーマット
      const b40 = normalize(detailsSheet['B40']?.v || '')
      if (b40.includes('品名') || b40.includes('商品名')) {
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
