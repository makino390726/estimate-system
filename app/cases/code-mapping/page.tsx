'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

/**
 * 仕様（案件選択＋明細コード置換）
 * - cases テーブルから案件一覧を取得しドロップダウン表示
 * - 案件選択で下部に案件情報、右に明細（case_details）を表示
 * - 明細の product_id を見積作成画面のようにインラインで編集・置換
 * - 変換後コードは固定10通り（名称＋コード）
 * - 更新は case_details.id をキーに product_id を update
 */

type CaseHeader = {
  case_id: string
  subject: string | null
  customer_id: string | null
  created_date: string | null
  staff_id: string | null
}

type DetailRow = {
  id: number
  case_id: string
  product_id: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  quantity: number | null
  unit_price: number | null
  amount: number | null
  unregistered_product: string | null
  remarks: string | null
  section: string | null
  section_id: number | null
}

type UiRow = {
  detailId: number
  case_id: string
  current_product_id: string
  product_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  remarks: string
  section: string
  section_id: number | null
  mapped_code: string
}

type MappingOption = {
  name: string
  code: string
}

const MAPPING_OPTIONS: MappingOption[] = [
  { name: '① 生産品雑', code: '3900000' },
  { name: '② 生産品送料', code: '3900990' },
  { name: '③ 肥料雑', code: '4900000' },
  { name: '④ 肥料送料', code: '4999000' },
  { name: '⑤ 農薬雑', code: '5900000' },
  { name: '⑥ 農薬送料', code: '5999000' },
  { name: '⑦ その他斡旋資材雑', code: '6900000' },
  { name: '⑧ その他送料', code: '6999000' },
  { name: '⑨ 工事雑', code: '7000000' },
  { name: '⑩ 工事送料', code: '7000990' },
]

function yen(n: number) {
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('ja-JP')
}

function uiInputStyle() {
  return {
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#eaf1ff',
  } as React.CSSProperties
}

function uiCardStyle() {
  return {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
  } as React.CSSProperties
}

export default function Page() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [allCases, setAllCases] = useState<CaseHeader[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string>('')
  const [selectedCase, setSelectedCase] = useState<CaseHeader | null>(null)
  const [details, setDetails] = useState<UiRow[]>([])

  const summary = useMemo(() => {
    const total = details.length
    const changed = details.filter((r) => r.mapped_code.trim().length > 0 && r.mapped_code !== r.current_product_id).length
    return { total, changed }
  }, [details])

  async function fetchAllCases() {
    setMessage('')
    setLoading(true)
    try {
      const { data: cases, error } = await supabase
        .from('cases')
        .select('case_id, subject, customer_id, created_date, staff_id')
        .order('created_date', { ascending: false })
        .limit(500)

      if (error) throw error

      const caseList = (cases as CaseHeader[] | null) ?? []
      setAllCases(caseList)
      
      if (caseList.length > 0 && !selectedCaseId) {
        setSelectedCaseId(caseList[0].case_id)
      }
      
      setMessage(`案件一覧を読み込みました: ${caseList.length}件`)
    } catch (e: any) {
      setMessage(`案件一覧取得エラー: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCaseDetails(caseId: string) {
    if (!caseId) {
      setDetails([])
      setSelectedCase(null)
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const caseInfo = allCases.find((c) => c.case_id === caseId)
      setSelectedCase(caseInfo ?? null)

      const { data: detailData, error } = await supabase
        .from('case_details')
        .select(
          'id, case_id, product_id, spec, unit, quantity, unit_price, amount, unregistered_product, remarks, section, section_id'
        )
        .eq('case_id', caseId)
        .order('id', { ascending: true })

      if (error) throw error

      const detailRows = (detailData as DetailRow[] | null) ?? []

      // product_id一覧を収集し、productsから名称を取得
      const productIds = Array.from(
        new Set(
          detailRows
            .map((r) => (r.product_id ?? '').toString().trim())
            .filter((v) => v.length > 0)
        )
      )

      let productNameMap = new Map<string, string>()
      if (productIds.length > 0) {
        const { data: productsData, error: prodErr } = await supabase
          .from('products')
          .select('id, name')
          .in('id', productIds)

        if (!prodErr) {
          for (const p of productsData || []) {
            productNameMap.set(String((p as any).id), String((p as any).name || ''))
          }
        } else {
          console.warn('products取得エラー:', prodErr.message)
        }
      }

      const rows: UiRow[] = detailRows.map((r) => {
        const pid = (r.product_id ?? '').toString().trim()
        const baseName = productNameMap.get(pid) || (r.unregistered_product || '')
        const specText = (r.spec ?? '').toString().trim()
        const displayName = baseName ? (specText ? `${baseName} ${specText}` : baseName) : '-'
        return {
          detailId: r.id,
          case_id: r.case_id,
          current_product_id: pid,
          product_name: displayName,
          spec: (r.spec ?? '').toString(),
          unit: (r.unit ?? '').toString(),
          quantity: Number(r.quantity ?? 0),
          unit_price: Number(r.unit_price ?? 0),
          amount: Number(r.amount ?? 0),
          remarks: (r.remarks ?? '').toString(),
          section: (r.section ?? '').toString(),
          section_id: r.section_id ?? null,
          mapped_code: pid,
        }
      })

      setDetails(rows)
      setMessage(`明細を読み込みました: ${rows.length}件`)
    } catch (e: any) {
      setMessage(`明細取得エラー: ${e?.message ?? String(e)}`)
      setDetails([])
    } finally {
      setLoading(false)
    }
  }

  function setRowCode(detailId: number, code: string) {
    setDetails((prev) =>
      prev.map((r) => (r.detailId === detailId ? { ...r, mapped_code: code } : r))
    )
  }

  function setAllToCode(code: string) {
    setDetails((prev) => prev.map((r) => ({ ...r, mapped_code: code })))
  }

  async function executeUpdate() {
    setMessage('')

    if (details.length === 0) {
      setMessage('明細がありません')
      return
    }

    const changed = details.filter((r) => r.mapped_code !== r.current_product_id)
    if (changed.length === 0) {
      setMessage('変更がありません')
      return
    }

    setLoading(true)
    try {
      let ok = 0
      let ng = 0

      for (const r of changed) {
        const { error } = await supabase
          .from('case_details')
          .update({ product_id: r.mapped_code })
          .eq('id', r.detailId)

        if (error) {
          console.error(`Update error for detailId ${r.detailId}:`, error)
          ng++
        } else {
          ok++
        }
      }

      setMessage(`更新完了: OK=${ok} / NG=${ng}`)

      // 品名は変えず、UI上の現在コードのみを更新
      if (ok > 0) {
        setDetails((prev) =>
          prev.map((r) =>
            r.mapped_code !== r.current_product_id
              ? { ...r, current_product_id: r.mapped_code }
              : r
          )
        )
      }
    } catch (e: any) {
      setMessage(`更新エラー: ${e?.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  function handleSelectCase(cid: string) {
    setSelectedCaseId(cid)
    if (cid) {
      fetchCaseDetails(cid)
    }
  }

  useEffect(() => {
    fetchAllCases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#081427,#050b16)' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-md font-bold"
              style={{
                background: '#2e6bff',
                color: '#fff',
                boxShadow: '0 6px 18px rgba(46,107,255,.25)',
              }}
            >
              雑コード置換（10通り）
            </button>

            <Link
              href="/cases/list"
              className="px-4 py-2 rounded-md font-bold"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#e9f0ff' }}
            >
              案件一覧
            </Link>
          </div>

          <div className="ml-auto flex gap-2">
            <Link
              href="/selectors"
              className="px-4 py-2 rounded-md font-bold"
              style={{ background: '#0aa34f', color: '#fff' }}
            >
              メニューに戻る
            </Link>

            <button
              disabled={loading}
              onClick={fetchAllCases}
              className="px-4 py-2 rounded-md font-bold"
              style={{ background: '#2e6bff', color: '#fff' }}
            >
              案件一覧を再読込
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,.75)' }}>
          案件一覧から選択し、明細のコードを見積作成画面のようにインライン編集できます。
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {/* Settings */}
        <div className="grid grid-cols-12 gap-4">
          {/* Case Selection */}
          <div className="col-span-12 xl:col-span-6 rounded-lg p-4" style={uiCardStyle()}>
            <div className="font-bold mb-2" style={{ color: '#eaf1ff' }}>
              案件選択
            </div>

            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12">
                <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,.75)' }}>
                  案件一覧（最新500件）
                </div>
                <select
                  value={selectedCaseId}
                  onChange={(e) => handleSelectCase(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={{
                    ...uiInputStyle(),
                    backgroundImage: 'none',
                  }}
                  disabled={loading}
                >
                  <option value="" style={{ background: '#0a1628', color: '#eaf1ff' }}>-- 案件を選択してください --</option>
                  {allCases.map((c) => {
                    const label = `${c.case_id} | ${c.subject ?? '(件名なし)'} | ${c.customer_id ?? ''}`
                    return (
                      <option key={c.case_id} value={c.case_id} style={{ background: '#0a1628', color: '#eaf1ff' }}>
                        {label}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            <div className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,.8)' }}>
              明細: 全 {summary.total}件 / 変更予定 {summary.changed}件
            </div>

            {message && (
              <div
                className="mt-3 px-3 py-2 rounded-md text-sm"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#eaf1ff',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {message}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="col-span-12 xl:col-span-6 rounded-lg p-4" style={uiCardStyle()}>
            <div className="font-bold mb-2" style={{ color: '#eaf1ff' }}>
              一括変換
            </div>

            <div className="text-xs mb-2" style={{ color: 'rgba(255,255,255,.75)' }}>
              全ての明細行を選択したコードに一括変換します
            </div>

            <div className="flex flex-wrap gap-2">
              {MAPPING_OPTIONS.map((o) => (
                <button
                  key={o.code}
                  disabled={loading || !selectedCaseId}
                  onClick={() => setAllToCode(o.code)}
                  className="px-3 py-2 rounded-md font-bold text-sm"
                  style={{
                    background: 'rgba(46,107,255,0.18)',
                    border: '1px solid rgba(46,107,255,0.35)',
                    color: '#eaf1ff',
                  }}
                >
                  全て「{o.name}」
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                disabled={loading || !selectedCaseId}
                onClick={executeUpdate}
                className="px-4 py-2 rounded-md font-bold"
                style={{
                  background: '#2e6bff',
                  color: '#fff',
                  boxShadow: '0 6px 18px rgba(46,107,255,.25)',
                }}
              >
                変更を保存（DB更新）
              </button>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="grid grid-cols-12 gap-4 mt-4">
          {/* Selected Case Info */}
          {selectedCase && (
            <div className="col-span-12 xl:col-span-4 rounded-lg p-4" style={uiCardStyle()}>
              <div className="font-bold mb-3" style={{ color: '#eaf1ff' }}>
                選択案件情報
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span style={{ color: 'rgba(255,255,255,.65)' }}>案件ID: </span>
                  <span className="font-mono" style={{ color: '#eaf1ff' }}>{selectedCase.case_id}</span>
                </div>
                <div>
                  <span style={{ color: 'rgba(255,255,255,.65)' }}>件名: </span>
                  <span style={{ color: '#eaf1ff' }}>{selectedCase.subject ?? '(なし)'}</span>
                </div>
                <div>
                  <span style={{ color: 'rgba(255,255,255,.65)' }}>顧客ID: </span>
                  <span style={{ color: '#eaf1ff' }}>{selectedCase.customer_id ?? '(なし)'}</span>
                </div>
                <div>
                  <span style={{ color: 'rgba(255,255,255,.65)' }}>担当者ID: </span>
                  <span style={{ color: '#eaf1ff' }}>{selectedCase.staff_id ?? '(なし)'}</span>
                </div>
                <div>
                  <span style={{ color: 'rgba(255,255,255,.65)' }}>作成日: </span>
                  <span style={{ color: '#eaf1ff' }}>{selectedCase.created_date ?? '(なし)'}</span>
                </div>
              </div>
            </div>
          )}

          {!selectedCase && (
            <div className="col-span-12 xl:col-span-4 rounded-lg p-4" style={uiCardStyle()}>
              <div className="font-bold mb-3" style={{ color: '#eaf1ff' }}>
                選択案件情報
              </div>
              <div className="text-sm" style={{ color: 'rgba(255,255,255,.65)' }}>
                案件を選択してください
              </div>
            </div>
          )}

          {/* Detail table */}
          <div className="col-span-12 xl:col-span-8 rounded-lg overflow-hidden" style={uiCardStyle()}>
            <div
              className="px-4 py-3 font-bold flex items-center justify-between"
              style={{ color: '#eaf1ff', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div>
                明細一覧（コード変更可能）
                {selectedCaseId && (
                  <span className="ml-3 font-mono text-sm" style={{ color: 'rgba(255,255,255,.75)' }}>
                    {selectedCaseId}
                  </span>
                )}
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 600 }}>
              <table className="w-full" style={{ minWidth: 1200, borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'rgba(0,0,0,0.18)', zIndex: 1 }}>
                  <tr style={{ color: 'rgba(255,255,255,.85)' }}>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      No
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      現在のコード
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      変更後コード（選択）
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      商品名
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      規格
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      単位
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      数量
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      備考
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {details.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-sm text-center" style={{ color: 'rgba(255,255,255,.7)' }}>
                        案件を選択してください
                      </td>
                    </tr>
                  )}

                  {details.map((r, idx) => {
                    const changed = r.mapped_code !== r.current_product_id
                    return (
                      <tr
                        key={r.detailId}
                        style={{
                          color: '#eaf1ff',
                          background: changed ? 'rgba(46,107,255,0.08)' : 'transparent',
                        }}
                      >
                        <td className="px-3 py-2 text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {r.current_product_id}
                        </td>
                        
                        <td className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <select
                            value={r.mapped_code}
                            onChange={(e) => setRowCode(r.detailId, e.target.value)}
                            className="w-full px-2 py-1 rounded-md text-sm font-mono"
                            style={{
                              ...uiInputStyle(),
                              border: changed
                                ? '1px solid rgba(46,107,255,0.5)'
                                : '1px solid rgba(255,255,255,0.12)',
                              backgroundImage: 'none',
                            }}
                          >
                            <option value={r.current_product_id} style={{ background: '#0a1628', color: '#eaf1ff' }}>(変更なし)</option>
                            {MAPPING_OPTIONS.map((o) => (
                              <option key={o.code} value={o.code} style={{ background: '#0a1628', color: '#eaf1ff' }}>
                                {o.code} - {o.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-3 py-2 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,.9)' }}>
                          {r.product_name}
                        </td>

                        <td className="px-3 py-2 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {r.spec}
                        </td>
                        <td className="px-3 py-2 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {r.unit}
                        </td>
                        <td className="px-3 py-2 text-sm text-right" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {yen(r.quantity)}
                        </td>
                        <td className="px-3 py-2 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,.85)' }}>
                          {r.remarks}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,.65)' }}>
              ※ ドロップダウンでコードを選択すると行が青く表示されます。「変更を保存」で確定します。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
