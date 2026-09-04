'use client'

import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type ImportRowRaw = {
  [key: string]: any
}

type PreparedRow = {
  id: string
  name: string
  unit: string | null
  cost_price: number | null
  retail_price: number | null
  created_at: string | null
}

type ColumnMapping = {
  idColumn: string
  nameColumn: string | null
  unitColumn: string | null
  costPriceColumn: string | null
  retailPriceColumn: string | null
}

/** update: 既存コードは残し内容のみ更新 / replace: Excel を正としてファイルにないコードを削除 */
type ImportMode = 'update' | 'replace'

const SUPABASE_IN_CHUNK = 200

const DEFAULT_COLUMN_MAPPING: ColumnMapping = {
  idColumn: '商品ＣＤ',
  nameColumn: '品名',
  unitColumn: '単位',
  costPriceColumn: '原価',
  retailPriceColumn: '定価',
}

const SAMPLE_IMPORT_HEADERS: string[] = [
  DEFAULT_COLUMN_MAPPING.idColumn,
  DEFAULT_COLUMN_MAPPING.nameColumn ?? '品名',
  DEFAULT_COLUMN_MAPPING.unitColumn ?? '単位',
  DEFAULT_COLUMN_MAPPING.costPriceColumn ?? '原価',
  DEFAULT_COLUMN_MAPPING.retailPriceColumn ?? '定価',
]

function pickHeader(headers: string[], candidates: string[]): string | null {
  const set = new Set(headers)
  return candidates.find((c) => set.has(c)) ?? null
}

const SAMPLE_IMPORT_ROWS: (string | number)[][] = [
  ['SAMPLE-001', 'サンプル商品Ａ', '台', 10000, 15000],
  ['SAMPLE-002', 'サンプル商品Ｂ', '個', 2500, 3800],
  ['SAMPLE-003', 'サンプル商品Ｃ', '式', 80000, 120000],
]

function downloadProductImportSample() {
  const ws = XLSX.utils.aoa_to_sheet([SAMPLE_IMPORT_HEADERS, ...SAMPLE_IMPORT_ROWS])
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '商品マスタ')
  XLSX.writeFile(wb, '商品マスタ取込サンプル.xlsx')
}

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = Number(String(value).replace(/,/g, ''))
  if (Number.isNaN(num)) return null
  return num
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function fetchProductsByIds(ids: string[]) {
  const rows: { id: string; created_at: string | null; name: string; unit: string | null }[] = []
  for (const chunk of chunkArray(ids, SUPABASE_IN_CHUNK)) {
    const { data, error } = await supabase
      .from('products')
      .select('id, created_at, name, unit')
      .in('id', chunk)
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

async function fetchAllProductIds(): Promise<string[]> {
  const ids: string[] = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('products').select('id').range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    ids.push(...data.map((r) => String(r.id)))
    if (data.length < pageSize) break
    from += pageSize
  }
  return ids
}

const ProductPriceImportPage: React.FC = () => {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [message, setMessage] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(DEFAULT_COLUMN_MAPPING)
  const [showColumnMapping, setShowColumnMapping] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('update')
  const [existingMasterCount, setExistingMasterCount] = useState(0)
  const [obsoleteIds, setObsoleteIds] = useState<string[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setRows([])
    setMessage('')
    setSheetHeaders([])
    setExistingMasterCount(0)
    setObsoleteIds([])
  }

  // ① Excel を読み込んでヘッダーを抽出
  const handleAnalyzeFile = async () => {
    if (!file) {
      setMessage('ファイルを選択してください。')
      return
    }

    setIsLoading(true)
    setMessage('Excel ファイルのヘッダーを読み込み中…')

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      // ヘッダー行のみ抽出
      const headers = XLSX.utils.sheet_to_json<any>(sheet, { defval: '', range: 0, header: 1 })[0] || []
      const validHeaders = headers.filter((h: any) => h !== undefined && h !== '' && typeof h === 'string')
      setSheetHeaders(validHeaders)
      setColumnMapping({
        idColumn: pickHeader(validHeaders, ['商品ＣＤ', '商品CD', DEFAULT_COLUMN_MAPPING.idColumn]) || '',
        nameColumn: pickHeader(validHeaders, ['品名', '商品名']),
        unitColumn: pickHeader(validHeaders, ['単位']),
        costPriceColumn: pickHeader(validHeaders, ['原価', '新仕入']),
        retailPriceColumn: pickHeader(validHeaders, ['定価', '小売【別】']),
      })
      setShowColumnMapping(true)
      setMessage('Excel ファイルを読み込みました。カラムマッピングを設定してください。')
    } catch (error) {
      console.error(error)
      setMessage('Excel の読み込み中にエラーが発生しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // ② マッピング設定後のデータ解析
  const handleParseFile = async () => {
    if (!file || !columnMapping.idColumn) {
      setMessage('ファイルと商品ID/CD列のマッピングを確認してください。')
      return
    }

    setIsLoading(true)
    setMessage('Excel を解析中です…')

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      const raw = XLSX.utils.sheet_to_json<ImportRowRaw>(sheet, { defval: '' })

      const prepared: PreparedRow[] = raw
        .map((r): PreparedRow | null => {
          const id = (r[columnMapping.idColumn] ?? '').toString().trim()
          if (!id) return null

          // 商品名：Excelから取得 or 既存値を使用
          const nameFromExcel = columnMapping.nameColumn ? (r[columnMapping.nameColumn] ?? '').toString().trim() : ''

          const unitValue = columnMapping.unitColumn ? (r[columnMapping.unitColumn] ?? '').toString().trim() : ''
          const unit = unitValue || null

          const costValue = columnMapping.costPriceColumn ? parseNumber(r[columnMapping.costPriceColumn]) : null
          const retailValue = columnMapping.retailPriceColumn ? parseNumber(r[columnMapping.retailPriceColumn]) : null

          const cost_price = costValue !== null && costValue !== 0 ? costValue : null
          const retail_price = retailValue !== null && retailValue !== 0 ? retailValue : null

          return {
            id,
            name: nameFromExcel || '',
            unit,
            cost_price,
            retail_price,
            created_at: null
          }
        })
        .filter((r): r is PreparedRow => r !== null)

      // ★ Supabaseから既存の商品情報を取得してcreated_at / name / unit をマージ
      const productIds = prepared.map((p) => p.id)
      if (productIds.length > 0) {
        const existingProducts = await fetchProductsByIds(productIds)

        const existingMap = new Map(
          existingProducts.map((p) => [p.id, { created_at: p.created_at, name: p.name, unit: p.unit }])
        )

        prepared.forEach((p) => {
          const existing = existingMap.get(p.id)
          if (existing) {
            p.created_at = existing.created_at || null
            // Excel から商品名がない場合は既存値を使用
            if (!p.name && existing.name) p.name = existing.name
            // unit が未入力で、マッピングで反映しないを選択した場合は既存値を使用
            if (!p.unit && existing.unit) p.unit = existing.unit
          }
        })
      }

      // name が空の行を除外（既存値もない場合）
      const finalized = prepared.filter((p) => !!p.name)

      const allExistingIds = await fetchAllProductIds()
      const excelIdSet = new Set(finalized.map((p) => p.id))
      const toDelete = allExistingIds.filter((id) => !excelIdSet.has(id))
      const existingCount = finalized.filter((p) => p.created_at !== null).length
      const newCount = finalized.length - existingCount

      setExistingMasterCount(allExistingIds.length)
      setObsoleteIds(toDelete)
      setRows(finalized)

      setMessage(
        `解析完了：Excel 行数 ${raw.length} 件中、${finalized.length} 件を読み込みました。\n` +
          `（既存コードの更新: ${existingCount} 件、新規コード: ${newCount} 件、ファイルにない既存コード: ${toDelete.length} 件）`
      )
      setShowColumnMapping(false)
    } catch (error) {
      console.error(error)
      setMessage('Excel の解析中にエラーが発生しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // ③ Supabase の products に反映（内容更新 or すべて入替）
  const handleUpdateSupabase = async () => {
    if (rows.length === 0) {
      setMessage('更新対象データがありません。先に「Excel を解析」してください。')
      return
    }

    const confirmUpdate = window.confirm(
      importMode === 'replace'
        ? `【すべて入替】Excel を正として商品マスタを置き換えます。\n` +
            `・更新／追加: ${rows.length} 件\n` +
            `・ファイルにない既存コードを削除: ${obsoleteIds.length} 件\n` +
            `この操作は取り消せません。よろしいですか？`
        : `【内容の更新】既存コードは残して内容を更新します。\n` +
            `・更新／追加: ${rows.length} 件\n` +
            `・ファイルにない既存コードは削除しません。\n` +
            `よろしいですか？`
    )
    if (!confirmUpdate) {
      return
    }

    setIsLoading(true)
    setMessage('Supabase（products）を更新中です…')

    try {
      // ★ 重複 ID を除外（最初の出現を保持）
      const seenIds = new Set<string>()
      const uniqueRows = rows.filter((r) => {
        if (seenIds.has(r.id)) {
          console.warn(`重複ID: ${r.id} は除外されました`)
          return false
        }
        seenIds.add(r.id)
        return true
      })

      if (uniqueRows.length < rows.length) {
        setMessage(`⚠️ 重複IDが検出されました。重複を除いた ${uniqueRows.length} 件を更新します。`)
      }

      const now = new Date().toISOString()
      const payload = uniqueRows.map((r) => {
        const record: any = { id: r.id, name: r.name }
        if (r.unit !== null) record.unit = r.unit
        if (r.cost_price !== null) record.cost_price = r.cost_price
        if (r.retail_price !== null) record.retail_price = r.retail_price
        record.created_at = r.created_at || now
        return record
      })

      for (const chunk of chunkArray(payload, SUPABASE_IN_CHUNK)) {
        const { error, status, statusText } = await supabase.from('products').upsert(chunk, {
          onConflict: 'id',
        })

        if (error) {
          const errorInfo = {
            message: (error as any)?.message,
            details: (error as any)?.details,
            hint: (error as any)?.hint,
            code: (error as any)?.code,
            raw: JSON.stringify(error),
          }
          console.error('Supabase upsert error detail:', {
            status,
            statusText,
            errorInfo,
            sample: chunk.slice(0, 3),
          })
          const errorMessage =
            errorInfo.message || errorInfo.details || errorInfo.hint || errorInfo.code || errorInfo.raw
          setMessage(
            `Supabase 更新中にエラーが発生しました: ${errorMessage}\nstatus: ${status} ${statusText}`
          )
          return
        }
      }

      let deletedCount = 0
      const failedDeletes: string[] = []

      if (importMode === 'replace' && obsoleteIds.length > 0) {
        setMessage(`更新完了。ファイルにない ${obsoleteIds.length} 件を削除中です…`)
        for (const chunk of chunkArray(obsoleteIds, SUPABASE_IN_CHUNK)) {
          const { error } = await supabase.from('products').delete().in('id', chunk)
          if (!error) {
            deletedCount += chunk.length
            continue
          }
          // 参照中などで一括削除できない場合は1件ずつ試す
          for (const id of chunk) {
            const { error: oneErr } = await supabase.from('products').delete().eq('id', id)
            if (oneErr) failedDeletes.push(id)
            else deletedCount += 1
          }
        }
      }

      alert('完了しました')
      setLastUpdateTime(new Date().toLocaleString('ja-JP'))
      const duplicateNote =
        uniqueRows.length < rows.length ? `※${rows.length - uniqueRows.length}件の重複IDは除外されました\n` : ''
      if (importMode === 'replace') {
        setObsoleteIds(failedDeletes)
        setExistingMasterCount(payload.length + failedDeletes.length)
        setMessage(
          `入替完了：更新／追加 ${payload.length} 件、削除 ${deletedCount} 件。\n` +
            duplicateNote +
            (failedDeletes.length > 0
              ? `※見積明細などから参照されているため削除できなかったコード: ${failedDeletes.length} 件`
              : '※Excel にない既存コードは削除しました。')
        )
      } else {
        setMessage(
          `更新完了：products テーブルに ${payload.length} 件を反映しました。\n` +
            duplicateNote +
            '※既存コードは内容を更新／新しいコードは追加。ファイルにないコードは残しています。'
        )
      }
    } catch (error) {
      console.error('Unexpected error in handleUpdateSupabase:', error)
      const errMsg = error instanceof Error ? error.message : JSON.stringify(error)
      setMessage(`Supabase 更新中に予期しないエラーが発生しました: ${errMsg}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginTop: 0, color: '#fff' }}>商品マスタ 単価一括更新／取込（Excel）</h1>
        <button
          onClick={() => router.push('/selectors')}
          className="selector-button"
          style={{ padding: '10px 16px', backgroundColor: '#16a34a', border: '1px solid #15803d', color: '#fff' }}
        >
          メニューへ戻る
        </button>
      </div>

      <p style={{ color: '#94a3b8' }}>
        Excel ファイルを読み込み、カラムマッピングを設定して、
        <br />
        Supabase の <code>products</code> テーブルを更新します。取込方法を先に選んでください。
      </p>

      <div
        style={{
          marginTop: 16,
          marginBottom: 8,
          padding: 16,
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 'bold', color: '#93c5fd', marginBottom: 10 }}>取込方法</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: '12px 14px',
              backgroundColor: importMode === 'update' ? '#1e3a5f' : '#0f172a',
              borderRadius: 8,
              border: importMode === 'update' ? '2px solid #3b82f6' : '2px solid #334155',
            }}
          >
            <input
              type="radio"
              name="importMode"
              value="update"
              checked={importMode === 'update'}
              disabled={isLoading}
              onChange={() => setImportMode('update')}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ display: 'block', fontWeight: 'bold', color: '#fff' }}>
                コードは残して内容を更新
              </span>
              <span style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                一致する商品コードの品名・単価などを更新し、新しいコードは追加します。ファイルにない既存コードは削除しません。
              </span>
            </span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: '12px 14px',
              backgroundColor: importMode === 'replace' ? '#3f1d1d' : '#0f172a',
              borderRadius: 8,
              border: importMode === 'replace' ? '2px solid #ef4444' : '2px solid #334155',
            }}
          >
            <input
              type="radio"
              name="importMode"
              value="replace"
              checked={importMode === 'replace'}
              disabled={isLoading}
              onChange={() => setImportMode('replace')}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ display: 'block', fontWeight: 'bold', color: '#fff' }}>
                コードからすべて入替
              </span>
              <span style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Excel を正として置き換えます。一致するコードは内容を更新し、ファイルにない商品コードは削除されます。
              </span>
            </span>
          </label>
        </div>
        {importMode === 'replace' && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#fca5a5' }}>
            注意: 見積明細などから参照されている商品は削除できない場合があります。
          </p>
        )}
      </div>

      <div style={{ marginTop: 16, marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => {
            downloadProductImportSample()
            setMessage('取込サンプル（商品マスタ取込サンプル.xlsx）をダウンロードしました。列名はそのまま使い、行の内容を書き換えて取り込んでください。')
          }}
          disabled={isLoading}
          style={{
            padding: '10px 20px',
            backgroundColor: isLoading ? '#334155' : '#0f766e',
            color: '#fff',
            border: '1px solid',
            borderColor: isLoading ? '#475569' : '#0d9488',
            borderRadius: '10px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            boxShadow: isLoading ? 'none' : '0 8px 24px rgba(13, 148, 136, 0.25)',
            textShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        >
          ⬇ 取込サンプルをダウンロード
        </button>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          列名は商品ＣＤ／品名／単位／原価／定価です。内容を書き換えて取り込んでください。
        </span>
      </div>

      {!showColumnMapping && !rows.length && (
        <>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <label
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: '2px solid #1d4ed8',
                borderRadius: '10px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)',
                textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                opacity: isLoading ? 0.5 : 1
              }}
            >
              📁 ファイル選択
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={isLoading}
                style={{ display: 'none' }}
              />
            </label>
            {file && <span style={{ marginLeft: 12, color: '#cbd5e1' }}>{file.name}</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              onClick={handleAnalyzeFile}
              disabled={!file || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: !file || isLoading ? '#334155' : '#2563eb',
                color: '#fff',
                border: '1px solid',
                borderColor: !file || isLoading ? '#475569' : '#1d4ed8',
                borderRadius: '10px',
                cursor: !file || isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: !file || isLoading ? 'none' : '0 8px 24px rgba(37, 99, 235, 0.25)',
                textShadow: '0 1px 2px rgba(0,0,0,0.25)'
              }}
            >
              ① ファイル分析
            </button>
          </div>
        </>
      )}

      {showColumnMapping && sheetHeaders.length > 0 && (
        <div style={{ backgroundColor: '#1e293b', padding: 20, borderRadius: 12, marginBottom: 16, border: '1px solid #334155', color: '#e2e8f0' }}>
          <h2 style={{ color: '#93c5fd' }}>カラムマッピング設定</h2>
          <p style={{ fontSize: 13, color: '#fff' }}>
            Excel の各列を、products テーブルのカラムにマップしてください。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            {/* ID列 */}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                商品ID / CD列 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={columnMapping.idColumn}
                onChange={(e) => setColumnMapping({ ...columnMapping, idColumn: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#0f172a',
                  color: '#e2e8f0'
                }}
              >
                <option value="">選択してください</option>
                {sheetHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {/* 商品名列 */}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                商品名列（オプション）
              </label>
              <select
                value={columnMapping.nameColumn || ''}
                  onChange={(e) => setColumnMapping({ ...columnMapping, nameColumn: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#0f172a',
                  color: '#e2e8f0'
                }}
              >
                <option value="">反映しない（既存値を使用）</option>
                {sheetHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {/* 単位列 */}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                単位列（オプション）
              </label>
              <select
                value={columnMapping.unitColumn || ''}
                onChange={(e) => setColumnMapping({ ...columnMapping, unitColumn: e.target.value || null })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#0f172a',
                  color: '#e2e8f0'
                }}
              >
                <option value="">反映しない</option>
                {sheetHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {/* 原価列 */}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                原価列（オプション）
              </label>
              <select
                value={columnMapping.costPriceColumn || ''}
                onChange={(e) => setColumnMapping({ ...columnMapping, costPriceColumn: e.target.value || null })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#0f172a',
                  color: '#e2e8f0'
                }}
              >
                <option value="">反映しない</option>
                {sheetHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {/* 定価列 */}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                定価列（オプション）
              </label>
              <select
                value={columnMapping.retailPriceColumn || ''}
                onChange={(e) => setColumnMapping({ ...columnMapping, retailPriceColumn: e.target.value || null })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#0f172a',
                  color: '#e2e8f0'
                }}
              >
                <option value="">反映しない</option>
                {sheetHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setShowColumnMapping(false)
                setSheetHeaders([])
              }}
              style={{ padding: '10px 16px', backgroundColor: '#16a34a', border: '1px solid #15803d', borderRadius: '8px', cursor: 'pointer', color: '#fff' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleParseFile}
              disabled={!columnMapping.idColumn || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: !columnMapping.idColumn || isLoading ? '#334155' : '#2563eb',
                color: '#fff',
                border: '1px solid',
                borderColor: !columnMapping.idColumn || isLoading ? '#475569' : '#1d4ed8',
                borderRadius: '10px',
                cursor: !columnMapping.idColumn || isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: !columnMapping.idColumn || isLoading ? 'none' : '0 8px 24px rgba(37, 99, 235, 0.25)',
                textShadow: '0 1px 2px rgba(0,0,0,0.25)'
              }}
            >
              ② Excel 解析
            </button>
          </div>
        </div>
      )}

      {message && (
        <p style={{ marginTop: 8, whiteSpace: 'pre-line', color: '#cbd5e1' }}>{message}</p>
      )}

      {rows.length > 0 && (
        <>
          <div
            style={{
              marginTop: 16,
              padding: 14,
              backgroundColor: importMode === 'replace' ? '#3f1d1d' : '#1e293b',
              border: `1px solid ${importMode === 'replace' ? '#7f1d1d' : '#334155'}`,
              borderRadius: 10,
              fontSize: 13,
              color: '#e2e8f0',
            }}
          >
            <div>
              取込方法:{' '}
              <strong>{importMode === 'replace' ? 'コードからすべて入替' : 'コードは残して内容を更新'}</strong>
            </div>
            <div style={{ marginTop: 6, color: '#cbd5e1' }}>
              Excel {rows.length} 件 ／ 既存マスタ {existingMasterCount} 件
              {importMode === 'replace'
                ? ` ／ 削除予定 ${obsoleteIds.length} 件（ファイルにないコード）`
                : ' ／ ファイルにない既存コードは残します'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, marginTop: 16 }}>
            <button
              onClick={handleUpdateSupabase}
              disabled={rows.length === 0 || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: rows.length === 0 || isLoading ? '#334155' : importMode === 'replace' ? '#dc2626' : '#2563eb',
                color: '#fff',
                border: '1px solid',
                borderColor: rows.length === 0 || isLoading ? '#475569' : importMode === 'replace' ? '#b91c1c' : '#1d4ed8',
                borderRadius: '10px',
                cursor: rows.length === 0 || isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: rows.length === 0 || isLoading ? 'none' : importMode === 'replace' ? '0 8px 24px rgba(220, 38, 38, 0.25)' : '0 8px 24px rgba(37, 99, 235, 0.25)',
                textShadow: '0 1px 2px rgba(0,0,0,0.25)'
              }}
            >
              {importMode === 'replace' ? '③ すべて入替して反映' : '③ 内容を更新'}
            </button>
            <input
              type="text"
              value={lastUpdateTime}
              readOnly
              placeholder="更新日時"
              style={{
                padding: '10px 16px',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: '#0f172a',
                color: '#e2e8f0',
                minWidth: '200px'
              }}
            />
          </div>

          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, color: '#93c5fd' }}>更新プレビュー（先頭 20 件）</h2>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                marginTop: 8
              }}
            >
              <thead>
                <tr>
                  <th style={{ border: '1px solid #334155', padding: 8, backgroundColor: '#1e293b', color: '#cbd5e1', fontSize: 11, textAlign: 'left' }}>
                    ID
                  </th>
                  <th style={{ border: '1px solid #334155', padding: 8, backgroundColor: '#1e293b', color: '#cbd5e1', fontSize: 11, textAlign: 'left' }}>
                    商品名
                  </th>
                  <th style={{ border: '1px solid #334155', padding: 8, backgroundColor: '#1e293b', color: '#cbd5e1', fontSize: 11, textAlign: 'left' }}>
                    単位
                  </th>
                  <th style={{ border: '1px solid #334155', padding: 8, backgroundColor: '#1e293b', color: '#cbd5e1', fontSize: 11, textAlign: 'left' }}>
                    原価
                  </th>
                  <th style={{ border: '1px solid #334155', padding: 8, backgroundColor: '#1e293b', color: '#cbd5e1', fontSize: 11, textAlign: 'left' }}>
                    定価
                  </th>
                  <th style={{ border: '1px solid #334155', padding: 8, backgroundColor: '#1e293b', color: '#cbd5e1', fontSize: 11, textAlign: 'left' }}>
                    更新日時
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, idx) => {
                  const displayTime = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '新規'
                  return (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #334155', padding: 4, fontSize: 11, color: '#e2e8f0' }}>{r.id}</td>
                      <td style={{ border: '1px solid #334155', padding: 4, fontSize: 11, color: '#e2e8f0' }}>{r.name}</td>
                      <td style={{ border: '1px solid #334155', padding: 4, fontSize: 11, color: '#e2e8f0' }}>{r.unit || '-'}</td>
                      <td style={{ border: '1px solid #334155', padding: 4, fontSize: 11, textAlign: 'right', color: '#e2e8f0' }}>
                        {r.cost_price ? r.cost_price.toLocaleString() : '-'}
                      </td>
                      <td style={{ border: '1px solid #334155', padding: 4, fontSize: 11, textAlign: 'right', color: '#e2e8f0' }}>
                        {r.retail_price ? r.retail_price.toLocaleString() : '-'}
                      </td>
                      <td style={{ border: '1px solid #334155', padding: 4, fontSize: 11, color: r.created_at ? '#cbd5e1' : '#22c55e', fontWeight: r.created_at ? 'normal' : 'bold' }}>
                        {displayTime}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default ProductPriceImportPage
