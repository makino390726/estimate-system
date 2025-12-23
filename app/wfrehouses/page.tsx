"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"

interface WarehouseRow {
  id: string
  name: string
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

export default function WarehousesPage() {
  const [rows, setRows] = useState<WarehouseRow[]>([])
  const [originalRows, setOriginalRows] = useState<WarehouseRow[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [search, setSearch] = useState<string>("")
  const [showModal, setShowModal] = useState<boolean>(false)
  const [editMode, setEditMode] = useState<"new" | "edit">("new")
  const [formId, setFormId] = useState<string>("")
  const [formName, setFormName] = useState<string>("")

  useEffect(() => {
    fetchWarehouses()
  }, [])

  const fetchWarehouses = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .order("id")

      if (error) throw error
      const list: WarehouseRow[] = (data || []).map((w: any) => ({
        id: String(w.id || ""),
        name: w.name || "",
      }))
      setRows(list)
      setOriginalRows(list)
    } catch (e) {
      console.error("倉庫一覧取得エラー:", e)
      alert("倉庫一覧の取得でエラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  const openNew = () => {
    setEditMode("new")
    setFormId("")
    setFormName("")
    setShowModal(true)
  }

  const openEdit = (row: WarehouseRow) => {
    setEditMode("edit")
    setFormId(String(row.id))
    setFormName(row.name)
    setShowModal(true)
  }

  const saveWarehouse = async () => {
    if (!formId.trim()) {
      alert("IDを入力してください")
      return
    }
    if (!formName.trim()) {
      alert("倉庫名を入力してください")
      return
    }
    try {
      if (editMode === "new") {
        // 重複チェック（ID）
        const { data: exist } = await supabase
          .from("warehouses")
          .select("id")
          .eq("id", formId.trim())
          .limit(1)

        if ((exist || []).length > 0) {
          alert("同じIDの倉庫が既に存在します")
          return
        }

        const { error } = await supabase
          .from("warehouses")
          .insert({ id: formId.trim(), name: formName.trim() })

        if (error) throw error
        alert("登録しました")
      } else {
        const { error } = await supabase
          .from("warehouses")
          .update({ name: formName.trim() })
          .eq("id", formId.trim())

        if (error) throw error
        alert("更新しました")
      }
      setShowModal(false)
      await fetchWarehouses()
    } catch (e: any) {
      console.error("倉庫保存エラー:", e)
      alert(`保存に失敗しました: ${e?.message || e}`)
    }
  }

  const deleteWarehouse = async (id: string) => {
    if (!confirm(`倉庫ID: ${id} を削除しますか？`)) return
    try {
      const { error } = await supabase
        .from("warehouses")
        .delete()
        .eq("id", id)

      if (error) throw error
      alert("削除しました")
      await fetchWarehouses()
    } catch (e: any) {
      console.error("倉庫削除エラー:", e)
      alert(`削除に失敗しました: ${e?.message || e}`)
    }
  }

  const handleSearch = () => {
    if (!search.trim()) {
      setRows(originalRows)
      return
    }
    const keyword = search.trim()
    setRows(
      originalRows.filter(
        (r) => r.id.includes(keyword) || r.name.includes(keyword)
      )
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: "#93c5fd" }}>倉庫登録</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="IDまたは名称で検索"
            style={{ border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", padding: "6px 10px", borderRadius: 6 }}
          />
          <button onClick={handleSearch} className="btn-3d btn-primary" style={{ padding: "8px 12px" }}>検索</button>
          <button onClick={openNew} className="btn-3d btn-primary" style={{ padding: "8px 12px" }}>新規登録</button>
          <Link href="/selectors">
            <button className="btn-3d btn-reset" style={{ padding: "8px 12px", backgroundColor: "#16a34a", border: "1px solid #15803d", color: "#fff" }}>← メニューに戻る</button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#1e293b" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 200 }}>ID</th>
              <th style={{ ...thStyle, width: 400 }}>名称</th>
              <th style={{ ...thStyle, width: 260 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>{r.id}</td>
                <td style={tdStyle}>{r.name}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(r)} className="btn-3d btn-search" style={{ fontSize: 11, padding: "4px 10px" }}>編集</button>
                    <a href={`/warehouses/stock?warehouse_id=${encodeURIComponent(r.id)}`}>
                      <button className="btn-3d" style={{ fontSize: 11, padding: "4px 10px", backgroundColor: "#0ea5e9", color: "#fff" }}>在庫管理</button>
                    </a>
                    <button onClick={() => deleteWarehouse(r.id)} className="btn-3d" style={{ fontSize: 11, padding: "4px 10px", backgroundColor: "#dc3545", color: "#fff" }}>削除</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#94a3b8" }}>データがありません</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="fixed inset-0" style={{ position: "fixed", inset: 0 as any, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 16, minWidth: 420 }}>
            <h3 style={{ marginTop: 0, color: "#93c5fd" }}>{editMode === "new" ? "倉庫新規登録" : "倉庫編集"}</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ fontSize: 12, color: "#cbd5e1" }}>ID（担当者IDをセット）</label>
              <input
                type="text"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                readOnly={editMode === "edit"}
                style={{ border: "1px solid #334155", background: editMode === "edit" ? "#0f172a" : "#0f172a", color: "#e2e8f0", padding: "8px 10px", borderRadius: 6 }}
              />
              <label style={{ fontSize: 12, color: "#cbd5e1" }}>名称</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                style={{ border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", padding: "8px 10px", borderRadius: 6 }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={() => setShowModal(false)} className="btn-3d btn-reset">キャンセル</button>
                <button onClick={saveWarehouse} className="btn-3d btn-primary">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
