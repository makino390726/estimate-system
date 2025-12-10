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
  created_at?: string | null
}

type ColumnMapping = {
  idColumn: string
  nameColumn: string
  unitColumn: string
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
    if (!file || !columnMapping.idColumn || !columnMapping.nameColumn) {
      setMessage('ファイルとマッピング設定を確認してください。')
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

          const name = (r[columnMapping.nameColumn] ?? '').toString().trim()
          if (!name) return null

          const unitValue = columnMapping.unitColumn ? (r[columnMapping.unitColumn] ?? '').toString().trim() : ''
          const unit = unitValue || null

          const costValue = columnMapping.costPriceColumn ? parseNumber(r[columnMapping.costPriceColumn]) : null
          const retailValue = columnMapping.retailPriceColumn ? parseNumber(r[columnMapping.retailPriceColumn]) : null

          const cost_price = costValue !== null && costValue !== 0 ? costValue : null
          const retail_price = retailValue !== null && retailValue !== 0 ? retailValue : null

          return {
            id,
            name,
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
            if (!p.name && existing.name) p.name = existing.name
            if (!p.unit && existing.unit) p.unit = existing.unit
          }
        })
      }

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
      const payload = rows.map((r) => {
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
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginTop: 0 }}>商品マスタ 単価一括更新／取込（Excel）</h1>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '8px 14px',
            backgroundColor: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '6px',
            color: '#333',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          メニューへ戻る
        </button>
      </div>

      <p style={{ color: '#555' }}>
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
                backgroundColor: '#28a745',
                color: '#000',
                border: '2px solid #1e7e34',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.3)',
                textShadow: '0 1px 0 rgba(255,255,255,0.3)',
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
            {file && <span style={{ marginLeft: 12, color: '#555' }}>{file.name}</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              onClick={handleAnalyzeFile}
              disabled={!file || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: !file || isLoading ? '#ccc' : '#28a745',
                color: !file || isLoading ? '#666' : '#000',
                border: '2px solid',
                borderColor: !file || isLoading ? '#999' : '#1e7e34',
                borderRadius: '6px',
                cursor: !file || isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: !file || isLoading ? 'none' : '0 4px 6px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.3)',
                textShadow: !file || isLoading ? 'none' : '0 1px 0 rgba(255,255,255,0.3)'
              }}
            >
              ① ファイル分析
            </button>
          </div>
        </>
      )}

      {showColumnMapping && sheetHeaders.length > 0 && (
        <div style={{ backgroundColor: '#f9f9f9', padding: 20, borderRadius: 8, marginBottom: 16 }}>
          <h2>カラムマッピング設定</h2>
          <p style={{ fontSize: 13, color: '#666' }}>
            Excel の各列を、products テーブルのカラムにマップしてください。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            {/* ID列 */}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                商品ID / CD列 <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                value={columnMapping.idColumn}
                onChange={(e) => setColumnMapping({ ...columnMapping, idColumn: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
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
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                商品名列 <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                value={columnMapping.nameColumn}
                onChange={(e) => setColumnMapping({ ...columnMapping, nameColumn: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
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

            {/* 単位列 */}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                単位列（オプション）
              </label>
              <select
                value={columnMapping.unitColumn || ''}
                onChange={(e) => setColumnMapping({ ...columnMapping, unitColumn: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
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
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                原価列（オプション）
              </label>
              <select
                value={columnMapping.costPriceColumn || ''}
                onChange={(e) => setColumnMapping({ ...columnMapping, costPriceColumn: e.target.value || null })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
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
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                定価列（オプション）
              </label>
              <select
                value={columnMapping.retailPriceColumn || ''}
                onChange={(e) => setColumnMapping({ ...columnMapping, retailPriceColumn: e.target.value || null })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
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
              className="btn-3d btn-reset"
              style={{ padding: '8px 16px' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleParseFile}
              disabled={!columnMapping.idColumn || !columnMapping.nameColumn || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: !columnMapping.idColumn || !columnMapping.nameColumn || isLoading ? '#ccc' : '#28a745',
                color: !columnMapping.idColumn || !columnMapping.nameColumn || isLoading ? '#666' : '#000',
                border: '2px solid',
                borderColor: !columnMapping.idColumn || !columnMapping.nameColumn || isLoading ? '#999' : '#1e7e34',
                borderRadius: '6px',
                cursor: !columnMapping.idColumn || !columnMapping.nameColumn || isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: !columnMapping.idColumn || !columnMapping.nameColumn || isLoading ? 'none' : '0 4px 6px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.3)',
                textShadow: !columnMapping.idColumn || !columnMapping.nameColumn || isLoading ? 'none' : '0 1px 0 rgba(255,255,255,0.3)'
              }}
            >
              ② Excel 解析
            </button>
          </div>
        </div>
      )}

      {message && (
        <p style={{ marginTop: 8, whiteSpace: 'pre-line', color: '#333' }}>{message}</p>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, marginTop: 16 }}>
            <button
              onClick={handleUpdateSupabase}
              disabled={rows.length === 0 || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: rows.length === 0 || isLoading ? '#ccc' : '#dc3545',
                color: rows.length === 0 || isLoading ? '#666' : '#fff',
                border: '2px solid',
                borderColor: rows.length === 0 || isLoading ? '#999' : '#bd2130',
                borderRadius: '6px',
                cursor: rows.length === 0 || isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: rows.length === 0 || isLoading ? 'none' : '0 4px 6px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2)',
                textShadow: rows.length === 0 || isLoading ? 'none' : '0 1px 2px rgba(0,0,0,0.3)'
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
                border: '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#f8f9fa',
                color: '#333',
                minWidth: '200px'
              }}
            />
          </div>

          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16 }}>更新プレビュー（先頭 20 件）</h2>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                marginTop: 8
              }}
            >
              <thead>
                <tr>
                  <th style={{ border: '1px solid #eee', padding: 8, backgroundColor: '#f5f5f5', fontSize: 11, textAlign: 'left' }}>
                    ID
                  </th>
                  <th style={{ border: '1px solid #eee', padding: 8, backgroundColor: '#f5f5f5', fontSize: 11, textAlign: 'left' }}>
                    商品名
                  </th>
                  <th style={{ border: '1px solid #eee', padding: 8, backgroundColor: '#f5f5f5', fontSize: 11, textAlign: 'left' }}>
                    単位
                  </th>
                  <th style={{ border: '1px solid #eee', padding: 8, backgroundColor: '#f5f5f5', fontSize: 11, textAlign: 'left' }}>
                    原価
                  </th>
                  <th style={{ border: '1px solid #eee', padding: 8, backgroundColor: '#f5f5f5', fontSize: 11, textAlign: 'left' }}>
                    定価
                  </th>
                  <th style={{ border: '1px solid #eee', padding: 8, backgroundColor: '#f5f5f5', fontSize: 11, textAlign: 'left' }}>
                    更新日時
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, idx) => {
                  const displayTime = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '新規'
                  return (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #eee', padding: 4, fontSize: 11 }}>{r.id}</td>
                      <td style={{ border: '1px solid #eee', padding: 4, fontSize: 11 }}>{r.name}</td>
                      <td style={{ border: '1px solid #eee', padding: 4, fontSize: 11 }}>{r.unit || '-'}</td>
                      <td style={{ border: '1px solid #eee', padding: 4, fontSize: 11, textAlign: 'right' }}>
                        {r.cost_price ? r.cost_price.toLocaleString() : '-'}
                      </td>
                      <td style={{ border: '1px solid #eee', padding: 4, fontSize: 11, textAlign: 'right' }}>
                        {r.retail_price ? r.retail_price.toLocaleString() : '-'}
                      </td>
                      <td style={{ border: '1px solid #eee', padding: 4, fontSize: 11, color: r.created_at ? '#666' : '#28a745', fontWeight: r.created_at ? 'normal' : 'bold' }}>
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
