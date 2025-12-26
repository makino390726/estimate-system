"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"

interface MovementRow {
  warehouse_id: string
  product_id: string
  movement_date: string
  product_name: string
  warehouse_name: string
  inbound_qty: number
  outbound_qty: number
  stock_after: number
  status?: string
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 1600,
  margin: "0 auto",
  background: "#0f172a",
  minHeight: "100vh",
  color: "#e2e8f0",
}

const thStyle: React.CSSProperties = {
  border: "1px solid #334155",
  padding: "8px 10px",
  background: "#1e293b",
  textAlign: "left",
  fontSize: 12,
  color: "#e2e8f0",
  fontWeight: "bold",
}

const tdStyle: React.CSSProperties = {
  border: "1px solid #334155",
  padding: "8px 10px",
  fontSize: 12,
  color: "#cbd5e1",
}

export default function WarehouseMovesPage() {
  const [rows, setRows] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(false)
  const [warehouseMap, setWarehouseMap] = useState<Map<string, string>>(new Map())
  const [searchWarehouse, setSearchWarehouse] = useState("")
  const [warehouseList, setWarehouseList] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const [outRes, inRes, stockRes, warehouseRes] = await Promise.all([
        supabase
          .from("v_warehouse_outbounds")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("v_warehouse_inbounds")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("warehouse_stocks")
          .select("warehouse_id, product_id, stock_qty"),
        supabase
          .from("warehouses")
          .select("id, name"),
      ])

      if (outRes.error) {
        console.error("出庫データ取得エラー:", outRes.error)
        return
      }

      // 倉庫マップを作成
      const whMap = new Map<string, string>()
      const whList: Array<{ id: string; name: string }> = []
      ;(warehouseRes.data || []).forEach((w: any) => {
        whMap.set(String(w.id), w.name || "")
        whList.push({ id: String(w.id), name: w.name || "" })
      })

      // 在庫マップを作成
      const stockMap = new Map<string, number>()
      ;(stockRes.data || []).forEach((s: any) => {
        stockMap.set(`${s.warehouse_id}__${s.product_id}`, Number(s.stock_qty || 0))
      })

      // 入出庫を日付・倉庫・商品単位で統合（現預金出納帳形式）
      const combinedMap = new Map<string, MovementRow & { base_stock: number }>()

      // 倉庫移動時に「移動元」を特定するため、同日・同商品IDの出庫側をマップしておく
      const outboundSourceMap = new Map<string, string>() // key: date__product_id => warehouse_id
      ;(outRes.data || []).forEach((row: any) => {
        const movementDate = row.created_at?.split('T')[0] || ''
        const productId = String(row.product_id)
        const key = `${movementDate}__${productId}`
        if (!outboundSourceMap.has(key)) {
          outboundSourceMap.set(key, String(row.warehouse_id))
        }
      })

      // 出庫データ
      ;(outRes.data || []).forEach((row: any) => {
        const warehouseId = String(row.warehouse_id)
        const productId = String(row.product_id)
        const movementDate = row.created_at?.split('T')[0] || ''
        const stockKey = `${warehouseId}__${productId}`
        const currentStock = Number(stockMap.get(stockKey) ?? 0)
        const qty = Number(row.stock_qty ?? 0)
        const displayWarehouseName = row.status === "移動伝票"
          ? "移動伝票"
          : (whMap.get(warehouseId) || warehouseId)

        const key = `${movementDate}__${warehouseId}__${productId}`
        const existing = combinedMap.get(key)
        if (existing) {
          existing.outbound_qty += qty
          existing.status = existing.status || row.status
        } else {
          combinedMap.set(key, {
            warehouse_id: warehouseId,
            product_id: productId,
            movement_date: movementDate,
            product_name: row.product_name || productId,
            warehouse_name: displayWarehouseName,
            inbound_qty: 0,
            outbound_qty: qty,
            base_stock: currentStock,
            stock_after: 0, // 後で算出
            status: row.status,
          })
        }
      })

      // 入庫データ
      ;(inRes.data || []).forEach((row: any) => {
        const warehouseId = String(row.warehouse_id)
        const productId = String(row.product_id)
        const movementDate = row.created_at?.split('T')[0] || ''
        const stockKey = `${warehouseId}__${productId}`
        const currentStock = Number(stockMap.get(stockKey) ?? 0)
        const qty = Number(row.stock_qty ?? 0)
        // 倉庫移動の入庫は「移動元」の倉庫名を表示したいので、同日・同商品IDの出庫側倉庫を優先
        const sourceWarehouseIdForMove = row.status === "倉庫移動"
          ? outboundSourceMap.get(`${movementDate}__${productId}`)
          : undefined

        const displayWarehouseName = row.status === "移動伝票"
          ? "移動伝票"
          : sourceWarehouseIdForMove
            ? (whMap.get(sourceWarehouseIdForMove) || sourceWarehouseIdForMove)
            : (whMap.get(warehouseId) || warehouseId)

        const key = `${movementDate}__${warehouseId}__${productId}`
        const existing = combinedMap.get(key)
        if (existing) {
          existing.inbound_qty += qty
          existing.status = existing.status || row.status
        } else {
          combinedMap.set(key, {
            warehouse_id: warehouseId,
            product_id: productId,
            movement_date: movementDate,
            product_name: row.product_name || productId,
            warehouse_name: displayWarehouseName,
            inbound_qty: qty,
            outbound_qty: 0,
            base_stock: currentStock,
            stock_after: 0, // 後で算出
            status: row.status,
          })
        }
      })

      // 残高算出（倉庫在庫 + 入庫 - 出庫）
      const allMovements: MovementRow[] = Array.from(combinedMap.values()).map((r) => ({
        warehouse_id: r.warehouse_id,
        product_id: r.product_id,
        movement_date: r.movement_date,
        product_name: r.product_name,
        warehouse_name: r.warehouse_name,
        inbound_qty: r.inbound_qty,
        outbound_qty: r.outbound_qty,
        stock_after: r.base_stock + r.inbound_qty - r.outbound_qty,
      }))

      // 日付順にソート（新しい順）
      allMovements.sort((a, b) =>
        new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime()
      )

      setWarehouseMap(whMap)
      setWarehouseList(whList)
      setRows(allMovements)
    } finally {
      setLoading(false)
    }
  }

  const filteredRows = useMemo(() => {
    if (!searchWarehouse) return rows
    return rows.filter((r) => r.warehouse_id === searchWarehouse)
  }, [rows, searchWarehouse])

  const table = useMemo(() => {
    if (loading) return <p>読み込み中...</p>
    if (!filteredRows.length) return <p style={{ color: "#94a3b8" }}>該当データがありません。</p>

    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 100 }}>移動日</th>
            <th style={{ ...thStyle, width: 280 }}>品名</th>
            <th style={{ ...thStyle, width: 150 }}>倉庫名</th>
            <th style={{ ...thStyle, width: 80, textAlign: "right" }}>入庫</th>
            <th style={{ ...thStyle, width: 80, textAlign: "right" }}>出庫</th>
            <th style={{ ...thStyle, width: 100, textAlign: "right" }}>在庫（残高）</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((r, idx) => (
            <tr key={idx}>
              <td style={tdStyle}>{r.movement_date}</td>
              <td style={tdStyle}>{r.product_name}</td>
              <td style={tdStyle}>{r.warehouse_name}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{r.inbound_qty || ""}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{r.outbound_qty || ""}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{isNaN(r.stock_after) ? "-" : r.stock_after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }, [filteredRows, loading])

  return (
    <div style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: "#93c5fd" }}>倉庫移動履歴</h1>
        <Link href="/cases/orders">
          <button className="btn-3d btn-reset" style={{ padding: "8px 16px", background: "#16a34a", border: "1px solid #15803d", color: "#fff" }}>
            ← 一覧に戻る
          </button>
        </Link>
      </div>
      <p style={{ color: "#94a3b8", marginTop: 0, marginBottom: 12 }}>
        倉庫移動・移動伝票の履歴を現預金出納帳形式で表示します。入庫・出庫・在庫（残高）を確認できます。
      </p>
      <div style={{ marginBottom: 16 }}>
        <select
          value={searchWarehouse}
          onChange={(e) => setSearchWarehouse(e.target.value)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #334155",
            borderRadius: 4,
            background: "#1e293b",
            color: "#e2e8f0",
            width: 300,
            cursor: "pointer",
          }}
        >
          <option value="">すべて表示</option>
          {warehouseList.map((wh) => (
            <option key={wh.id} value={wh.id}>
              {wh.name}
            </option>
          ))}
        </select>
        {searchWarehouse && (
          <button
            onClick={() => setSearchWarehouse("")}
            style={{
              marginLeft: 8,
              padding: "8px 12px",
              background: "#64748b",
              border: "1px solid #475569",
              color: "#fff",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            すべて表示に戻る
          </button>
        )}
      </div>
      {table}
    </div>
  )
}
