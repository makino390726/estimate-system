import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { pdfToPng } from 'pdf-to-png-converter'
import PDFParser from 'pdf2json'

export const runtime = 'nodejs'

type ExtractedWarranty = {
    customer_name: string | null
    postal_code: string | null
    address: string | null
    phone: string | null
    mobile: string | null
    product_name: string | null
    model_no_full: string | null
    manufacturing_no: string | null
    slip_no: string | null
    purchase_date: string | null
    dealer_name: string | null
    staff_name: string | null
}

const countFilledFields = (data: ExtractedWarranty) => {
    const values = Object.values(data)
    return values.filter((v) => String(v || '').trim().length > 0).length
}

const clean = (v: string | null | undefined) => {
    const s = String(v || '').trim()
    return s.length > 0 ? s : null
}

const parseJsonObjectText = (text: string) => {
    const trimmed = text.trim()
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const payload = fenced?.[1] || trimmed
    return JSON.parse(payload)
}

const joinUniqueWarnings = (...warnings: Array<string | null | undefined>) => {
    const seen = new Set<string>()
    const items: string[] = []
    for (const warning of warnings) {
        const text = String(warning || '').trim()
        if (!text || seen.has(text)) continue
        seen.add(text)
        items.push(text)
    }
    return items.join(' ')
}

const GEMINI_MODEL_CANDIDATES = [
    process.env.GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b-latest',
    'gemini-1.5-pro-latest',
].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)

const listGeminiGenerateModels = async (apiKey: string) => {
    const response = await withTimeout(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`),
        10000,
        'Gemini listModels'
    )
    if (!response.ok) {
        throw new Error(`listModels HTTP ${response.status}`)
    }

    const json = await response.json() as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
    }

    return (json.models || [])
        .filter((model) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
        .map((model) => String(model.name || '').replace(/^models\//, ''))
        .filter(Boolean)
}

const generateGeminiJson = async (
    apiKey: string,
    parts: Array<string | { inlineData: { mimeType: string; data: string } }>,
    timeoutMs: number,
    label: string
) => {
    const genAI = new GoogleGenerativeAI(apiKey)
    let lastError: Error | null = null
    let modelCandidates = GEMINI_MODEL_CANDIDATES

    try {
        const availableModels = await listGeminiGenerateModels(apiKey)
        const preferred = GEMINI_MODEL_CANDIDATES.filter((name) => availableModels.includes(name))
        const others = availableModels.filter((name) => !preferred.includes(name))
        modelCandidates = [...preferred, ...others]
    } catch (error: any) {
        lastError = new Error(`listModels: ${error?.message || 'unknown error'}`)
    }

    for (const modelName of modelCandidates) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName })
            const result = await withTimeout(model.generateContent(parts), timeoutMs, `${label}:${modelName}`)
            const response = await result.response
            const text = response.text()
            if (!text?.trim()) {
                throw new Error(`Gemini response content is empty (${modelName})`)
            }
            return parseJsonObjectText(text)
        } catch (error: any) {
            lastError = new Error(`${modelName}: ${error?.message || 'unknown error'}`)
        }
    }

    throw lastError || new Error(`Gemini request failed. candidates=${modelCandidates.join(', ')}`)
}

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out (${ms}ms)`)), ms)
    })
    try {
        return await Promise.race([promise, timeoutPromise])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

const cloneBytes = (input: ArrayBuffer | Uint8Array) => {
    const src = input instanceof Uint8Array ? input : new Uint8Array(input)
    return new Uint8Array(src)
}

const toIsoDate = (raw: string | null) => {
    if (!raw) return null
    const text = raw.replace(/[\s　]/g, '')
    const m = text.match(/(\d{2,4})[年\/.\-](\d{1,2})[月\/.\-](\d{1,2})日?/)
    if (!m) return null
    let year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    if (year < 100) year += 2000
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const extractByLabel = (text: string, labels: string[]) => {
    const escaped = labels.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`(?:${escaped.join('|')})\\s*[：:]?\\s*([^\\n]{1,80})`, 'i')
    const m = text.match(pattern)
    return clean(m?.[1])
}

const extractAllPhones = (text: string) => {
    const ms = text.match(/0\d{1,4}-\d{1,4}-\d{3,4}/g) || []
    return ms.map((v) => v.trim()).filter(Boolean)
}

const extractPostalCode = (text: string) => {
    const m = text.match(/(?:〒\s*)?(\d{3})[-ー](\d{4})/)
    if (!m) return null
    return `${m[1]}-${m[2]}`
}

const extractProductName = (text: string) => {
    const candidates = ['ハウス暖房機', '暖房機', '光合成促進装置', '食品乾燥機', 'ソーメン乾燥機', '薬草乾燥機', '干し芋乾燥機', 'たばこ乾燥機', '冷熱機器']
    for (const c of candidates) {
        if (text.includes(c)) return c
    }
    return extractByLabel(text, ['製品名'])
}

const extractTextByOcr = async (pngBytes: Uint8Array, timeoutMs = 15000) => {
    try {
        const tesseract = await import('tesseract.js')
        const result = await withTimeout(
            tesseract.recognize(Buffer.from(pngBytes), 'jpn+eng'),
            timeoutMs,
            'OCR'
        )
        return String(result?.data?.text || '').trim()
    } catch (error) {
        console.warn('[Extract Warranty PDF] OCR failed:', (error as any)?.message)
        return ''
    }
}

const extractTextByPaddleOcr = async (pngBytes: Uint8Array, timeoutMs = 12000) => {
    const endpoint = process.env.PADDLE_OCR_URL || 'http://127.0.0.1:8001/ocr'
    const form = new FormData()
    const bytes = new Uint8Array(pngBytes.length)
    bytes.set(pngBytes)
    const file = new Blob([bytes.buffer], { type: 'image/png' })
    form.append('file', file, 'page1.png')

    const response = await withTimeout(
        fetch(endpoint, {
            method: 'POST',
            body: form,
        }),
        timeoutMs,
        'PaddleOCR'
    )

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`PaddleOCR HTTP ${response.status}: ${body.slice(0, 200)}`)
    }

    const json = await response.json()
    const fullText = typeof json?.fullText === 'string' ? json.fullText : ''
    if (fullText.trim()) return fullText.trim()

    const lines = Array.isArray(json?.lines) ? json.lines : []
    const text = lines.map((line: unknown) => String(line || '').trim()).filter(Boolean).join('\n')
    return text
}

const normalizeOpenAiPayload = (raw: any): ExtractedWarranty => {
    if (!raw || typeof raw !== 'object') {
        return {
            customer_name: null,
            postal_code: null,
            address: null,
            phone: null,
            mobile: null,
            product_name: null,
            model_no_full: null,
            manufacturing_no: null,
            slip_no: null,
            purchase_date: null,
            dealer_name: null,
            staff_name: null,
        }
    }

    return {
        customer_name: clean(raw.customer_name),
        postal_code: clean(raw.postal_code),
        address: clean(raw.address),
        phone: clean(raw.phone),
        mobile: clean(raw.mobile),
        product_name: clean(raw.product_name),
        model_no_full: clean(raw.model_no_full),
        manufacturing_no: clean(raw.manufacturing_no),
        slip_no: clean(raw.slip_no),
        purchase_date: toIsoDate(clean(raw.purchase_date)) || clean(raw.purchase_date),
        dealer_name: clean(raw.dealer_name),
        staff_name: clean(raw.staff_name),
    }
}

const extractWithOpenAi = async (base64Image: string, apiKey: string): Promise<ExtractedWarranty> => {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const prompt = [
        'この画像は製品保証書（保証カード）です。手書き文字も含めて読み取り、JSONのみ返してください。',
        'キーは次のみ: customer_name, postal_code, address, phone, mobile, product_name, model_no_full, manufacturing_no, slip_no, purchase_date, dealer_name, staff_name',
        '読めない値は null。purchase_date は可能なら YYYY-MM-DD。コードブロックは禁止。',
    ].join(' ')

    const body = {
        model,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } },
                ],
            },
        ],
        temperature: 0,
    }

    const response = await withTimeout(
        fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        }),
        12000,
        'OpenAI'
    )

    const json = await response.json()
    if (!response.ok) {
        throw new Error(json?.error?.message || 'OpenAI API error')
    }

    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error('OpenAI response content is empty')
    }

    const parsed = parseJsonObjectText(content)
    return normalizeOpenAiPayload(parsed)
}

const extractWithGemini = async (base64Image: string, apiKey: string): Promise<ExtractedWarranty> => {
    const prompt = [
        'この画像は製品保証書（保証カード）です。手書き文字も含めて読み取り、JSONのみ返してください。',
        'キーは次のみ: customer_name, postal_code, address, phone, mobile, product_name, model_no_full, manufacturing_no, slip_no, purchase_date, dealer_name, staff_name',
        '読めない値は null。purchase_date は可能なら YYYY-MM-DD。コードブロックは禁止。',
    ].join(' ')

    const parsed = await generateGeminiJson(
        apiKey,
        [
            prompt,
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Image,
                },
            },
        ],
        20000,
        'Gemini'
    )

    return normalizeOpenAiPayload(parsed)
}

// ─── 領域ベースOCR ────────────────────────────────────────────────────────────

type FieldAreaMapping = {
    fieldType: string
    area: { x1: number; y1: number; x2: number; y2: number }
}

type PreparedRegionCrop = {
    fieldType: string
    label: string
    pngBytes: Uint8Array
    base64Image: string
}

type RegionExtractionResult = {
    extracted: ExtractedWarranty
    source: 'region-openai' | 'region-gemini' | 'region-ocr'
    warning?: string
}

const REGION_FIELD_LABELS: Record<string, string> = {
    customer_name: 'お客様名',
    postal_code: '郵便番号',
    address: '住所',
    phone: '電話番号（固定）',
    mobile: '携帯電話',
    product_name: '製品名',
    model_no_full: '型式番号',
    manufacturing_no: '製造番号',
    slip_no: '伝票番号',
    purchase_date: '購入年月日',
    dealer_name: '販売店名',
    staff_name: '担当者名',
}

const getFieldSpecificInstruction = (fieldType: string) => {
    switch (fieldType) {
        case 'customer_name':
            return '日本語の氏名または会社名。敬称や余計な記号は除外。読めなければ null。'
        case 'postal_code':
            return '郵便番号。可能なら 123-4567 形式で返す。数字が不明瞭なら null。'
        case 'address':
            return '住所全文。都道府県、市区町村、番地、建物名をそのまま返す。'
        case 'phone':
        case 'mobile':
            return '電話番号。ハイフンを維持し、読めない桁がある場合は null。'
        case 'product_name':
            return '製品名。印字欄の正式名称を優先。'
        case 'model_no_full':
            return '型式番号。英数字とハイフンを厳密に返す。似た文字の推測はしない。'
        case 'manufacturing_no':
        case 'slip_no':
            return '番号欄。英数字とハイフンを厳密に返す。読めない場合は null。'
        case 'purchase_date':
            return '購入年月日。可能なら YYYY-MM-DD、無理なら元の表記。'
        case 'dealer_name':
            return '販売店名。社名・屋号をそのまま返す。'
        case 'staff_name':
            return '担当者名。氏名をそのまま返す。'
        default:
            return '欄の文字だけを返す。読めない場合は null。'
    }
}

const extractMappedRegionsWithOpenAi = async (
    crops: PreparedRegionCrop[],
    apiKey: string
): Promise<ExtractedWarranty> => {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
        {
            type: 'text',
            text: [
                '以下は保証書の各入力欄を個別に切り出した画像です。',
                '手書き日本語を優先して読み取り、JSONのみ返してください。',
                'キーは customer_name, postal_code, address, phone, mobile, product_name, model_no_full, manufacturing_no, slip_no, purchase_date, dealer_name, staff_name のみ。',
                '不明な値は null。推測補完しない。コードブロック禁止。',
            ].join(' '),
        },
    ]

    for (const crop of crops) {
        content.push({
            type: 'text',
            text: `field=${crop.fieldType} label=${crop.label}. ${getFieldSpecificInstruction(crop.fieldType)}`,
        })
        content.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${crop.base64Image}` },
        })
    }

    const response = await withTimeout(
        fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content }],
                temperature: 0,
            }),
        }),
        30000,
        'OpenAI region vision'
    )

    const json = await response.json()
    if (!response.ok) {
        throw new Error(json?.error?.message || 'OpenAI region vision error')
    }

    const raw = json?.choices?.[0]?.message?.content
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error('OpenAI region vision response is empty')
    }

    return normalizeOpenAiPayload(parseJsonObjectText(raw))
}

const extractMappedRegionsWithGemini = async (
    crops: PreparedRegionCrop[],
    apiKey: string
): Promise<ExtractedWarranty> => {
    const prompt = [
        '以下は保証書の各入力欄を個別に切り出した画像です。',
        '手書き日本語を優先して読み取り、JSONのみ返してください。',
        'キーは customer_name, postal_code, address, phone, mobile, product_name, model_no_full, manufacturing_no, slip_no, purchase_date, dealer_name, staff_name のみ。',
        '不明な値は null。推測補完しない。コードブロック禁止。',
    ].join(' ')

    const parts: Array<string | { inlineData: { mimeType: string; data: string } }> = [prompt]
    for (const crop of crops) {
        parts.push(`field=${crop.fieldType} label=${crop.label}. ${getFieldSpecificInstruction(crop.fieldType)}`)
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: crop.base64Image,
            },
        })
    }

    const parsed = await generateGeminiJson(
        apiKey,
        parts,
        30000,
        'Gemini region vision'
    )

    return normalizeOpenAiPayload(parsed)
}

/**
 * 保存されたマッピング（正規化座標 0-1）を使い、各フィールドの矩形領域のみをOCRして抽出する。
 * PaddleOCR/OpenAI より高精度（定型書式向け）。
 */
const extractByRegions = async (
    pngBuffer: Buffer,
    fieldMappings: FieldAreaMapping[],
    openAiKey?: string | null,
    geminiKey?: string | null
): Promise<RegionExtractionResult> => {
    const sharpLib = (await import('sharp')).default
    const metadata = await sharpLib(pngBuffer).metadata()
    const pngWidth = metadata.width ?? 1
    const pngHeight = metadata.height ?? 1

    const result: Partial<Record<string, string | null>> = {}
    const preparedCrops: PreparedRegionCrop[] = []
    let paddleAvailable = true
    let openAiRegionWarning = ''

    for (const mapping of fieldMappings) {
        const { area, fieldType } = mapping
        const baseX1 = Math.max(0, Math.floor(area.x1 * pngWidth))
        const baseY1 = Math.max(0, Math.floor(area.y1 * pngHeight))
        const baseX2 = Math.min(pngWidth, Math.ceil(area.x2 * pngWidth))
        const baseY2 = Math.min(pngHeight, Math.ceil(area.y2 * pngHeight))
        const baseCropW = Math.max(1, baseX2 - baseX1)
        const baseCropH = Math.max(1, baseY2 - baseY1)

        // ユーザーが文字ぴったりに指定しがちなので、OCR用には余白を広げる
        const padX = Math.max(18, Math.round(baseCropW * 0.18))
        const padY = Math.max(12, Math.round(baseCropH * 0.28))
        const x1 = Math.max(0, baseX1 - padX)
        const y1 = Math.max(0, baseY1 - padY)
        const x2 = Math.min(pngWidth, baseX2 + padX)
        const y2 = Math.min(pngHeight, baseY2 + padY)
        const cropW = Math.max(1, x2 - x1)
        const cropH = Math.max(1, y2 - y1)

        if (cropW < 5 || cropH < 5) continue

        try {
            // 切り抜き後に前処理してOCRしやすい画像へ寄せる
            const cropBuffer = await sharpLib(pngBuffer)
                .extract({ left: x1, top: y1, width: cropW, height: cropH })
                .grayscale()
                .normalize()
                .resize(Math.max(cropW, 900), null, { kernel: 'cubic' })
                .sharpen()
                .png()
                .toBuffer()

            preparedCrops.push({
                fieldType,
                label: REGION_FIELD_LABELS[fieldType] || fieldType,
                pngBytes: new Uint8Array(cropBuffer),
                base64Image: Buffer.from(cropBuffer).toString('base64'),
            })

            result[fieldType] = null

        } catch (e: any) {
            console.warn(`[Region OCR] fieldType=${fieldType} prepare failed:`, e?.message)
            result[fieldType] = null
        }
    }

    if (openAiKey && preparedCrops.length > 0) {
        try {
            const extracted = await extractMappedRegionsWithOpenAi(preparedCrops, openAiKey)
            if (countFilledFields(extracted) >= 3) {
                return {
                    extracted: {
                        ...extracted,
                        postal_code: extractPostalCode(extracted.postal_code ?? '') ?? extracted.postal_code,
                        purchase_date: toIsoDate(extracted.purchase_date) || extracted.purchase_date,
                    },
                    source: 'region-openai',
                }
            }
        } catch (e: any) {
            console.warn('[Extract Warranty PDF] Region OpenAI failed, fallback to OCR:', e?.message)
            openAiRegionWarning = `AI Vision失敗: ${e?.message || 'unknown error'}`
        }
    }

    if (geminiKey && preparedCrops.length > 0) {
        try {
            const extracted = await extractMappedRegionsWithGemini(preparedCrops, geminiKey)
            if (countFilledFields(extracted) >= 3) {
                return {
                    extracted: {
                        ...extracted,
                        postal_code: extractPostalCode(extracted.postal_code ?? '') ?? extracted.postal_code,
                        purchase_date: toIsoDate(extracted.purchase_date) || extracted.purchase_date,
                    },
                    source: 'region-gemini',
                    warning: openAiRegionWarning || undefined,
                }
            }
        } catch (e: any) {
            console.warn('[Extract Warranty PDF] Region Gemini failed, fallback to OCR:', e?.message)
            openAiRegionWarning = [openAiRegionWarning, `Gemini Vision失敗: ${e?.message || 'unknown error'}`].filter(Boolean).join(' ')
        }
    }

    for (const crop of preparedCrops) {
        try {
            let rawText = ''
            if (paddleAvailable) {
                try {
                    rawText = await extractTextByPaddleOcr(crop.pngBytes, 3500)
                } catch {
                    paddleAvailable = false
                }
            }
            if (!rawText) {
                rawText = await extractTextByOcr(crop.pngBytes, 5000)
            }
            result[crop.fieldType] = rawText.replace(/\n+/g, ' ').trim() || null

        } catch (e: any) {
            console.warn(`[Region OCR] fieldType=${crop.fieldType} failed:`, e?.message)
            result[crop.fieldType] = null
        }
    }

    const phones = extractAllPhones(
        [result['phone'], result['mobile']].filter(Boolean).join(' ')
    )

    return {
        extracted: {
            customer_name: clean(result['customer_name']),
            postal_code: extractPostalCode(result['postal_code'] ?? '') ?? clean(result['postal_code']),
            address: clean(result['address']),
            phone: clean(result['phone']) ?? phones[0] ?? null,
            mobile: clean(result['mobile']) ?? phones[1] ?? null,
            product_name: clean(result['product_name']),
            model_no_full: clean(result['model_no_full']),
            manufacturing_no: clean(result['manufacturing_no']),
            slip_no: clean(result['slip_no']),
            purchase_date: toIsoDate(clean(result['purchase_date'])),
            dealer_name: clean(result['dealer_name']),
            staff_name: clean(result['staff_name']),
        },
        source: 'region-ocr',
        warning: openAiRegionWarning || undefined,
    }
}

// ─────────────────────────────────────────────────────────────────────────────

const extractModelNo = (text: string) => {
    const byLabel = extractByLabel(text, ['型式番号', '型式'])
    if (byLabel) return byLabel
    const m = text.match(/[A-Z]{1,4}-\d{2,4}[A-Z]?-[A-Z]{1,3}/)
    return clean(m?.[0])
}

const parseWarrantyFromText = (text: string): ExtractedWarranty => {
    const phones = extractAllPhones(text)
    const phoneByLabel = extractByLabel(text, ['固定電話', '電話番号', '電話'])
    const mobileByLabel = extractByLabel(text, ['携帯電話', '携帯'])

    const phone = phoneByLabel || phones[0] || null
    const mobile = mobileByLabel || phones[1] || null

    const customer = extractByLabel(text, ['お客様名', 'お客様氏名', 'お客様'])
    const postal = extractPostalCode(text)
    const address = extractByLabel(text, ['住所'])
    const purchaseDateRaw = extractByLabel(text, ['ご購入年月日', '購入年月日'])

    return {
        customer_name: customer,
        postal_code: postal,
        address,
        phone,
        mobile,
        product_name: extractProductName(text),
        model_no_full: extractModelNo(text),
        manufacturing_no: extractByLabel(text, ['製造番号', '本体番号']),
        slip_no: extractByLabel(text, ['伝票番号']),
        purchase_date: toIsoDate(purchaseDateRaw),
        dealer_name: extractByLabel(text, ['販売店名']),
        staff_name: extractByLabel(text, ['担当者名', '担当者']),
    }
}

const extractTextFromPdf = async (pdfBytes: Uint8Array) => {
    const pdfBuffer = Buffer.from(pdfBytes)
    const pdfParser = new PDFParser()
    const extractedText = await new Promise<string>((resolve) => {
        pdfParser.on('pdfParser_dataError', () => resolve(''))
        pdfParser.on('pdfParser_dataReady', (data: any) => {
            try {
                const lines: Array<{ y: number; x: number; text: string }> = []
                if (data.Pages && data.Pages[0]?.Texts) {
                    data.Pages[0].Texts.forEach((item: any) => {
                        if (item.R?.[0]?.T) {
                            let decoded = item.R[0].T
                            try {
                                decoded = decodeURIComponent(item.R[0].T)
                            } catch {
                                // noop
                            }
                            lines.push({ y: item.y, x: item.x, text: decoded })
                        }
                    })
                }

                lines.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
                const grouped: string[] = []
                let currentY = -999
                let currentLine: string[] = []
                const flush = () => {
                    if (currentLine.length > 0) grouped.push(currentLine.join(' ').trim())
                    currentLine = []
                }

                for (const line of lines) {
                    if (currentY < -998) {
                        currentY = line.y
                        currentLine.push(line.text)
                        continue
                    }
                    if (Math.abs(line.y - currentY) <= 0.5) {
                        currentLine.push(line.text)
                    } else {
                        flush()
                        currentY = line.y
                        currentLine.push(line.text)
                    }
                }
                flush()
                resolve(grouped.join('\n'))
            } catch {
                resolve('')
            }
        })
        pdfParser.parseBuffer(pdfBuffer)
    })

    return extractedText
}

/**
 * 保証書 PDF を OCR + ルール抽出で読み取り、顧客登録情報を抽出するAPI
 */
export async function POST(req: Request) {
    try {
        const formData = await req.formData()
        const file = formData.get('file')

        if (!(file instanceof File)) {
            return NextResponse.json({ ok: false, message: 'ファイルがありません' }, { status: 400 })
        }

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return NextResponse.json({ ok: false, message: 'PDFファイルを選択してください' }, { status: 400 })
        }

        console.log('[Extract Warranty PDF] Converting PDF to image:', file.name)

        // PDF → PNG 変換（1ページ目のみ）
        const originalPdfArrayBuffer = await file.arrayBuffer()
        const pdfBytesForImage = cloneBytes(originalPdfArrayBuffer)
        const pdfBytesForText = cloneBytes(originalPdfArrayBuffer)

        const pngPages = await pdfToPng(pdfBytesForImage.buffer.slice(0), {
            pagesToProcess: [1],
            verbosityLevel: 0,
            returnPageContent: true,
        })

        if (!pngPages?.[0]?.content) {
            throw new Error('PDFの画像変換に失敗しました')
        }

        const pngBytes = cloneBytes(pngPages[0].content)
        const base64Image = Buffer.from(pngBytes).toString('base64')
        const imageDataUrl = `data:image/png;base64,${base64Image}`

        const openAiKey = process.env.OPENAI_API_KEY
        const geminiKey = process.env.GOOGLE_GEMINI_API_KEY

        // ── 1. 領域マッピングが指定されている場合は優先して使用（高精度） ──────
        let regionFallbackWarning = ''
        const fieldMappingsRaw = formData.get('fieldMappings')
        if (fieldMappingsRaw && typeof fieldMappingsRaw === 'string') {
            try {
                const parsed = JSON.parse(fieldMappingsRaw) as Array<{
                    fieldType: string
                    area: { x1: number; y1: number; x2: number; y2: number } | null
                }>
                const validMappings: FieldAreaMapping[] = parsed.filter(
                    (m): m is FieldAreaMapping => !!m.area
                )

                if (validMappings.length > 0) {
                    if (!openAiKey && !geminiKey) {
                        regionFallbackWarning = 'AI Vision の API キーが未設定のため、手書き向けVisionは使用できません。通常OCRで処理します。'
                    }
                    console.log(
                        `[Extract Warranty PDF] Region OCR mode: ${validMappings.length} fields`
                    )
                    const pngBuffer = Buffer.from(pngBytes)
                    const regionResult = await extractByRegions(pngBuffer, validMappings, openAiKey, geminiKey)
                    if (regionResult.warning) {
                        regionFallbackWarning = joinUniqueWarnings(regionFallbackWarning, regionResult.warning)
                    }
                    const filledCount = countFilledFields(regionResult.extracted)
                    if (filledCount >= 3) {
                        return NextResponse.json({
                            ok: true,
                            extracted: regionResult.extracted,
                            imageDataUrl,
                            fileName: file.name,
                            source: regionResult.source,
                        })
                    }
                    regionFallbackWarning = joinUniqueWarnings(
                        regionFallbackWarning,
                        `領域OCRで十分に抽出できなかったため（${filledCount}/12件）、通常OCRへフォールバックしました。`
                    )
                    console.warn('[Extract Warranty PDF] Region OCR low confidence, fallback:', filledCount)
                }
            } catch (e: any) {
                console.warn('[Extract Warranty PDF] Failed to parse fieldMappings, continuing with fallback:', e?.message)
            }
        }

        // ── 2. OpenAI Vision（フォールバック） ────────────────────────────────
        if (openAiKey) {
            try {
                const extracted = await extractWithOpenAi(base64Image, openAiKey)
                return NextResponse.json({
                    ok: true,
                    extracted,
                    imageDataUrl,
                    fileName: file.name,
                    source: 'openai',
                    warning: regionFallbackWarning || undefined,
                })
            } catch (openAiError: any) {
                console.warn('[Extract Warranty PDF] OpenAI failed, fallback to OCR:', openAiError?.message)
                regionFallbackWarning = joinUniqueWarnings(regionFallbackWarning, `AI Vision失敗: ${openAiError?.message || 'unknown error'}`)
            }
        }

        if (geminiKey) {
            try {
                const extracted = await extractWithGemini(base64Image, geminiKey)
                return NextResponse.json({
                    ok: true,
                    extracted,
                    imageDataUrl,
                    fileName: file.name,
                    source: 'gemini',
                    warning: regionFallbackWarning || undefined,
                })
            } catch (geminiError: any) {
                console.warn('[Extract Warranty PDF] Gemini failed, fallback to OCR:', geminiError?.message)
                regionFallbackWarning = joinUniqueWarnings(regionFallbackWarning, `Gemini Vision失敗: ${geminiError?.message || 'unknown error'}`)
            }
        }

        console.log('[Extract Warranty PDF] OCR/Text extract mode, image size:', base64Image.length)

        const textFromPdf = await withTimeout(extractTextFromPdf(pdfBytesForText), 8000, 'PDF text parse')
        const needsOcr = textFromPdf.replace(/[\s\n]/g, '').length < 40

        let textFromPaddle = ''
        let textFromOcr = ''
        let source = 'pdf-text'
        let warning = ''

        if (needsOcr) {
            try {
                textFromPaddle = await extractTextByPaddleOcr(pngBytes)
                source = 'paddle-ocr'
            } catch (paddleError: any) {
                console.warn('[Extract Warranty PDF] PaddleOCR failed, fallback to Tesseract:', paddleError?.message)
                textFromOcr = await extractTextByOcr(pngBytes)
                source = 'tesseract-fallback'
                warning = 'PaddleOCR未起動または接続失敗のため、Tesseractで読み取りました。'
            }
        }

        const mergedText = [textFromPdf, textFromPaddle, textFromOcr].filter(Boolean).join('\n')
        const extracted = parseWarrantyFromText(mergedText)
        return NextResponse.json({
            ok: true,
            extracted,
            imageDataUrl,
            fileName: file.name,
            source,
            warning: regionFallbackWarning || warning || 'OCR+ルール抽出で読み取りました。必要に応じて値を修正してください。',
        })
    } catch (e: any) {
        console.error('[Extract Warranty PDF] Error:', e)
        return NextResponse.json(
            { ok: false, message: e?.message || 'PDF読み込みエラーが発生しました' },
            { status: 500 }
        )
    }
}
