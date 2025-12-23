"use client"

import React, { useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export default function WarehouseInitPage() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const runImport = async () => {
    setRunning(true)
    setResult(null)
    try {
      // 担当者一覧を取得
      const { data: staffs, error: staffErr } = await supabase
        .from("staffs")
        .select("id, name")
        .order("name")

      if (staffErr) throw staffErr

      const staffList = (staffs || []).map((s: any) => ({ id: String(s.id), name: s.name || "" }))

      if (staffList.length === 0) {
        setResult("担当者が存在しませんでした（挿入なし）")
        return
      }

      // 既存の倉庫IDを取得（重複挿入回避）
      const { data: whs, error: whErr } = await supabase
        .from("warehouses")
        .select("id")

      if (whErr) throw whErr

      const existingIds = new Set((whs || []).map((w: any) => String(w.id)))

      // 追加対象を作成
      const toInsert = staffList
        .filter((s) => s.id && !existingIds.has(s.id))
        .map((s) => ({ id: s.id, name: `${s.name || ""}倉庫` }))

      if (toInsert.length === 0) {
        setResult("全担当者分の倉庫が既に作成済みです（挿入なし）")
        return
      }

      const { error: insErr } = await supabase
        .from("warehouses")
        .insert(toInsert)

      if (insErr) throw insErr

      setResult(`作成件数: ${toInsert.length} 件（id=担当者ID, name=担当者名+"倉庫"）`)
    } catch (e: any) {
      setResult(`エラー: ${e?.message || e}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>倉庫一括作成（id=担当者ID）</h1>
      <p style={{ color: "#64748b" }}>
        staffs テーブルの ID を warehouses.id に、担当者名+"倉庫" を warehouses.name に一括作成します。既存IDはスキップします。
      </p>
      <button
        onClick={runImport}
        disabled={running}
        className="btn-3d btn-primary"
        style={{ padding: "8px 16px" }}
      >
        {running ? "実行中..." : "一括作成を実行"}
      </button>
      {result && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #334155", borderRadius: 8 }}>
          {result}
        </div>
      )}
    </div>
  )
}
