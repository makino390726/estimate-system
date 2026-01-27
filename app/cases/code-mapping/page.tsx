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

type Product = {
  id: string
  name: string
  unit: string | null
}

type MappingOption = {
  name: string
  code: string
}

const QUICK_MAPPING_OPTIONS: MappingOption[] = [
  { name: '① 配料送料', code: '3900990' },
  { name: '② 農薬送料', code: '5999000' },
  { name: '③ 肥料送料', code: '4999000' },
  { name: '④ 工事雑', code: '7000000' },
  { name: '⑤ その他斡旋資材雑', code: '6900000' },
  { name: '⑥ その他送料', code: '6999000' },
  { name: '⑦ 工事送料', code: '7000990' },
  { name: '⑧ 工事雑２', code: '7000001' },
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
  const [products, setProducts] = useState<Product[]>([])
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [showProductModal, setShowProductModal] = useState(false)
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  const summary = useMemo(() => {
    const total = details.length
    const changed = details.filter((r) => r.mapped_code.trim().length > 0 && r.mapped_code !== r.current_product_id).length
    return { total, changed }
  }, [details])

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return products.slice(startIndex, endIndex)
  }, [products, currentPage, itemsPerPage])

  const totalPages = useMemo(() => {
    return Math.ceil(products.length / itemsPerPage)
  }, [products.length, itemsPerPage])

  async function fetchProducts() {
    try {
      // 初期は最初の50件のみ読み込み（全件は不要）
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit')
        .order('name')
        .limit(50)

      if (error) throw error

      console.log('商品マスタ取得: 初期50件')
      setProducts((data as Product[] | null) ?? [])
    } catch (e: any) {
      console.error('商品マスタ取得エラー:', e?.message ?? String(e))
      setMessage(`商品マスタ取得エラー: ${e?.message ?? String(e)}`)
    }
  }

  async function searchProducts(searchTerm: string) {
    try {
      if (!searchTerm.trim()) {
        // 検索語が空の場合は最初の50件を表示
        const { data, error } = await supabase
          .from('products')
          .select('id, name, unit')
          .order('name')
          .limit(50)

        if (error) throw error
        setProducts((data as Product[] | null) ?? [])
        setCurrentPage(1)
        return
      }

      // 検索語がある場合はサーバー側で絞り込み
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit')
        .ilike('name', `%${searchTerm}%`)
        .order('name')
        .limit(5000)  // 最大5000件まで

      if (error) throw error

      console.log('商品検索結果:', data?.length || 0, '件')
      setProducts((data as Product[] | null) ?? [])
      setCurrentPage(1)
    } catch (e: any) {
      console.error('商品検索エラー:', e?.message ?? String(e))
      setMessage(`商品検索エラー: ${e?.message ?? String(e)}`)
    }
  }

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
          mapped_code: pid, // 初期値は現在のproduct_id
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
    console.log('setRowCode:', { detailId, code })
    setDetails((prev) =>
      prev.map((r) => (r.detailId === detailId ? { ...r, mapped_code: code } : r))
    )
  }

  function handleOpenProductModal(detailId: number) {
    setSelectedRowId(detailId)
    const row = details.find(r => r.detailId === detailId)
    // 現在の商品名を検索窓にセット（検索は実行しない）
    let searchText = row?.product_name || ''
    // 「-」で始まる場合や削除された商品の場合は空にする
    if (searchText === '-' || searchText.startsWith('削除された商品')) {
      searchText = ''
    }
    setProductSearchTerm(searchText)
    setCurrentPage(1)
    // 初期表示は最初の50件（検索は実行しない）
    setProducts([])
    fetchProducts()
    setShowProductModal(true)
  }

  function handleSearchChange(value: string) {
    setProductSearchTerm(value)
    searchProducts(value)  // Supabaseで検索実行
  }

  function handleSelectProduct(productId: string) {
    console.log('handleSelectProduct:', { productId, selectedRowId })
    if (selectedRowId !== null) {
      setRowCode(selectedRowId, productId)
      setShowProductModal(false)
      setSelectedRowId(null)
      setProductSearchTerm('')
    }
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

    // mapped_codeが設定されており、かつcurrent_product_idと異なる行のみを変更対象とする
    const changed = details.filter((r) => 
      r.mapped_code && 
      r.mapped_code.trim() !== '' && 
      r.mapped_code !== r.current_product_id
    )
    
    console.log('変更検出:', { 
      total: details.length, 
      changed: changed.length,
      sample: changed[0] ? {
        detailId: changed[0].detailId,
        current: changed[0].current_product_id,
        mapped: changed[0].mapped_code
      } : null
    })
    
    if (changed.length === 0) {
      setMessage('変更がありません')
      return
    }

    if (!confirm(`${changed.length}件の商品コードを更新します。よろしいですか？`)) {
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
      alert(`✅ 更新完了\nOK: ${ok}件 / NG: ${ng}件`)

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
    fetchProducts()
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
            >コード置換（商品マスタ
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
              クイック変換
            </div>

            <div className="text-xs mb-2" style={{ color: 'rgba(255,255,255,.75)' }}>
              全ての明細行を選択したコードに一括変換します
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_MAPPING_OPTIONS.map((o) => (
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
                      商品検索
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
                      <td colSpan={10} className="px-4 py-6 text-sm text-center" style={{ color: 'rgba(255,255,255,.7)' }}>
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
                            className="w-full px-2 py-1 rounded-md text-sm"
                            style={{
                              ...uiInputStyle(),
                              border: changed
                                ? '1px solid rgba(46,107,255,0.5)'
                                : '1px solid rgba(255,255,255,0.12)',
                              backgroundImage: 'none',
                            }}
                          >
                            <option value={r.current_product_id} style={{ background: '#0a1628', color: '#eaf1ff' }}>(変更なし)</option>
                            <optgroup label="── よく使う ──" style={{ background: '#0a1628', color: '#eaf1ff' }}>
                              {QUICK_MAPPING_OPTIONS.map((o) => (
                                <option key={o.code} value={o.code} style={{ background: '#0a1628', color: '#eaf1ff' }}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="── 商品マスタ全件 ──" style={{ background: '#0a1628', color: '#eaf1ff' }}>
                              {products.map((p) => (
                                <option key={p.id} value={p.id} style={{ background: '#0a1628', color: '#eaf1ff' }}>
                                  {p.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </td>

                        <td className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <button
                            onClick={() => handleOpenProductModal(r.detailId)}
                            className="px-3 py-1 rounded-md text-sm font-bold"
                            style={{
                              background: '#0aa34f',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            🔍 検索
                          </button>
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
              ※ ドロップダウンでコードを選択、または「🔍 検索」ボタンで商品を検索できます。「変更を保存」で確定します。
            </div>
          </div>
        </div>
      </div>

      {/* 商品検索モーダル */}
      {showProductModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => {
            setShowProductModal(false)
            setSelectedRowId(null)
            setProductSearchTerm('')
          }}
        >
          <div
            className="rounded-lg p-6"
            style={{
              ...uiCardStyle(),
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: '#eaf1ff' }}>
                🔍 商品検索 <span className="text-sm font-normal">({products.length}件)</span>
              </h2>
              <button
                onClick={() => {
                  setShowProductModal(false)
                  setSelectedRowId(null)
                  setProductSearchTerm('')
                }}
                className="px-3 py-1 rounded-md font-bold"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#eaf1ff' }}
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="商品名で検索..."
                  value={productSearchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-md"
                  style={uiInputStyle()}
                  autoFocus
                />
                {productSearchTerm && (
                  <button
                    onClick={() => {
                      setProductSearchTerm('')
                      setCurrentPage(1)
                    }}
                    className="px-4 py-2 rounded-md font-bold"
                    style={{ background: 'rgba(255,255,255,0.12)', color: '#eaf1ff' }}
                  >
                    クリア
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <div className="text-sm" style={{ color: 'rgba(255,255,255,.75)' }}>
                検索結果: {products.length}件
                {products.length > 0 && (
                  <span className="ml-2">
                    （{((currentPage - 1) * itemsPerPage) + 1}〜{Math.min(currentPage * itemsPerPage, products.length)}件目を表示）
                  </span>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded-md text-sm font-bold"
                    style={{
                      background: currentPage === 1 ? 'rgba(255,255,255,0.06)' : 'rgba(46,107,255,0.5)',
                      color: currentPage === 1 ? 'rgba(255,255,255,0.3)' : '#eaf1ff',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ← 前
                  </button>
                  <span className="text-sm" style={{ color: '#eaf1ff' }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded-md text-sm font-bold"
                    style={{
                      background: currentPage === totalPages ? 'rgba(255,255,255,0.06)' : 'rgba(46,107,255,0.5)',
                      color: currentPage === totalPages ? 'rgba(255,255,255,0.3)' : '#eaf1ff',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    次 →
                  </button>
                </div>
              )}
            </div>

            {products.length === 0 && (
              <div className="mb-4 px-4 py-3 rounded-md text-sm" style={{ background: 'rgba(255,165,0,0.15)', color: '#ffa500', border: '1px solid rgba(255,165,0,0.3)' }}>
                ⚠️ 商品マスタが読み込まれていません。ページを再読み込みしてください。
              </div>
            )}

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1 }}>
                  <tr style={{ color: 'rgba(255,255,255,.85)' }}>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      商品ID
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      商品名
                    </th>
                    <th className="px-3 py-2 text-left text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      単位
                    </th>
                    <th className="px-3 py-2 text-center text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      選択
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-sm text-center" style={{ color: 'rgba(255,255,255,.7)' }}>
                        該当する商品が見つかりません
                      </td>
                    </tr>
                  )}
                  {paginatedProducts.map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        color: '#eaf1ff',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <td className="px-3 py-2 text-xs font-mono">{p.id}</td>
                      <td className="px-3 py-2 text-sm">{p.name}</td>
                      <td className="px-3 py-2 text-sm">{p.unit || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleSelectProduct(p.id)}
                          className="px-3 py-1 rounded-md text-sm font-bold"
                          style={{
                            background: '#2e6bff',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          選択
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 px-4 py-3 rounded-md text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,.75)' }}>
              💡 ヒント: 商品名の一部を入力すると絞り込まれます。1ページに{itemsPerPage}件ずつ表示されます。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
