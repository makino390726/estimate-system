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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
  })

  useEffect(() => {
    fetchStaffs()
    fetchOrders()
  }, [])

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
      const { data: casesData, error: casesError } = await supabase
        .from("cases")
        .select("*")
        .in("status", ["受注", "注文", "倉庫移動"])
        .order("created_date", { ascending: false })

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

      const enriched: EnrichedCase[] = (casesData || []).map((c: any) => ({
        case_id: c.case_id,
        case_no: c.case_no || null,
        subject: c.subject || "(件名未入力)",
        created_date: c.created_date,
        status: c.status,
        customer_id: c.customer_id || null,
        staff_id: c.staff_id || null,
        department: c.department || "",
        purchaser_name: c.purchaser_name || "",
        customer_name: customerMap.get(c.customer_id) || c.customer_id || "-",
        staff_name: staffMap.get(String(c.staff_id)) || c.staff_id || "-",
        details: groupedDetails.get(c.case_id) || [],
        discount: c.discount || 0,
        tax_rate: c.tax_rate || 0.1,
      }))

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: "#93c5fd" }}>受注・注文・倉庫移動一覧</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ color: "#94a3b8", fontSize: 13 }}>ステータスが「受注」「注文」「倉庫移動」の案件を表示</div>
          <Link href="/selectors">
            <button className="btn-3d btn-reset" style={{ padding: "8px 16px", backgroundColor: "#16a34a", border: "1px solid #15803d", color: "#fff" }}>
              ← メニューに戻る
            </button>
          </Link>
        </div>
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
              <th style={{ ...thStyle, width: 80 }}>案件No</th>
              <th style={{ ...thStyle, width: 110 }}>作成日</th>
              <th style={{ ...thStyle, width: 180 }}>件名</th>
              <th style={{ ...thStyle, width: 160 }}>顧客名</th>
              <th style={{ ...thStyle, width: 120 }}>担当者</th>
              <th style={{ ...thStyle, width: 100 }}>ステータス</th>
              <th style={{ ...thStyle, width: 110 }}>部門</th>
              <th style={{ ...thStyle, width: 140 }}>発注者</th>
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
                  <td style={tdStyle}>{o.case_no ?? "-"}</td>
                  <td style={tdStyle}>{o.created_date}</td>
                  <td style={tdStyle}>{o.subject}</td>
                  <td style={tdStyle}>{o.customer_name}</td>
                  <td style={tdStyle}>{o.staff_name}</td>
                  <td style={tdStyle}>{o.status}</td>
                  <td style={tdStyle}>{o.department || "-"}</td>
                  <td style={tdStyle}>{o.purchaser_name || "-"}</td>
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
                    <td colSpan={11} style={{ background: "#1e293b", padding: 12, borderColor: "#334155" }}>
                      <div style={{ fontWeight: "bold", marginBottom: 8, color: "#93c5fd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>明細</span>
                        <button
                          onClick={() => openPrintModal(o)}
                          className="btn-3d btn-search"
                          style={{ fontSize: 11, padding: "4px 10px", marginBottom: 0 }}
                        >
                          📄 PDF印刷
                        </button>
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
