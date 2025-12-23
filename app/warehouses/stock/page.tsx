"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"

type Warehouse = { id: string; name: string }

type ViewRow = {
  warehouse_id: string
  warehouse_name: string
  product_id: string
  product_name: string
  stock_qty: number
  updated_at?: string
  created_at?: string
}

function WarehouseStockPageContent() {
  const searchParams = useSearchParams()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWh, setSelectedWh] = useState<string>("")
  const [inbounds, setInbounds] = useState<ViewRow[]>([])
  const [outbounds, setOutbounds] = useState<ViewRow[]>([])
  const [stocks, setStocks] = useState<ViewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ in?: string; out?: string; stock?: string }>()
  // 管理UI用状態
  const [stockSearch, setStockSearch] = useState("")
  const [editingQty, setEditingQty] = useState<Record<string, number>>({})
  const [showProductModal, setShowProductModal] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [products, setProducts] = useState<Array<{ id: string; name: string; spec?: string; unit?: string }>>([])
  const [newStockQty, setNewStockQty] = useState<number>(0)
  const [productPage, setProductPage] = useState<number>(0)
  const [productPageSize, setProductPageSize] = useState<number>(50)
  const [productTotalCount, setProductTotalCount] = useState<number>(0)
  const [productError, setProductError] = useState<string>("")

  useEffect(() => {
    const loadWarehouses = async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name").order("id")
      if (!error) setWarehouses((data || []).map((w: any) => ({ id: String(w.id), name: w.name || "" })))
    }
    loadWarehouses()
  }, [])

  // クエリから初期選択を反映
  useEffect(() => {
    const q = searchParams?.get('warehouse_id')
    if (q) setSelectedWh(q)
  }, [searchParams])

  useEffect(() => {
    if (!selectedWh) return
    const run = async () => {
      setLoading(true)
      setErrors({})
      try {
        // ビューを使用して入庫データを取得（product_name自動取得）
        const { data: ins, error: inErr } = await supabase
          .from("v_warehouse_inbounds")
          .select("*")
          .eq("warehouse_id", selectedWh)
        
        if (inErr) {
          console.warn('入庫ビュー取得エラー:', inErr.message)
          setErrors((e) => ({ ...e, in: inErr.message }))
        } else {
          setInbounds(ins || [])
        }

        // ビューを使用して出庫データを取得（product_name自動取得）
        const { data: outs, error: outErr } = await supabase
          .from("v_warehouse_outbounds")
          .select("*")
          .eq("warehouse_id", selectedWh)
        
        if (outErr) {
          console.warn('出庫ビュー取得エラー:', outErr.message)
          setErrors((e) => ({ ...e, out: outErr.message }))
        } else {
          setOutbounds(outs || [])
        }

        // ビューを使用して在庫データを取得（product_name自動取得）
        const { data: sts, error: stErr } = await supabase
          .from("v_warehouse_stocks")
          .select("*")
          .eq("warehouse_id", selectedWh)
        
        if (stErr) {
          console.warn('在庫ビュー取得エラー:', stErr.message)
          setErrors((e) => ({ ...e, stock: stErr.message }))
        } else {
          setStocks(sts || [])
          // 編集用初期値
          const init: Record<string, number> = {}
          for (const r of sts || []) {
            init[r.product_id] = Number(r.stock_qty || 0)
          }
          setEditingQty(init)
        }
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [selectedWh])

  const filteredStocks = stocks.filter((s) =>
    !stockSearch || (s.product_name || '').toLowerCase().includes(stockSearch.toLowerCase())
  )

  // 数量列名を検出
  const detectStockQtyColumnName = async () => {
    let stockQtyColumnName = 'stock_qty'
    const { data } = await supabase.from('warehouse_stocks').select('*').limit(1)
    const sample = data && data[0]
    if (sample) {
      if ('stock_qty' in sample) stockQtyColumnName = 'stock_qty'
      else if ('quantity' in sample) stockQtyColumnName = 'quantity'
      else if ('qty' in sample) stockQtyColumnName = 'qty'
      else if ('stock' in sample) stockQtyColumnName = 'stock'
    }
    return stockQtyColumnName
  }

  const refreshStocks = async () => {
    if (!selectedWh) return
    const { data } = await supabase
      .from('v_warehouse_stocks')
      .select('*')
      .eq('warehouse_id', selectedWh)
    setStocks(data || [])
    const init: Record<string, number> = {}
    for (const r of data || []) init[r.product_id] = Number(r.stock_qty || 0)
    setEditingQty(init)
  }

  const updateStockQty = async (productId: string) => {
    if (!selectedWh) {
      alert('倉庫を選択してください')
      return
    }
    const nextQty = Number(editingQty[productId] ?? 0)
    if (nextQty < 0) {
      alert('在庫数は0以上を入力してください')
      return
    }
    const col = await detectStockQtyColumnName()
    const rec: any = { warehouse_id: selectedWh, product_id: productId }
    rec[col] = nextQty
    const { error } = await supabase
      .from('warehouse_stocks')
      .upsert([rec], { onConflict: 'warehouse_id,product_id' })
    if (error) {
      alert('在庫更新に失敗しました: ' + error.message)
      return
    }
    await refreshStocks()
    alert('在庫を更新しました')
  }

  const openProductModal = async () => {
    setShowProductModal(true)
    setProductSearch('')
    setNewStockQty(0)
    setProductPage(0)
    await searchProducts('', 0, productPageSize)
  }

  const searchProducts = async (keyword: string, page?: number, pageSizeOverride?: number) => {
    setProductError('')
    const pageSize = pageSizeOverride ?? productPageSize
    const pageToUse = typeof page === 'number' ? page : productPage
    const start = pageToUse * pageSize
    const end = start + pageSize - 1
    let q = supabase
      .from('products')
      // spec列が存在しない環境があるためワイルドカードで取得
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(start, end)
    if (keyword) q = q.ilike('name', `%${keyword}%`)
    const { data, error, count } = await q
    if (error) {
      const msg = '商品検索に失敗しました: ' + error.message
      setProductError(msg)
      alert(msg)
      return
    }
    setProducts((data || []).map((p: any) => ({
      id: String(p.id),
      name: p.name || '',
      spec: p.spec || p.product_spec || '',
      unit: p.unit || '',
    })))
    setProductTotalCount(count || 0)
    if (typeof page === 'number') setProductPage(page)
  }

  const registerStock = async (productId: string) => {
    if (!selectedWh) {
      alert('倉庫を選択してください')
      return
    }
    const qty = Number(newStockQty)
    if (!Number.isFinite(qty) || qty < 0) {
      alert('登録する在庫数は0以上で入力してください')
      return
    }
    const col = await detectStockQtyColumnName()
    const rec: any = { warehouse_id: selectedWh, product_id: productId }
    rec[col] = qty
    const { error } = await supabase
      .from('warehouse_stocks')
      .upsert([rec], { onConflict: 'warehouse_id,product_id' })
    if (error) {
      alert('在庫登録に失敗しました: ' + error.message)
      return
    }
    setShowProductModal(false)
    await refreshStocks()
    alert('在庫を登録しました')
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", color: "#e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>倉庫在庫一覧</h1>
        <Link href="/selectors">
          <button className="btn-3d btn-reset">← メニューに戻る</button>
        </Link>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label>倉庫</label>
        <select
          value={selectedWh}
          onChange={(e) => setSelectedWh(e.target.value)}
          style={{ border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", padding: "6px 10px", borderRadius: 6 }}
        >
          <option value="">選択してください</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.id} - {w.name}
            </option>
          ))}
        </select>
        {loading && <span style={{ color: "#94a3b8" }}>読み込み中...</span>}
      </div>

      {errors && (errors.in || errors.out || errors.stock) && (
        <div style={{ marginBottom: 16, color: "#fca5a5" }}>
          {errors.in && <div>入庫ビュー取得エラー: {errors.in}</div>}
          {errors.out && <div>出庫ビュー取得エラー: {errors.out}</div>}
          {errors.stock && <div>在庫ビュー取得エラー: {errors.stock}</div>}
          <div style={{ color: "#94a3b8", marginTop: 4 }}>
            Supabaseでビューが作成されているか確認してください: v_warehouse_inbounds, v_warehouse_outbounds, v_warehouse_stocks
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Section title="入庫一覧" rows={inbounds} />
        <Section title="出庫一覧" rows={outbounds} />
        <Section title="在庫一覧" rows={filteredStocks} />
      </div>

      {/* 在庫管理UI */}
      {selectedWh && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>在庫登録・更新</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <button
              className="btn-3d"
              onClick={openProductModal}
              style={{ backgroundColor: '#f87171', color: '#0f172a', borderColor: '#dc2626', fontWeight: 'bold' }}
            >
              在庫追加
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#0b1220' }}>
            <thead>
              <tr>
                <Th style={{ width: '45%' }}>品名</Th>
                <Th style={{ width: '20%' }}>現在在庫</Th>
                <Th style={{ width: '20%' }}>変更後在庫</Th>
                <Th style={{ width: '15%' }}>操作</Th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map((s) => (
                <tr key={s.product_id}>
                  <Td>{s.product_name || '不明'}</Td>
                  <Td>{s.stock_qty}</Td>
                  <Td>
                    <input
                      type="number"
                      value={editingQty[s.product_id] ?? s.stock_qty ?? 0}
                      onChange={(e) => setEditingQty((prev) => ({ ...prev, [s.product_id]: Number(e.target.value) }))}
                      style={{ width: 120, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', padding: '4px 8px', borderRadius: 6 }}
                    />
                  </Td>
                  <Td>
                    <button className="btn-3d" onClick={() => updateStockQty(s.product_id)}>更新</button>
                  </Td>
                </tr>
              ))}
              {filteredStocks.length === 0 && (
                <tr>
                  <Td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>在庫がありません</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 商品検索・在庫登録モーダル */}
      {showProductModal && (
        <div className="fixed inset-0" style={{ background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 12 }}>
          <div style={{ background: '#0b1220', border: '1px solid #334155', borderRadius: 8, padding: 16, width: 760, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>在庫追加</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={productSearch}
                onChange={async (e) => { setProductSearch(e.target.value); await searchProducts(e.target.value, 0) }}
                placeholder="商品名検索"
                style={{ border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', padding: '6px 10px', borderRadius: 6, width: 300 }}
              />
              <select
                value={productPageSize}
                onChange={async (e) => { const size = Number(e.target.value); setProductPageSize(size); await searchProducts(productSearch, 0, size) }}
                style={{ border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', padding: '6px 10px', borderRadius: 6 }}
              >
                <option value={20}>20件/頁</option>
                <option value={50}>50件/頁</option>
                <option value={100}>100件/頁</option>
              </select>
              <button className="btn-3d" onClick={() => setShowProductModal(false)}>閉じる</button>
            </div>

            {productError && (
              <div style={{ color: '#fca5a5' }}>{productError}</div>
            )}

            {/* ページャ */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#cbd5e1' }}>
              <span>総件数: {productTotalCount}</span>
              <span>ページ: {productPage + 1} / {Math.max(1, Math.ceil(productTotalCount / productPageSize))}</span>
              <button
                className="btn-3d"
                onClick={async () => { if (productPage > 0) await searchProducts(productSearch, productPage - 1) }}
                disabled={productPage <= 0}
              >前へ</button>
              <button
                className="btn-3d"
                onClick={async () => { const totalPages = Math.ceil(productTotalCount / productPageSize); if (productPage + 1 < totalPages) await searchProducts(productSearch, productPage + 1) }}
                disabled={productPage + 1 >= Math.max(1, Math.ceil(productTotalCount / productPageSize))}
              >次へ</button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #334155', borderRadius: 6, background: '#0b1220' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
                  <tr>
                    <Th style={{ width: '50%' }}>商品名</Th>
                    <Th style={{ width: '20%' }}>規格</Th>
                    <Th style={{ width: '10%' }}>単位</Th>
                    <Th style={{ width: '20%' }}>初期在庫</Th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <Td>{p.name}</Td>
                      <Td>{p.spec || ''}</Td>
                      <Td>{p.unit || ''}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="number"
                            value={newStockQty}
                            onChange={(e) => setNewStockQty(Number(e.target.value))}
                            style={{ width: 120, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', padding: '4px 8px', borderRadius: 6 }}
                          />
                          <button className="btn-3d" onClick={() => registerStock(p.id)}>登録</button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <Td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>商品がありません</Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: ViewRow[] }) {
  const th: React.CSSProperties = {
    border: "1px solid #334155",
    padding: "6px 8px",
    background: "#1e293b",
    textAlign: "left",
    fontSize: 12,
    color: "#e2e8f0",
    fontWeight: "bold",
  }
  const td: React.CSSProperties = {
    border: "1px solid #334155",
    padding: "6px 8px",
    fontSize: 12,
    color: "#cbd5e1",
  }
  
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#0b1220" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "20%" }}>商品コード</th>
            <th style={{ ...th, width: "50%" }}>品名</th>
            <th style={{ ...th, width: "30%" }}>数量</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <td style={td}>{r.product_id || '不明'}</td>
              <td style={td}>{r.product_name || '不明'}</td>
              <td style={td}>{r.stock_qty}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: "center", color: "#94a3b8" }}>
                データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// 共通テーブルセル
function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{ border: '1px solid #334155', padding: '6px 8px', background: '#1e293b', textAlign: 'left', fontSize: 12, color: '#e2e8f0', fontWeight: 'bold', ...(style || {}) }}>{children}</th>
  )
}
function Td({ children, style, colSpan }: { children: React.ReactNode; style?: React.CSSProperties; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ border: '1px solid #334155', padding: '6px 8px', fontSize: 12, color: '#cbd5e1', ...(style || {}) }}>{children}</td>
  )
}

function WarehouseStockPageWithSuspense() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <WarehouseStockPageContent />
    </Suspense>
  )
}

export default WarehouseStockPageWithSuspense
