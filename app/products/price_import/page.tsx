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

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = Number(String(value).replace(/,/g, ''))
  if (Number.isNaN(num)) return null
  return num
}

const ProductPriceImportPage: React.FC = () => {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [message, setMessage] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    idColumn: '商品ＣＤ',
    nameColumn: '品名',
    unitColumn: '単位',
    costPriceColumn: '新仕入',
    retailPriceColumn: '小売【別】',
  })
  const [showColumnMapping, setShowColumnMapping] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setRows([])
    setMessage('')
    setSheetHeaders([])
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
        const { data: existingProducts } = await supabase
          .from('products')
          .select('id, created_at, name, unit')
          .in('id', productIds)

        const existingMap = new Map(
          (existingProducts || []).map((p) => [p.id, { created_at: p.created_at, name: p.name, unit: p.unit }])
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

      setRows(finalized)

      setMessage(
        `解析完了：Excel 行数 ${raw.length} 件中、${finalized.length} 件を更新対象として読み込みました。`
      )
      setShowColumnMapping(false)
    } catch (error) {
      console.error(error)
      setMessage('Excel の解析中にエラーが発生しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // ③ Supabase の products に upsert
  const handleUpdateSupabase = async () => {
    if (rows.length === 0) {
      setMessage('更新対象データがありません。先に「Excel を解析」してください。')
      return
    }

    const confirmUpdate = window.confirm(
      `商品マスタを更新します。\n${rows.length} 件のデータを反映しますか？`
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

      const payload = uniqueRows.map((r) => {
        const record: any = { id: r.id }

        record.name = r.name
        if (r.unit !== null) record.unit = r.unit

        if (r.cost_price !== null) {
          record.cost_price = r.cost_price
        }
        if (r.retail_price !== null) {
          record.retail_price = r.retail_price
        }

        record.created_at = new Date().toISOString()

        return record
      })

      const { data, error, status, statusText } = await supabase
        .from('products')
        .upsert(payload, {
          onConflict: 'id'
        })

      if (error) {
        const errorInfo = {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
          raw: JSON.stringify(error)
        }
        console.error('Supabase upsert error detail:', {
          status,
          statusText,
          errorInfo,
          sample: payload.slice(0, 3)
        })
        const errorMessage =
          errorInfo.message || errorInfo.details || errorInfo.hint || errorInfo.code || errorInfo.raw
        setMessage(
          `Supabase 更新中にエラーが発生しました: ${errorMessage}\nstatus: ${status} ${statusText}`
        )
        return
      }

      alert('完了しました')
      setLastUpdateTime(new Date().toLocaleString('ja-JP'))
      setMessage(
        `更新完了：products テーブルに ${payload.length} 件の upsert を行いました。\n` +
          (uniqueRows.length < rows.length ? `※${rows.length - uniqueRows.length}件の重複IDは除外されました\n` : '') +
          '※既存idは更新／存在しないidは新規追加されています。'
      )
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
        Supabase の <code>products</code> テーブルを更新します。
      </p>

      {!showColumnMapping && !rows.length && (
        <>
          <div style={{ marginTop: 16, marginBottom: 16 }}>
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
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, marginTop: 16 }}>
            <button
              onClick={handleUpdateSupabase}
              disabled={rows.length === 0 || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: rows.length === 0 || isLoading ? '#334155' : '#dc2626',
                color: '#fff',
                border: '1px solid',
                borderColor: rows.length === 0 || isLoading ? '#475569' : '#b91c1c',
                borderRadius: '10px',
                cursor: rows.length === 0 || isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: rows.length === 0 || isLoading ? 'none' : '0 8px 24px rgba(220, 38, 38, 0.25)',
                textShadow: '0 1px 2px rgba(0,0,0,0.25)'
              }}
            >
              ③ 商品マスタ更新
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
