"use client"

import React, { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useReactToPrint } from "react-to-print"
import PrintPurchaseOrder from "../new/order/PrintPurchaseOrder"
import Link from "next/link"

interface CaseRow {
  case_id: string
  case_no: string | number | null
  subject: string
  created_date: string
  status: string
  customer_id: string | null
  staff_id: string | null
  department: string | null
  purchaser_name: string | null
  coreplus_no?: string | null
  source_warehouse_name?: string | null
  destination_warehouse_name?: string | null
}

interface DetailRow {
  case_id: string
  product_id: string | null
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  remarks?: string | null
}

interface EnrichedCase extends CaseRow {
  customer_name: string
  staff_name: string
  details: DetailRow[]
  discount: number
  tax_rate: number
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

export default function OrderListPage() {
  const [orders, setOrders] = useState<EnrichedCase[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printCaseData, setPrintCaseData] = useState<EnrichedCase | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [staffs, setStaffs] = useState<Array<{ id: string; name: string; stamp_path: string | null }>>([])
  const [branchManagers, setBranchManagers] = useState<Map<string, string>>(new Map())
  const [finalApprovers, setFinalApprovers] = useState<Map<string, string>>(new Map())
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [staffFilter, setStaffFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [exporting, setExporting] = useState(false)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
  })

  useEffect(() => {
    fetchStaffs()
    fetchOrders()
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [startDate, endDate, statusFilter, staffFilter])

  const fetchStaffs = async () => {
    const { data, error } = await supabase
      .from("staffs")
      .select("id, name, stamp_path")
      .order("name")

    if (!error && data) {
      setStaffs(data)
    }
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from("cases")
        .select("*")
        .in("status", ["受注", "注文", "倉庫移動"])

      if (startDate) {
        query = query.gte("created_date", startDate)
      }
      if (endDate) {
        query = query.lte("created_date", endDate)
      }
      if (statusFilter) {
        query = query.eq("status", statusFilter)
      }

      const { data: casesData, error: casesError } = await query.order("created_date", { ascending: false })

      if (casesError) {
        console.error("案件取得エラー", casesError)
        return
      }

      const caseIds = (casesData || []).map((c) => c.case_id)
      if (caseIds.length === 0) {
        setOrders([])
        return
      }

      const staffIds = Array.from(
        new Set((casesData || []).map((c) => c.staff_id).filter(Boolean)),
      ) as string[]
      const customerIds = Array.from(
        new Set((casesData || []).map((c) => c.customer_id).filter(Boolean)),
      ) as string[]

      const staffPromise = staffIds.length
        ? supabase.from("staffs").select("id, name").in("id", staffIds)
        : Promise.resolve({ data: [], error: null })

      const customerPromise = customerIds.length
        ? supabase.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({ data: [], error: null })

      const detailPromise = caseIds.length
        ? supabase
            .from("case_details")
            .select("case_id, product_id, spec, unit, quantity, unit_price, amount, remarks, unregistered_product")
            .in("case_id", caseIds)
        : Promise.resolve({ data: [], error: null })

      const [{ data: staffData }, { data: customerData }, { data: detailData }] = await Promise.all([
        staffPromise,
        customerPromise,
        detailPromise,
      ])

      const staffMap = new Map((staffData || []).map((s: any) => [String(s.id), s.name]))
      const customerMap = new Map((customerData || []).map((c: any) => [c.id, c.name]))

      // products テーブルから商品名を取得
      const productIds = Array.from(
        new Set((detailData || []).map((d: any) => d.product_id).filter(Boolean)),
      )

      const productMap = new Map<string, string>()
      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from("products")
          .select("id, name")
          .in("id", productIds)

        if (productsData) {
          productsData.forEach((p: any) => {
            productMap.set(p.id, p.name)
          })
        }
      }

      const groupedDetails = new Map<string, DetailRow[]>()
      ;(detailData || []).forEach((d: any) => {
        const list = groupedDetails.get(d.case_id) || []
        const productName = productMap.get(d.product_id)
        list.push({
          case_id: d.case_id,
          product_id: d.product_id,
          item_name: d.unregistered_product || productName || d.product_id || "(無題)",
          spec: d.spec || "",
          unit: d.unit || "",
          quantity: d.quantity || 0,
          unit_price: d.unit_price || 0,
          amount: d.amount || 0,
          remarks: d.remarks || null,
        })
        groupedDetails.set(d.case_id, list)
      })

      let enriched: EnrichedCase[] = (casesData || []).map((c: any) => ({
        case_id: c.case_id,
        case_no: c.case_no || null,
        subject: c.subject || "(件名未入力)",
        created_date: c.created_date,
        status: c.status,
        customer_id: c.customer_id || null,
        staff_id: c.staff_id || null,
        department: c.department || "",
        purchaser_name: c.purchaser_name || "",
        coreplus_no: c.coreplus_no || null,
        source_warehouse_name: c.source_warehouse_name || null,
        destination_warehouse_name: c.destination_warehouse_name || null,
        customer_name: customerMap.get(c.customer_id) || c.customer_id || "-",
        staff_name: staffMap.get(String(c.staff_id)) || c.staff_id || "-",
        details: groupedDetails.get(c.case_id) || [],
        discount: c.discount || 0,
        tax_rate: c.tax_rate || 0.1,
      }))

      if (staffFilter.trim()) {
        const keyword = staffFilter.trim().toLowerCase()
        enriched = enriched.filter((c) => {
          const name = (c.staff_name || "").toLowerCase()
          const sid = c.staff_id ? String(c.staff_id).toLowerCase() : ""
          return name.includes(keyword) || sid.includes(keyword)
        })
      }

      setOrders(enriched)

      // 既存の営業所確認・最終確認データをロード
      const branchMap = new Map<string, string>()
      const finalMap = new Map<string, string>()
      casesData?.forEach((c: any) => {
        if (c.branch_manager) branchMap.set(c.case_id, c.branch_manager)
        if (c.final_approver) finalMap.set(c.case_id, c.final_approver)
      })
      setBranchManagers(branchMap)
      setFinalApprovers(finalMap)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (caseId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(caseId)) {
        next.delete(caseId)
      } else {
        next.add(caseId)
      }
      return next
    })
  }

  const openPrintModal = (order: EnrichedCase) => {
    setPrintCaseData(order)
    setShowPrintModal(true)
  }

  const closePrintModal = () => {
    setShowPrintModal(false)
    setPrintCaseData(null)
  }

  const handleBranchManagerChange = async (caseId: string, staffId: string) => {
    const { error } = await supabase
      .from("cases")
      .update({ branch_manager: staffId })
      .eq("case_id", caseId)

    if (!error) {
      setBranchManagers((prev) => new Map(prev).set(caseId, staffId))
    }
  }

  const handleFinalApproverChange = async (caseId: string, staffId: string) => {
    const { error } = await supabase
      .from("cases")
      .update({ final_approver: staffId })
      .eq("case_id", caseId)

    if (!error) {
      setFinalApprovers((prev) => new Map(prev).set(caseId, staffId))
    }
  }

  const escapeCsv = (value: unknown) => {
    if (value === null || value === undefined) return "\"\""
    const stringValue = String(value).replace(/"/g, '""')
    return `"${stringValue}"`
  }

  const handleExportCsv = async () => {
    if (!startDate || !endDate) {
      alert("開始日と終了日を入力してください")
      return
    }
    if (startDate > endDate) {
      alert("開始日は終了日以前に設定してください")
      return
    }

    setExporting(true)
    try {
      const startDateTime = `${startDate}T00:00:00`
      const endDateTime = `${endDate}T23:59:59.999`

      const { data: casesData, error: casesError } = await supabase
        .from("cases")
        .select("*")
        .in("status", ["受注", "注文", "倉庫移動"])
        .gte("created_date", startDateTime)
        .lte("created_date", endDateTime)
        .order("created_date", { ascending: true })

      if (casesError) {
        console.error("案件取得エラー", casesError)
        alert("案件の取得に失敗しました")
        return
      }

      if (!casesData || casesData.length === 0) {
        alert("指定期間に該当する案件がありません")
        return
      }

      const caseIds = casesData.map((c: any) => c.case_id)
      const staffIds = Array.from(new Set(casesData.map((c: any) => c.staff_id).filter(Boolean))) as string[]
      const customerIds = Array.from(new Set(casesData.map((c: any) => c.customer_id).filter(Boolean))) as string[]

      const staffPromise = staffIds.length
        ? supabase.from("staffs").select("id, name").in("id", staffIds)
        : Promise.resolve({ data: [], error: null })

      const customerPromise = customerIds.length
        ? supabase.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({ data: [], error: null })

      const detailPromise = caseIds.length
        ? supabase
            .from("case_details")
            .select("case_id, product_id, spec, unit, quantity, unit_price, amount, remarks, unregistered_product")
            .in("case_id", caseIds)
        : Promise.resolve({ data: [], error: null })

      const [{ data: staffData }, { data: customerData }, { data: detailData }] = await Promise.all([
        staffPromise,
        customerPromise,
        detailPromise,
      ])

      const staffMap = new Map((staffData || []).map((s: any) => [String(s.id), s.name]))
      const customerMap = new Map((customerData || []).map((c: any) => [c.id, c.name]))

      const productIds = Array.from(new Set((detailData || []).map((d: any) => d.product_id).filter(Boolean)))
      const productMap = new Map<string, string>()
      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from("products")
          .select("id, name")
          .in("id", productIds)

        if (productsData) {
          productsData.forEach((p: any) => {
            productMap.set(p.id, p.name)
          })
        }
      }

      const groupedDetails = new Map<string, DetailRow[]>()
      ;(detailData || []).forEach((d: any) => {
        const list = groupedDetails.get(d.case_id) || []
        const productName = productMap.get(d.product_id)
        list.push({
          case_id: d.case_id,
          product_id: d.product_id,
          item_name: d.unregistered_product || productName || d.product_id || "(無題)",
          spec: d.spec || "",
          unit: d.unit || "",
          quantity: d.quantity || 0,
          unit_price: d.unit_price || 0,
          amount: d.amount || 0,
          remarks: d.remarks || null,
        })
        groupedDetails.set(d.case_id, list)
      })

      const rows: (string | number | null)[][] = []
      rows.push([
        "created_date",
        "case_id",
        "case_no",
        "subject",
        "status",
        "customer_name",
        "staff_name",
        "department",
        "purchaser_name",
        "discount",
        "tax_rate",
        "detail_product_id",
        "detail_item_name",
        "detail_spec",
        "detail_unit",
        "detail_quantity",
        "detail_unit_price",
        "detail_amount",
        "detail_remarks",
      ])

      casesData.forEach((c: any) => {
        const base = [
          c.created_date,
          c.case_id,
          c.case_no || null,
          c.subject || "",
          c.status,
          customerMap.get(c.customer_id) || c.customer_id || "",
          staffMap.get(String(c.staff_id)) || c.staff_id || "",
          c.department || "",
          c.purchaser_name || "",
          c.discount || 0,
          c.tax_rate || 0,
        ]

        const details = groupedDetails.get(c.case_id) || []
        if (details.length === 0) {
          rows.push([...base, "", "", "", "", "", "", ""])
          return
        }

        details.forEach((d) => {
          rows.push([
            ...base,
            d.product_id || "",
            d.item_name,
            d.spec,
            d.unit,
            d.quantity,
            d.unit_price,
            d.amount,
            d.remarks || "",
          ])
        })
      })

      const csvContent = rows
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n")

      const bom = "\ufeff" // UTF-8 BOM to avoid garbled characters in Excel
      const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `orders_${startDate}_${endDate}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const getStaffStamp = (staffId: string | null) => {
    if (!staffId) return null
    const staff = staffs.find((s) => s.id === staffId)
    return staff?.stamp_path || null
  }

  const getStaffName = (staffId: string | null) => {
    if (!staffId) return ""
    const staff = staffs.find((s) => s.id === staffId)
    return staff?.name || ""
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
          opacity: 0.9;
        }
        input[type="date"] {
          color-scheme: dark;
          cursor: pointer;
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: "#93c5fd" }}>受注・注文・倉庫移動一覧</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ color: "#94a3b8", fontSize: 13 }}>ステータスが「受注」「注文」「倉庫移動」の案件を表示</div>
          <Link href="/cases/warehouse-moves">
            <button className="btn-3d btn-search" style={{ padding: "8px 16px", backgroundColor: "#0ea5e9", border: "1px solid #0284c7", color: "#fff" }}>
              倉庫移動一覧
            </button>
          </Link>
          <Link href="/selectors">
            <button className="btn-3d btn-reset" style={{ padding: "8px 16px", backgroundColor: "#16a34a", border: "1px solid #15803d", color: "#fff" }}>
              ← メニューに戻る
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", color: "#cbd5e1", fontSize: 12 }}>
          開始日
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", minWidth: 160 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", color: "#cbd5e1", fontSize: 12 }}>
          終了日
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", minWidth: 160 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", color: "#cbd5e1", fontSize: 12 }}>
          担当者
          <input
            type="text"
            list="staff-options"
            placeholder="idまたは名前で検索"
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", minWidth: 200 }}
          />
          <datalist id="staff-options">
            {staffs.map((s) => (
              <option key={`id-${s.id}`} value={String(s.id)}>{`${s.id}: ${s.name}`}</option>
            ))}
            {staffs.map((s) => (
              <option key={`name-${s.id}`} value={s.name}>{`${s.id}: ${s.name}`}</option>
            ))}
          </datalist>
        </label>
        <label style={{ display: "flex", flexDirection: "column", color: "#cbd5e1", fontSize: 12 }}>
          伝票種別
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", minWidth: 160 }}
          >
            <option value="">すべて</option>
            <option value="受注">受注</option>
            <option value="注文">注文</option>
            <option value="倉庫移動">倉庫移動</option>
          </select>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().split("T")[0]
              setStartDate(today)
              setEndDate(today)
            }}
            className="btn-3d btn-reset"
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            今日
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date()
              const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
              const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
              setStartDate(start)
              setEndDate(end)
            }}
            className="btn-3d btn-reset"
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            今月
          </button>
          <button
            type="button"
            onClick={() => {
              setStartDate("")
              setEndDate("")
              setStaffFilter("")
              setStatusFilter("")
            }}
            className="btn-3d btn-reset"
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            クリア
          </button>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="btn-3d btn-search"
          style={{ padding: "10px 18px", opacity: exporting ? 0.6 : 1 }}
        >
          {exporting ? "CSV出力中..." : "案件・明細をCSV出力"}
        </button>
        <span style={{ color: "#94a3b8", fontSize: 12 }}>作成日を含めて指定期間内の案件・明細をダウンロード</span>
      </div>

      {loading && <p>読み込み中...</p>}

      {!loading && orders.length === 0 && (
        <p style={{ color: "#64748b" }}>受注・注文・倉庫移動ステータスの案件がありません。</p>
      )}

      {!loading && orders.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, background: "#1e293b" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 120 }}>案件ID</th>
              <th style={{ ...thStyle, width: 100 }}>伝票種別</th>
              <th style={{ ...thStyle, width: 80 }}>案件No</th>
              <th style={{ ...thStyle, width: 110 }}>作成日</th>
              <th style={{ ...thStyle, width: 180 }}>件名</th>
              <th style={{ ...thStyle, width: 160 }}>顧客名</th>
              <th style={{ ...thStyle, width: 120 }}>担当者</th>
              <th style={{ ...thStyle, width: 100 }}>ステータス</th>
              <th style={{ ...thStyle, width: 110 }}>部門</th>
              <th style={{ ...thStyle, width: 140 }}>発注者</th>
              <th style={{ ...thStyle, width: 220 }}>移動元→移動先</th>
              <th style={{ ...thStyle, width: 110 }}>営業所確認</th>
              <th style={{ ...thStyle, width: 110 }}>最終確認</th>
              <th style={{ ...thStyle, width: 90 }}>明細</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <React.Fragment key={o.case_id}>
                <tr>
                  <td style={tdStyle}>{o.case_id}</td>
                  <td style={tdStyle}>
                    {o.status === '注文' ? (
                      <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>発注書作成</span>
                    ) : o.status === '倉庫移動' ? (
                      <span style={{ color: '#ef4444', fontWeight: 'bold' }}>倉庫移動</span>
                    ) : o.status === '受注' ? (
                      <span style={{ color: '#34d399', fontWeight: 'bold' }}>移動伝票作成</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>{o.status}</span>
                    )}
                  </td>
                  <td style={tdStyle}>{o.case_no ?? "-"}</td>
                  <td style={tdStyle}>{o.created_date}</td>
                  <td style={tdStyle}>{o.subject}</td>
                  <td style={tdStyle}>{o.customer_name}</td>
                  <td style={tdStyle}>{o.staff_name}</td>
                  <td style={tdStyle}>{o.status}</td>
                  <td style={tdStyle}>{o.department || "-"}</td>
                  <td style={tdStyle}>{o.purchaser_name || "-"}</td>
                  <td style={tdStyle}>
                    {o.status === '倉庫移動' ? (
                      <span>
                        {(o.source_warehouse_name || '-') + ' → ' + (o.destination_warehouse_name || '-')}
                      </span>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, backgroundColor: "#fff", color: "#000" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                      <select
                        value={branchManagers.get(o.case_id) || ""}
                        onChange={(e) => handleBranchManagerChange(o.case_id, e.target.value)}
                        style={{
                          border: "1px solid #475569",
                          borderRadius: 4,
                          padding: "4px 6px",
                          background: "#fff",
                          color: "#000",
                          fontSize: 11,
                          width: "100%",
                        }}
                      >
                        <option value="">選択してください</option>
                        {staffs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {branchManagers.get(o.case_id) && (
                        <>
                          <div style={{ fontSize: 11, color: "#000", fontWeight: "bold" }}>
                            {getStaffName(branchManagers.get(o.case_id) || null)}
                          </div>
                          {getStaffStamp(branchManagers.get(o.case_id) || null) && (
                            <img
                              src={getStaffStamp(branchManagers.get(o.case_id) || null) || ""}
                              alt="印章"
                              style={{ width: 50, height: 50, objectFit: "contain" }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  {o.status !== '受注' && (
                  <td style={{ ...tdStyle, backgroundColor: "#fff", color: "#000" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                      <select
                        value={finalApprovers.get(o.case_id) || ""}
                        onChange={(e) => handleFinalApproverChange(o.case_id, e.target.value)}
                        style={{
                          border: "1px solid #475569",
                          borderRadius: 4,
                          padding: "4px 6px",
                          background: "#fff",
                          color: "#000",
                          fontSize: 11,
                          width: "100%",
                        }}
                      >
                        <option value="">選択してください</option>
                        {staffs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {finalApprovers.get(o.case_id) && (
                        <>
                          <div style={{ fontSize: 11, color: "#000", fontWeight: "bold" }}>
                            {getStaffName(finalApprovers.get(o.case_id) || null)}
                          </div>
                          {getStaffStamp(finalApprovers.get(o.case_id) || null) && (
                            <img
                              src={getStaffStamp(finalApprovers.get(o.case_id) || null) || ""}
                              alt="印章"
                              style={{ width: 50, height: 50, objectFit: "contain" }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  )}
                  <td style={tdStyle}>
                    <button
                      onClick={() => toggleExpand(o.case_id)}
                      className="btn-3d btn-search"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                    >
                      {expanded.has(o.case_id) ? "閉じる" : "表示"}
                    </button>
                  </td>
                </tr>
                {expanded.has(o.case_id) && (
                  <tr>
                    <td colSpan={14} style={{ background: "#1e293b", padding: 12, borderColor: "#334155" }}>
                      <div style={{ fontWeight: "bold", marginBottom: 8, color: "#93c5fd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span>明細</span>
                          <span style={{ fontSize: 12, color: "#e2e8f0" }}>
                            COREPLUS №: {o.coreplus_no || "-"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Link
                            href={`/cases/new/order?id=${o.case_id}&mode=${
                              o.status === '注文' ? 'order' : 
                              o.status === '受注' ? 'transfer-slip' : 
                              o.status === '倉庫移動' ? 'warehouse-move' : 'order'
                            }&returnTo=%2Fcases%2Forders`}
                            className="btn-3d btn-search"
                            style={{ fontSize: 11, padding: "4px 10px", marginBottom: 0, textDecoration: "none" }}
                          >
                            ✏️ 編集
                          </Link>
                          <button
                            onClick={() => openPrintModal(o)}
                            className="btn-3d btn-search"
                            style={{ fontSize: 11, padding: "4px 10px", marginBottom: 0 }}
                          >
                            📄 PDF印刷
                          </button>
                        </div>
                      </div>
                      {o.details.length === 0 ? (
                        <div style={{ color: "#64748b" }}>明細がありません。</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={thStyle}>品名</th>
                              <th style={thStyle}>単位</th>
                              <th style={{ ...thStyle, textAlign: "right", width: 80 }}>数量</th>
                              <th style={{ ...thStyle, textAlign: "right", width: 100 }}>単価</th>
                              <th style={{ ...thStyle, textAlign: "right", width: 110 }}>金額</th>
                              <th style={thStyle}>備考</th>
                            </tr>
                          </thead>
                          <tbody>
                            {o.details.map((d, idx) => (
                              <tr key={`${d.case_id}-${idx}`}>
                                <td style={tdStyle}>{d.spec ? `${d.item_name} ${d.spec}` : d.item_name}</td>
                                <td style={tdStyle}>{d.unit}</td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>{d.quantity}</td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>{d.unit_price.toLocaleString()}</td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>{d.amount.toLocaleString()}</td>
                                <td style={tdStyle}>{d.remarks || ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      {/* 印刷プレビューモーダル */}
      {showPrintModal && printCaseData && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={closePrintModal}>
          <div style={{ backgroundColor: "#1e293b", padding: 24, borderRadius: 12, maxWidth: "95vw", maxHeight: "95vh", overflow: "auto", border: "1px solid #334155" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ color: "#fff", margin: 0 }}>注文書PDF</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handlePrint} className="selector-button primary" style={{ padding: "8px 16px", color: "#fff" }}>🖨️ 印刷</button>
                <button onClick={closePrintModal} className="selector-button" style={{ padding: "8px 16px", color: "#fff" }}>✕ 閉じる</button>
              </div>
            </div>
            <div ref={printRef}>
              {(() => {
                const subtotal = printCaseData.details.reduce((sum, d) => sum + (d.amount || 0), 0)
                const subtotalAfterDiscount = subtotal * (1 - (printCaseData.discount || 0) / 100)
                const taxAmount = subtotalAfterDiscount * (printCaseData.tax_rate || 0.1)
                const totalAmount = subtotalAfterDiscount + taxAmount
                return (
                  <PrintPurchaseOrder
                    printRef={printRef}
                    supplierName={printCaseData.customer_name}
                    orderNo={String(printCaseData.case_no || "")}
                    orderDate={printCaseData.created_date}
                    department={printCaseData.department || ""}
                    subject={printCaseData.subject}
                    purchaserName={printCaseData.purchaser_name || ""}
                    discount={printCaseData.discount || 0}
                    taxRate={printCaseData.tax_rate || 0.1}
                    subtotal={subtotal}
                    subtotalAfterDiscount={subtotalAfterDiscount}
                    taxAmount={taxAmount}
                    totalAmount={totalAmount}
                    layoutType="vertical"
                    rows={printCaseData.details.map((d) => ({
                      product_id: d.product_id || "",
                      item_name: d.item_name,
                      spec: d.spec,
                      unit: d.unit,
                      quantity: d.quantity,
                      unit_price: d.unit_price,
                      amount: d.amount,
                      cost_price: 0,
                      section_id: null,
                    }))}
                    sections={[]}
                    MAX_ROWS_PER_PAGE={20}
                    approvalStamps={{
                      staff: false,
                      manager: false,
                      director: false,
                      president: false,
                    }}
                  />
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
