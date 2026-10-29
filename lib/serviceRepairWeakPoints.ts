export type ServiceRepairRow = {
  branch_id: string | null
  work_date: string | null
  category: string | null
  model: string | null
  treatment_details: string | null
  remarks: string | null
}

const KANA = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'
const KANA_FW = 'ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'
const DAKU: Record<string, string> = {
  カ: 'ガ', キ: 'ギ', ク: 'グ', ケ: 'ゲ', コ: 'ゴ',
  サ: 'ザ', シ: 'ジ', ス: 'ズ', セ: 'ゼ', ソ: 'ゾ',
  タ: 'ダ', チ: 'ヂ', ツ: 'ヅ', テ: 'デ', ト: 'ド',
  ハ: 'バ', ヒ: 'ビ', フ: 'ブ', ヘ: 'ベ', ホ: 'ボ', ウ: 'ヴ',
}
const HANDAKU: Record<string, string> = { ハ: 'パ', ヒ: 'ピ', フ: 'プ', ヘ: 'ペ', ホ: 'ポ' }

const BRANCH_NAMES: Record<string, string> = {
  branch_1: '南九州',
  branch_2: '中九州',
  branch_3: '西九州',
  branch_4: '東日本',
  branch_5: '沖縄',
  branch_6: '東北',
}

export function normalizeRepairText(value: string | null | undefined) {
  let text = String(value || '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/[‐－―−]/g, '-')
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const idx = KANA.indexOf(ch)
    if (idx >= 0) {
      let kana = KANA_FW[idx]
      const next = text[i + 1]
      if (next === 'ﾞ') {
        kana = DAKU[kana] || kana
        i++
      } else if (next === 'ﾟ') {
        kana = HANDAKU[kana] || kana
        i++
      }
      out += kana
    } else {
      out += ch
    }
  }
  return out.toUpperCase()
}

export function repairFamily(row: ServiceRepairRow) {
  const category = normalizeRepairText(row.category).trim()
  const model = normalizeRepairText(row.model).trim()
  const blob = `${category} ${model}`.trim()
  if (/他社|豊国|フルタ|FURUTA/.test(blob)) return '他社'
  if (/プレハブ|冷蔵庫/.test(blob)) return '冷熱'
  if (/光合成|SGR-|SG-/.test(blob) || /^SG/.test(model)) return '光合成促進装置'
  if (/梱包|サンローダ|1500G|AT-?1500|AP-?LS/.test(blob)) return '梱包機'
  if (/たばこ|葉たばこ|CV-?ES|EC-?30|葉詰|^マイコン/.test(blob) || /^マイコン/.test(model)) return '葉たばこ乾燥機'
  if (/食品|鰹節|^SP-|^SP\d/.test(model) || /食品|鰹節/.test(category)) return '食品乾燥機'
  if (/乾燥/.test(blob) && !/暖房/.test(category) && !/たばこ/.test(blob)) return '食品乾燥機'
  if (/暖房/.test(category) || /^SK/.test(model) || /バーナ|GB-?\d|^BG-/.test(model)) return 'ハウス暖房機'
  if (/^\d{3}/.test(model) && /[KFE]/.test(model)) return 'ハウス暖房機'
  if (!model && !category) return '型式空欄'
  return '付帯機器'
}

function heaterClass(modelRaw: string | null) {
  const model = normalizeRepairText(modelRaw).trim()
  if (!model) return null
  const num = model.match(/(110|150|200|300|400|500|600|700|800)/)
  const capacity = num ? num[1] : '記載なし'
  let type = '記載不足'
  if (/KTMR/.test(model)) type = 'K'
  else if (/KTM/.test(model)) type = 'K'
  else if (/KMR/.test(model)) type = 'K'
  else if (/KM/.test(model)) type = 'K'
  else if (/KA/.test(model)) type = 'K'
  else if (/FM/.test(model)) type = 'F・FM'
  else if (/GM/.test(model)) type = 'GM'
  else if (/LT/.test(model)) type = 'L'
  else if (/(^|[^A-Z])L([^A-Z]|$)/.test(model) || /-L/.test(model)) type = 'L'
  else if ((/E/.test(model) && !/SK/.test(model)) ? /E/.test(model) : /-E|E$|E-/.test(model)) type = 'E'
  else if (/F/.test(model)) type = 'F・FM'
  else if (/K/.test(model)) type = 'K'
  else if (/バーナ|GB-/.test(model)) type = 'バーナのみ'
  return { capacity, type }
}

function countMatch(rows: ServiceRepairRow[], pattern: RegExp) {
  return rows.filter((row) => pattern.test(normalizeRepairText(`${row.treatment_details || ''} ${row.remarks || ''}`))).length
}

function monthKey(workDate: string) {
  return workDate.slice(0, 7)
}

function monthLabel(key: string) {
  const [year, month] = key.split('-')
  return `${year.slice(2)}/${Number(month)}`
}

function addMonth(key: string) {
  const [year, month] = key.split('-').map(Number)
  const next = new Date(year, month, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const FAMILY_ORDER = ['ハウス暖房機', '葉たばこ乾燥機', '梱包機', '食品乾燥機', '光合成促進装置'] as const
const FAMILY_COLORS: Record<string, string> = {
  ハウス暖房機: '#dc2626',
  葉たばこ乾燥機: '#2563eb',
  梱包機: '#0f766e',
  食品乾燥機: '#b45309',
  光合成促進装置: '#15803d',
  その他: '#64748b',
}
const SANSHU = new Set(['ハウス暖房機', '葉たばこ乾燥機', '梱包機', '食品乾燥機', '光合成促進装置', '冷熱'])
const CAPACITY_ORDER = ['110', '150', '200', '300', '400', '500', '600', '700', '800', '記載なし']
const COMBUSTION_ORDER = ['K系', 'F・FM系', 'E系', 'バーナのみ記載', 'GM系', 'L系', '記載不足']
const COMBUSTION_LABEL: Record<string, string> = {
  K: 'K系',
  'F・FM': 'F・FM系',
  E: 'E系',
  バーナのみ: 'バーナのみ記載',
  GM: 'GM系',
  L: 'L系',
  記載不足: '記載不足',
}

export function analyzeServiceRepairs(rows: ServiceRepairRow[]) {
  const familyCount: Record<string, number> = {}
  const monthHeater: Record<string, number> = {}
  const monthOther: Record<string, number> = {}
  const capacity: Record<string, number> = {}
  const combustion: Record<string, number> = {}
  const branchTotal: Record<string, number> = {}
  const branchHeater: Record<string, number> = {}
  const heaters: ServiceRepairRow[] = []
  const packers: ServiceRepairRow[] = []
  const tobacco: ServiceRepairRow[] = []
  const food: ServiceRepairRow[] = []
  const co2: ServiceRepairRow[] = []
  let dateFrom = ''
  let dateTo = ''

  for (const row of rows) {
    const family = repairFamily(row)
    familyCount[family] = (familyCount[family] || 0) + 1
    const branch = BRANCH_NAMES[row.branch_id || ''] || row.branch_id || '不明'
    branchTotal[branch] = (branchTotal[branch] || 0) + 1
    if (family === 'ハウス暖房機') branchHeater[branch] = (branchHeater[branch] || 0) + 1

    const workDate = row.work_date || ''
    if (workDate) {
      if (!dateFrom || workDate < dateFrom) dateFrom = workDate
      if (!dateTo || workDate > dateTo) dateTo = workDate
      const key = monthKey(workDate)
      if (family === 'ハウス暖房機') monthHeater[key] = (monthHeater[key] || 0) + 1
      else monthOther[key] = (monthOther[key] || 0) + 1
    }

    if (family === 'ハウス暖房機') {
      heaters.push(row)
      const classified = heaterClass(row.model)
      const cap = classified?.capacity || '記載なし'
      const type = classified?.type || '記載不足'
      capacity[cap] = (capacity[cap] || 0) + 1
      const combustionLabel = COMBUSTION_LABEL[type] || '記載不足'
      combustion[combustionLabel] = (combustion[combustionLabel] || 0) + 1
    } else if (family === '梱包機') packers.push(row)
    else if (family === '葉たばこ乾燥機') tobacco.push(row)
    else if (family === '食品乾燥機') food.push(row)
    else if (family === '光合成促進装置') co2.push(row)
  }

  const months: { label: string; heater: number; other: number }[] = []
  if (dateFrom && dateTo) {
    let cursor = monthKey(dateFrom)
    const end = monthKey(dateTo)
    while (cursor <= end) {
      months.push({
        label: monthLabel(cursor),
        heater: monthHeater[cursor] || 0,
        other: monthOther[cursor] || 0,
      })
      cursor = addMonth(cursor)
    }
  }

  const mainFamilies = FAMILY_ORDER.map((label) => ({
    label,
    count: familyCount[label] || 0,
    color: FAMILY_COLORS[label],
  }))
  const otherCount = rows.length - mainFamilies.reduce((sum, item) => sum + item.count, 0)
  const sanshuCount = rows.filter((row) => SANSHU.has(repairFamily(row))).length
  const apls = packers.filter((row) => /AP-?LS/.test(normalizeRepairText(row.model)))
  const sunloader = packers.filter((row) => /サンローダ|1500G|AT-?1500/.test(normalizeRepairText(row.model)))
  const seasonHeaters = heaters.filter((row) => {
    const date = row.work_date || ''
    return date >= '2025-10-01' && date <= '2026-02-28'
  }).length

  return {
    total: rows.length,
    dateFrom,
    dateTo,
    sanshuCount,
    sanshuRate: rows.length ? (sanshuCount / rows.length) * 100 : 0,
    families: [...mainFamilies, { label: 'その他', count: otherCount, color: FAMILY_COLORS.その他 }],
    otherBreakdown: [
      { label: '他社（フルタ・豊国）', count: familyCount['他社'] || 0 },
      { label: '型式空欄', count: familyCount['型式空欄'] || 0 },
      { label: '付帯機器', count: familyCount['付帯機器'] || 0 },
      { label: '冷熱', count: familyCount['冷熱'] || 0 },
    ],
    months,
    heaterCount: heaters.length,
    seasonHeaters,
    capacities: CAPACITY_ORDER.map((label) => ({ label, count: capacity[label] || 0 })),
    combustion: COMBUSTION_ORDER.map((label) => ({ label, count: combustion[label] || 0 })),
    heaterParts: [
      { label: 'ノズル交換', count: countMatch(heaters, /ノズル.{0,8}交換|交換.{0,6}ノズル/) },
      { label: '電極・点火棒', count: countMatch(heaters, /電極|点火棒/) },
      { label: '送風機・モータ', count: countMatch(heaters, /ファン|送風機|ブロワ|ブロア|モータ|モーター/) },
      { label: '制御基板・マイコン', count: countMatch(heaters, /マイコン|基板|制御盤|リレー|シーケンサ/) },
      { label: '炎検知', count: countMatch(heaters, /フレームアイ|炎検知|フレームロッド|CDS|紫外線|フレーム|紫外|UV管|受光/) },
      { label: '温度センサ', count: countMatch(heaters, /サーミスタ|温度センサ|センサー|センサ/) },
      { label: '電磁・オイルポンプ', count: countMatch(heaters, /電磁ポンプ|オイルポンプ|送油ポンプ|ギャポンプ|ギヤポンプ|ポンプ/) },
      { label: '点火トランス', count: countMatch(heaters, /点火トランス|イグナイタ/) },
    ],
    nozzleClean: countMatch(heaters, /ノズル.{0,6}(清掃|掃除)/),
    inspectOnly: countMatch(heaters, /^(?!.*交換).*(点検|調整|確認|清掃)/),
    packer: {
      total: packers.length,
      apls: apls.length,
      aplsBoard: countMatch(apls, /基板/),
      aplsCal: countMatch(apls, /較正|校正/),
      aplsLoad: countMatch(apls, /ロードセル/),
      sun: sunloader.length,
      sunPress: countMatch(sunloader, /加圧/),
      sunChain: countMatch(sunloader, /チェーン/),
      sunMotor: countMatch(sunloader, /モータ|モーター/),
    },
    tobacco: {
      total: tobacco.length,
      sensor: countMatch(tobacco, /センサ|サーミスタ|湿球/),
      board: countMatch(tobacco, /マイコン|基板/),
      damper: countMatch(tobacco, /ダンパ/),
    },
    food: {
      total: food.length,
      hose: countMatch(food, /ホース/),
      sensor: countMatch(food, /センサ|サーミスタ/),
      kama: countMatch(food, /カマ割|釜割/),
    },
    co2: {
      total: co2.length,
      nozzle: countMatch(co2, /ノズル.{0,8}交換|交換.{0,6}ノズル/),
      fan: countMatch(co2, /送風ファン|ファン|送風機|ブロワ|ブロア/),
    },
    branches: Object.keys(branchTotal)
      .map((name) => ({ name, total: branchTotal[name], heater: branchHeater[name] || 0 }))
      .sort((a, b) => b.total - a.total),
  }
}

export type ServiceRepairAnalysis = ReturnType<typeof analyzeServiceRepairs>
