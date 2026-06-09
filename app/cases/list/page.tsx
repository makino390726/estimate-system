'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../../../lib/supabaseClient'
import {
  buildCaseDetailReportCsv,
  computeCaseAmounts,
  deriveBusinessFallback,
  deriveGrossProfitFallback,
  fetchCaseDetailsForReport,
  fetchProductCostMap,
  formatReportDate,
  formatPercent,
  formatYen,
  mapDetailRowsForReport,
  type CaseDetailReportRow,
} from '../../../lib/caseDetailReport'

type CaseWithDetails = {
  case_id: string
  case_no: string | number | null
  subject: string
  created_date: string
  status: string
  customer_name: string
  staff_name: string
  staff_id: string | null
  approve_staff: string | null
  approve_manager: string | null
  approve_director: string | null
  approve_president: string | null
  approvalStatus: string
}

export default function CaseListPage() {
  const [cases, setCases] = useState<CaseWithDetails[]>([])
  const [originalCases, setOriginalCases] = useState<CaseWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [staffFilter, setStaffFilter] = useState('')
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([])
  const [exportStartDate, setExportStartDate] = useState('')
  const [exportEndDate, setExportEndDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const [reportRows, setReportRows] = useState<CaseDetailReportRow[]>([])
  const [reportMeta, setReportMeta] = useState({ staffLabel: 'すべて', count: 0 })
  const printRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `案件明細表_${exportStartDate || '開始未指定'}_${exportEndDate || '終了未指定'}`,
    pageStyle: `
      @page {
        size: A4 landscape;
        margin: 12mm 10mm 10mm 10mm;
      }
      @media print {
        body { margin: 0; padding: 0; font-size: 11pt; }
        table { font-size: 10pt; }
        th, td { padding: 4px 6px !important; }
      }
    `,
  })

  useEffect(() => {
    fetchCases()
    fetchStaffOptions()
  }, [])

  const fetchStaffOptions = async () => {
    const { data, error } = await supabase
      .from('staffs')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      console.error('担当者一覧取得エラー:', error)
      return
    }

    setStaffOptions((data || []).map((staff) => ({
      id: String(staff.id),
      name: staff.name,
    })))
  }

  const fetchCases = async () => {
    setLoading(true)
    const startTime = performance.now()

    try {
      const { data: casesData, error: casesError } = await supabase
        .from('cases_with_names')
        .select('case_id, case_no, subject, created_date, status, customer_name, staff_name, staff_id, approve_staff, approve_manager, approve_director, approve_president')
        .order('created_date', { ascending: false })

      if (casesError) {
        console.error('案件取得エラー:', casesError)
        setLoading(false)
        return
      }

      const formattedCases: CaseWithDetails[] = (casesData || []).map((c: any) => {
        let approvalStatus = 'pending'

        if (c.approve_president) {
          approvalStatus = 'approved'
        } else if (c.approve_director) {
          approvalStatus = 'director_approved'
        } else if (c.approve_manager) {
          approvalStatus = 'manager_approved'
        } else if (c.approve_staff) {
          approvalStatus = 'staff_approved'
        }

        return {
          case_id: c.case_id,
          case_no: c.case_no,
          subject: c.subject,
          created_date: c.created_date,
          status: c.status,
          customer_name: c.customer_name || '不明',
          staff_name: c.staff_name || '不明',
          staff_id: c.staff_id != null ? String(c.staff_id) : null,
          approve_staff: c.approve_staff,
          approve_manager: c.approve_manager,
          approve_director: c.approve_director,
          approve_president: c.approve_president,
          approvalStatus,
        }
      })

      setCases(formattedCases)
      setOriginalCases(formattedCases)

      const endTime = performance.now()
      console.log(`✅ データ取得時間: ${(endTime - startTime).toFixed(2)}ms`)
    } catch (error) {
      console.error('予期しないエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // ★ ステータス変更機能（確認ダイアログ付き）
  const handleStatusChange = async (caseId: string, currentStatus: string, newStatus: string) => {
    // 同じステータスが選択された場合は何もしない
    if (currentStatus === newStatus) {
      return
    }

    // ★ 確認ダイアログを表示
    const confirmed = window.confirm(`ステータスを「${currentStatus}」から「${newStatus}」に変更しますか？`)

    if (!confirmed) {
      // No を選択した場合、元の値に戻す（再レンダリングで元に戻る）
      setCases([...cases])
      return
    }

    try {
      const { error } = await supabase
        .from('cases')
        .update({ status: newStatus })
        .eq('case_id', caseId)

      if (error) {
        console.error('ステータス更新エラー:', error)
        alert('ステータスの更新に失敗しました')
        // エラー時も元の値に戻す
        setCases([...cases])
        return
      }

      // ローカルの状態を更新（再取得せずに即座に反映）
      setCases(prevCases =>
        prevCases.map(c =>
          c.case_id === caseId ? { ...c, status: newStatus } : c
        )
      )

      console.log(`✅ ステータスを「${newStatus}」に更新しました`)
    } catch (error) {
      console.error('ステータス更新エラー:', error)
      alert('ステータスの更新に失敗しました')
      // エラー時も元の値に戻す
      setCases([...cases])
    }
  }

  // ★ ステータスごとの背景色とフォント色を取得
  const getStatusStyle = (status: string): React.CSSProperties => {
    const statusStyles: { [key: string]: React.CSSProperties } = {
      '商談中': { backgroundColor: '#007bff', color: '#000' },   // 青背景・黒文字
      '受注': { backgroundColor: '#dc3545', color: '#fff' },     // 赤背景・白文字
      '倉庫移動': { backgroundColor: '#f97316', color: '#000' }, // 倉庫移動も移動色で表示
      '失注': { backgroundColor: '#000000', color: '#fff' },     // 黒背景・白文字
      '完了': { backgroundColor: '#6c757d', color: '#fff' },     // グレー背景・白文字
    }

    return {
      ...statusStyles[status] || { backgroundColor: '#6c757d', color: '#fff' },
      fontSize: 11,
      padding: '4px 8px',
      width: '100%',
      minWidth: 100,
      fontWeight: 'bold',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
    }
  }

  const handleShowDetail = (caseId: string) => {
    router.push(`/cases/approval/${caseId}`)
  }

  const handleDelete = async (caseId: string) => {
    if (!confirm(`案件を削除してもよろしいですか？\n関連する承認履歴、明細データも削除されます。`)) {
      return
    }

    try {
      // 承認履歴を削除
      const { error: approvalError } = await supabase
        .from('approval_history')
        .delete()
        .eq('case_id', caseId)

      if (approvalError) {
        console.error('承認履歴削除エラー:', approvalError)
        alert('承認履歴の削除に失敗しました')
        return
      }

      // 明細を削除
      const { error: detailError } = await supabase
        .from('case_details')
        .delete()
        .eq('case_id', caseId)

      if (detailError) {
        console.error('明細削除エラー:', detailError)
        alert('明細データの削除に失敗しました')
        return
      }

      // 案件を削除
      const { error: caseError } = await supabase
        .from('cases')
        .delete()
        .eq('case_id', caseId)

      if (caseError) {
        console.error('案件削除エラー:', caseError)
        alert('案件の削除に失敗しました')
      } else {
        alert('削除しました')
        fetchCases()
      }
    } catch (err: any) {
      console.error('削除処理エラー:', err)
      alert('削除中にエラーが発生しました')
    }
  }

  const handleFilterByStaff = () => {
    if (!staffFilter) {
      setCases(originalCases)
      return
    }

    const selectedStaff = staffOptions.find((staff) => staff.id === staffFilter)
    const selectedName = selectedStaff?.name

    setCases(originalCases.filter((c) => {
      if (c.staff_id && c.staff_id === staffFilter) return true
      if (!selectedName) return false
      return c.staff_name === selectedName
    }))
  }

  const handleShowAll = () => {
    setStaffFilter('')
    fetchCases()
  }

  const validateExportDateRange = () => {
    if (!exportStartDate || !exportEndDate) {
      alert('開始日と終了日を入力してください')
      return false
    }
    if (exportStartDate > exportEndDate) {
      alert('開始日は終了日以前に設定してください')
      return false
    }
    return true
  }

  const fetchReportRows = async (): Promise<CaseDetailReportRow[]> => {
    const startDateTime = `${exportStartDate}T00:00:00`
    const endDate = new Date(`${exportEndDate}T00:00:00`)
    endDate.setDate(endDate.getDate() + 1)
    const endExclusive = endDate.toISOString().split('T')[0]
    const endDateTime = `${endExclusive}T00:00:00`

    let query = supabase
      .from('cases_with_names')
      .select('case_id, subject, created_date, status, staff_name, staff_id')
      .gte('created_date', startDateTime)
      .lt('created_date', endDateTime)
      .order('created_date', { ascending: true })

    if (staffFilter) {
      query = query.eq('staff_id', staffFilter)
    }

    const { data: casesData, error: casesError } = await query
    if (casesError) {
      console.error('案件明細表取得エラー:', casesError)
      throw new Error('案件データの取得に失敗しました')
    }

    if (!casesData || casesData.length === 0) {
      return []
    }

    const caseIds = casesData.map((c) => c.case_id)

    const [{ data: amountData, error: amountError }, detailData] = await Promise.all([
      supabase
        .from('cases')
        .select('case_id, total_amount, gross_profit, gross_margin')
        .in('case_id', caseIds),
      fetchCaseDetailsForReport(supabase, caseIds),
    ])

    if (amountError) {
      const errText = `${amountError.message || ''} ${amountError.details || ''}`.toLowerCase()
      const missingAmountColumns =
        errText.includes('column') &&
        (errText.includes('total_amount') || errText.includes('gross_profit') || errText.includes('gross_margin'))

      if (!missingAmountColumns) {
        console.error('案件金額取得エラー:', amountError)
        throw new Error('案件金額データの取得に失敗しました')
      }
    }

    const amountByCaseId = new Map(
      (amountData || []).map((row: any) => [row.case_id, row]),
    )

    const productIds = Array.from(
      new Set(
        detailData
          .map((detail) => (detail.product_id != null ? String(detail.product_id) : ''))
          .filter(Boolean),
      ),
    )
    const productCostMap = await fetchProductCostMap(supabase, productIds)
    const groupedDetails = mapDetailRowsForReport(detailData, productCostMap)

    return casesData.map((caseRow) => {
      const caseAmount = amountByCaseId.get(caseRow.case_id)
      const amounts = computeCaseAmounts(groupedDetails.get(caseRow.case_id) || [], {
        businessTotal: deriveBusinessFallback(caseAmount?.total_amount),
        grossProfitTotal: deriveGrossProfitFallback(
          caseAmount?.gross_profit,
          caseAmount?.total_amount,
          caseAmount?.gross_margin,
        ),
      })
      return {
        created_date: caseRow.created_date,
        subject: caseRow.subject || '-',
        business_total: amounts.businessTotal,
        cost_total: amounts.costTotal,
        gross_profit_total: amounts.grossProfitTotal,
        gross_profit_rate: amounts.grossProfitRate,
        status: caseRow.status || '-',
        staff_name: caseRow.staff_name || '不明',
      }
    })
  }

  const getSelectedStaffLabel = () => {
    if (!staffFilter) return 'すべて'
    const selected = staffOptions.find((staff) => staff.id === staffFilter)
    return selected?.name || staffFilter
  }

  const handleExportCsv = async () => {
    if (!validateExportDateRange()) return

    setExporting(true)
    try {
      const rows = await fetchReportRows()
      if (rows.length === 0) {
        alert('指定期間に該当する案件がありません')
        return
      }

      const bom = '\ufeff'
      const csvContent = buildCaseDetailReportCsv(rows)
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `案件明細表_${exportStartDate}_${exportEndDate}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('CSV出力エラー:', error)
      alert(error instanceof Error ? error.message : 'CSV出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  const handleExportPdf = async () => {
    if (!validateExportDateRange()) return

    setExporting(true)
    try {
      const rows = await fetchReportRows()
      if (rows.length === 0) {
        alert('指定期間に該当する案件がありません')
        return
      }

      setReportRows(rows)
      setReportMeta({
        staffLabel: getSelectedStaffLabel(),
        count: rows.length,
      })

      setTimeout(() => {
        handlePrint()
      }, 200)
    } catch (error) {
      console.error('PDF出力エラー:', error)
      alert(error instanceof Error ? error.message : 'PDF出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  const reportTotals = reportRows.reduce(
    (acc, row) => ({
      business_total: acc.business_total + row.business_total,
      cost_total: acc.cost_total + row.cost_total,
      gross_profit_total: acc.gross_profit_total + row.gross_profit_total,
    }),
    { business_total: 0, cost_total: 0, gross_profit_total: 0 },
  )
  const reportTotalRate =
    reportTotals.business_total > 0
      ? (reportTotals.gross_profit_total / reportTotals.business_total) * 100
      : null

  const getStatusBadge = (status: string) => {
    const styles: { [key: string]: React.CSSProperties } = {
      pending: { backgroundColor: '#ffc107', color: '#000' },
      staff_approved: { backgroundColor: '#17a2b8', color: '#fff' },
      manager_approved: { backgroundColor: '#6c757d', color: '#fff' },
      director_approved: { backgroundColor: '#007bff', color: '#fff' },
      approved: { backgroundColor: '#28a745', color: '#fff' },
    }

    const labels: { [key: string]: string } = {
      pending: '承認待ち',
      staff_approved: '申請済み',
      manager_approved: '所長承認済み',
      director_approved: '専務承認済み',
      approved: '社長承認済み',
    }

    return (
      <span
        style={{
          ...styles[status] || {},
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 'bold',
        }}
      >
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <p>読み込み中...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>案件一覧・承認</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="input-inset"
            style={{ minWidth: 200 }}
          >
            <option value="">担当者を選択</option>
            {staffOptions.map((staff) => (
              <option key={staff.id} value={String(staff.id)}>
                {staff.name}
              </option>
            ))}
          </select>
          <button onClick={handleFilterByStaff} className="btn-3d btn-primary">
            担当者で絞込
          </button>
          <button onClick={handleShowAll} className="btn-3d btn-reset">
            全件表示
          </button>
          <Link href="/selectors">
            <button className="btn-3d btn-reset" style={{ padding: '8px 16px', backgroundColor: '#16a34a', border: '1px solid #15803d', color: '#fff' }}>
              ← メニューに戻る
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap', padding: 16, border: '1px solid #334155', borderRadius: 8, backgroundColor: '#111827' }}>
        <label style={{ display: 'flex', flexDirection: 'column', color: '#cbd5e1', fontSize: 12 }}>
          出力開始日
          <input
            type="date"
            value={exportStartDate}
            onChange={(e) => setExportStartDate(e.target.value)}
            className="input-inset"
            style={{ minWidth: 160, marginTop: 4 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', color: '#cbd5e1', fontSize: 12 }}>
          出力終了日
          <input
            type="date"
            value={exportEndDate}
            onChange={(e) => setExportEndDate(e.target.value)}
            className="input-inset"
            style={{ minWidth: 160, marginTop: 4 }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const today = new Date().toISOString().split('T')[0]
            setExportStartDate(today)
            setExportEndDate(today)
          }}
          className="btn-3d btn-reset"
          style={{ padding: '8px 12px', fontSize: 12 }}
        >
          今日
        </button>
        <button
          type="button"
          onClick={() => {
            const now = new Date()
            const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
            setExportStartDate(start)
            setExportEndDate(end)
          }}
          className="btn-3d btn-reset"
          style={{ padding: '8px 12px', fontSize: 12 }}
        >
          今月
        </button>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="btn-3d btn-search"
          style={{ padding: '10px 18px', opacity: exporting ? 0.6 : 1 }}
        >
          {exporting ? '出力中...' : '案件明細表 CSV出力'}
        </button>
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          className="btn-3d btn-primary"
          style={{ padding: '10px 18px', opacity: exporting ? 0.6 : 1 }}
        >
          {exporting ? '出力中...' : '案件明細表 PDF印刷'}
        </button>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          作成日で期間指定。担当者絞込は上部の選択が反映されます。
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>案件ID</th>
            <th style={thStyle}>案件No</th>
            <th style={thStyle}>作成日</th>
            <th style={thStyle}>件名</th>
            <th style={thStyle}>顧客名</th>
            <th style={thStyle}>担当者</th>
            <th style={thStyle}>ステータス</th>
            <th style={thStyle}>承認状況</th>
            <th style={thStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.case_id}>
              <td style={tdStyle}>{c.case_id}</td>
              <td style={tdStyle}>{c.case_no ?? '-'}</td>
              <td style={tdStyle}>{c.created_date}</td>
              <td style={tdStyle}>{c.subject}</td>
              <td style={tdStyle}>{c.customer_name}</td>
              <td style={tdStyle}>{c.staff_name}</td>
              <td style={tdStyle}>
                {/* ★ ステータス変更用セレクトボックス（色付き） */}
                <select
                  value={c.status}
                  onChange={(e) => handleStatusChange(c.case_id, c.status, e.target.value)}
                  style={getStatusStyle(c.status)}
                >
                  <option value="商談中">商談中</option>
                  <option value="受注">受注</option>
                  <option value="倉庫移動">移動（倉庫移動）</option>
                  <option value="失注">失注</option>
                  <option value="完了">完了</option>
                </select>
              </td>
              <td style={tdStyle}>{getStatusBadge(c.approvalStatus)}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleShowDetail(c.case_id)}
                    className="btn-3d btn-search"
                    style={{ fontSize: 11, padding: '4px 12px', backgroundColor: '#16a34a' }}
                  >
                    明細表示
                  </button>
                  <button
                    onClick={() => handleDelete(c.case_id)}
                    className="btn-3d"
                    style={{
                      fontSize: 11,
                      padding: '4px 12px',
                      backgroundColor: '#dc3545',
                      color: '#fff',
                    }}
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {cases.length === 0 && (
        <p style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>
          案件がありません
        </p>
      )}

      <div style={{ position: 'absolute', left: -99999, top: 0 }}>
        <div ref={printRef} style={{ width: 1280, padding: 24, backgroundColor: '#ffffff', color: '#000000' }}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>案件明細表</h1>
            <div style={{ fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>期間: {exportStartDate || '未指定'} ～ {exportEndDate || '未指定'}</span>
              <span>担当者: {reportMeta.staffLabel}</span>
              <span>件数: {reportMeta.count} 件</span>
              <span>出力日: {new Date().toLocaleDateString('ja-JP')}</span>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={printThStyle}>作成日</th>
                <th style={{ ...printThStyle, width: '28%' }}>件名</th>
                <th style={{ ...printThStyle, textAlign: 'right' }}>事業費計</th>
                <th style={{ ...printThStyle, textAlign: 'right' }}>原価合計</th>
                <th style={{ ...printThStyle, textAlign: 'right' }}>粗利額計</th>
                <th style={{ ...printThStyle, textAlign: 'right' }}>粗利率</th>
                <th style={printThStyle}>ステータス</th>
                <th style={printThStyle}>担当者</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row, index) => (
                <tr key={`${row.created_date}-${row.subject}-${index}`}>
                  <td style={printTdStyle}>{formatReportDate(row.created_date)}</td>
                  <td style={printTdStyle}>{row.subject}</td>
                  <td style={{ ...printTdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatYen(row.business_total)}</td>
                  <td style={{ ...printTdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatYen(row.cost_total)}</td>
                  <td style={{ ...printTdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatYen(row.gross_profit_total)}</td>
                  <td style={{ ...printTdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatPercent(row.gross_profit_rate)}</td>
                  <td style={printTdStyle}>{row.status}</td>
                  <td style={printTdStyle}>{row.staff_name}</td>
                </tr>
              ))}
              {reportRows.length > 0 && (
                <tr>
                  <td style={printTotalStyle} colSpan={2}>合計</td>
                  <td style={{ ...printTotalStyle, textAlign: 'right' }}>{formatYen(reportTotals.business_total)}</td>
                  <td style={{ ...printTotalStyle, textAlign: 'right' }}>{formatYen(reportTotals.cost_total)}</td>
                  <td style={{ ...printTotalStyle, textAlign: 'right' }}>{formatYen(reportTotals.gross_profit_total)}</td>
                  <td style={{ ...printTotalStyle, textAlign: 'right' }}>{formatPercent(reportTotalRate)}</td>
                  <td style={printTotalStyle} colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '8px 12px',
  backgroundColor: '#0f172a',
  color: '#cbd5e1',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 'bold',
}

const tdStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '8px 12px',
  fontSize: 12,
}

const printThStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '6px 8px',
  backgroundColor: '#e2e8f0',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 'bold',
}

const printTdStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  padding: '6px 8px',
  fontSize: 12,
  verticalAlign: 'top',
  wordBreak: 'break-word',
}

const printTotalStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '6px 8px',
  fontSize: 12,
  fontWeight: 'bold',
  backgroundColor: '#f8fafc',
}