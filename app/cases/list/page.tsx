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
import { collectionMonthLabel, normalizeCustomerName } from '@/lib/collectionSchedule'
import { fiscalMonthSlots, fiscalYearFromDate, fiscalYearLabel } from '@/lib/annualPlanFiscal'

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
  billing_scheduled_on: string | null
  collection_month: string | null
  total_amount: number
}

const CASES_LIST_STAFF_FILTER_KEY = 'estimate-system:cases-list-staff-filter'

function readStoredStaffFilter(): string {
  try {
    return sessionStorage.getItem(CASES_LIST_STAFF_FILTER_KEY) || ''
  } catch {
    return ''
  }
}

function writeStoredStaffFilter(value: string) {
  try {
    if (value) sessionStorage.setItem(CASES_LIST_STAFF_FILTER_KEY, value)
    else sessionStorage.removeItem(CASES_LIST_STAFF_FILTER_KEY)
  } catch {
    // ignore
  }
}

function customerTermsFor(
  row: CaseWithDetails,
  terms: Map<string, { closeDay: number | null; cycle: number | null }>,
) {
  const term = terms.get(normalizeCustomerName(row.customer_name))
  if (!term || term.closeDay == null || term.cycle == null) return null
  return term
}

function isCollectionTarget(status: string): boolean {
  return status === '受注' || status === '完了'
}

function collectionForCase(
  row: CaseWithDetails,
  terms: Map<string, { closeDay: number | null; cycle: number | null }>,
): string {
  if (!isCollectionTarget(row.status)) return '—'
  const term = customerTermsFor(row, terms)
  if (!term) return ''
  if (!row.billing_scheduled_on) return '—'
  return collectionMonthLabel(row.billing_scheduled_on, term.closeDay, term.cycle) || '—'
}

function collectionScheduleForCase(
  row: CaseWithDetails,
  terms: Map<string, { closeDay: number | null; cycle: number | null }>,
): { label: string; sort: string } {
  const missing = { label: '—', sort: '9999-99' }
  const term = customerTermsFor(row, terms)
  if (term) {
    const label = row.billing_scheduled_on
      ? collectionMonthLabel(row.billing_scheduled_on, term.closeDay, term.cycle)
      : null
    if (!label) return missing
    const match = label.match(/(\d+)年(\d+)月/)
    return {
      label,
      sort: match ? `${match[1]}-${String(match[2]).padStart(2, '0')}` : missing.sort,
    }
  }
  const manual = String(row.collection_month || '').match(/^(\d{4})-(\d{2})$/)
  if (!manual) return missing
  return { label: `${Number(manual[1])}年${Number(manual[2])}月`, sort: `${manual[1]}-${manual[2]}` }
}

type ContractReportRow = {
  customer_name: string
  subject: string
  business_total: number
  billing_scheduled_on: string | null
  collection_month_label: string
  collection_sort: string
  gross_profit_total: number
}

function fiscalYearFromMonthKey(key: string): number | null {
  const match = String(key || '').match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return month >= 9 ? year + 1 : year
}

function contractFiscalTables(rows: ContractReportRow[]) {
  const datedYears = new Set<number>()
  for (const row of rows) {
    const fiscalYear = fiscalYearFromMonthKey(row.collection_sort)
    if (fiscalYear != null) datedYears.add(fiscalYear)
  }
  const years = datedYears.size > 0
    ? [...datedYears].sort((a, b) => a - b)
    : [fiscalYearFromDate()]
  const currentYear = fiscalYearFromDate()
  const undatedYear = years.includes(currentYear) ? currentYear : years[0]
  return years.map((fiscalYear) => ({
    fiscalYear,
    slots: fiscalMonthSlots(fiscalYear),
    rows: rows.filter((row) => {
      const rowYear = fiscalYearFromMonthKey(row.collection_sort)
      return rowYear === fiscalYear || (rowYear == null && fiscalYear === undatedYear)
    }),
  }))
}

function formatSheetAmount(value: number): string {
  return Math.round(value).toLocaleString('ja-JP')
}

async function fetchCaseAmounts() {
  const rows = new Map<string, { billing_scheduled_on: string | null; collection_month: string | null; total_amount: number }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cases')
      .select('case_id, total_amount')
      .range(from, from + 999)
    if (error) throw error
    for (const row of data || []) {
      rows.set(String(row.case_id), {
        billing_scheduled_on: null,
        collection_month: null,
        total_amount: Number(row.total_amount || 0),
      })
    }
    if ((data || []).length < 1000) break
  }
  return rows
}

async function fetchCaseBilling(): Promise<{
  ready: boolean
  rows: Map<string, { billing_scheduled_on: string | null; collection_month: string | null; total_amount: number }>
}> {
  const rows = new Map<string, { billing_scheduled_on: string | null; collection_month: string | null; total_amount: number }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cases')
      .select('case_id, total_amount, billing_scheduled_on, collection_month')
      .range(from, from + 999)
    if (error) {
      const message = `${error.message || ''} ${error.details || ''}`
      if (/billing_scheduled_on|collection_month|schema cache|does not exist/i.test(message)) {
        return { ready: false, rows: await fetchCaseAmounts() }
      }
      throw error
    }
    for (const row of data || []) {
      rows.set(String(row.case_id), {
        billing_scheduled_on: row.billing_scheduled_on ? String(row.billing_scheduled_on).slice(0, 10) : null,
        collection_month: row.collection_month ? String(row.collection_month).slice(0, 7) : null,
        total_amount: Number(row.total_amount || 0),
      })
    }
    if ((data || []).length < 1000) break
  }
  return { ready: true, rows }
}

async function fetchCustomerTerms() {
  const terms = new Map<string, { closeDay: number | null; cycle: number | null }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('customers')
      .select('name, close_day, collect_cycle')
      .range(from, from + 999)
    if (error) throw error
    for (const row of data || []) {
      const key = normalizeCustomerName(row.name)
      if (!key) continue
      const next = {
        closeDay: row.close_day == null ? null : Number(row.close_day),
        cycle: row.collect_cycle == null ? null : Number(row.collect_cycle),
      }
      const prev = terms.get(key)
      if (!prev || (prev.closeDay == null && next.closeDay != null)) terms.set(key, next)
    }
    if ((data || []).length < 1000) break
  }
  return terms
}

function filterCasesByStaff(
  allCases: CaseWithDetails[],
  filter: string,
  options: { id: string; name: string }[],
) {
  if (!filter) return allCases
  const selectedName = options.find((staff) => staff.id === filter)?.name
  return allCases.filter((c) => {
    if (c.staff_id && String(c.staff_id) === String(filter)) return true
    if (!selectedName) return false
    return c.staff_name === selectedName
  })
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
  const [contractRows, setContractRows] = useState<ContractReportRow[]>([])
  const [reportKind, setReportKind] = useState<'detail' | 'contract'>('detail')
  const [reportMeta, setReportMeta] = useState({ staffLabel: 'すべて', count: 0 })
  const [printToken, setPrintToken] = useState(0)
  const [customerTerms, setCustomerTerms] = useState<Map<string, { closeDay: number | null; cycle: number | null }>>(new Map())
  const [billingColumnReady, setBillingColumnReady] = useState(true)
  const printRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: reportKind === 'contract'
      ? `受注完了回収予定_${exportStartDate || '全件'}_${exportEndDate || '全件'}`
      : `案件明細表_${exportStartDate || '開始未指定'}_${exportEndDate || '終了未指定'}`,
    pageStyle: `
      @page {
        size: A4 landscape;
        margin: 5mm;
      }
      @media print {
        html, body { margin: 0; padding: 0; }
        body {
          font-family: "Yu Gothic", "YuGothic", Meiryo, "MS PGothic", sans-serif;
          font-weight: 700;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `,
  })
  const printFnRef = useRef(handlePrint)
  printFnRef.current = handlePrint

  useEffect(() => {
    if (printToken === 0) return
    const timer = window.setTimeout(() => {
      printFnRef.current()
    }, 200)
    return () => window.clearTimeout(timer)
  }, [printToken])

  useEffect(() => {
    const stored = readStoredStaffFilter()
    if (stored) setStaffFilter(stored)
    fetchStaffOptions()
    fetchCases(stored)
  }, [])

  useEffect(() => {
    if (originalCases.length === 0) return
    const filter = staffFilter || readStoredStaffFilter()
    if (!filter) return
    setCases(filterCasesByStaff(originalCases, filter, staffOptions))
  }, [staffOptions])

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

  const fetchCases = async (staffIdFilter?: string) => {
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
          billing_scheduled_on: null,
          collection_month: null,
          total_amount: 0,
        }
      })

      const [billingById, terms] = await Promise.all([
        fetchCaseBilling(),
        fetchCustomerTerms(),
      ])
      setBillingColumnReady(billingById.ready)
      setCustomerTerms(terms)
      for (const row of formattedCases) {
        const billing = billingById.rows.get(row.case_id)
        if (!billing) continue
        row.billing_scheduled_on = billing.billing_scheduled_on
        row.collection_month = billing.collection_month
        row.total_amount = billing.total_amount
      }

      const filter = staffIdFilter !== undefined ? staffIdFilter : (staffFilter || readStoredStaffFilter())
      setOriginalCases(formattedCases)
      setCases(filterCasesByStaff(formattedCases, filter, staffOptions))

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
      const apply = (list: CaseWithDetails[]) =>
        list.map((c) => (c.case_id === caseId ? { ...c, status: newStatus } : c))
      setCases(apply)
      setOriginalCases(apply)

      console.log(`✅ ステータスを「${newStatus}」に更新しました`)
    } catch (error) {
      console.error('ステータス更新エラー:', error)
      alert('ステータスの更新に失敗しました')
      // エラー時も元の値に戻す
      setCases([...cases])
    }
  }

  const handleBillingDateChange = async (caseId: string, value: string) => {
    const nextDate = value || null
    const previous = originalCases.find((row) => row.case_id === caseId)?.billing_scheduled_on ?? null
    const apply = (list: CaseWithDetails[]) =>
      list.map((row) => (row.case_id === caseId ? { ...row, billing_scheduled_on: nextDate } : row))
    setCases(apply)
    setOriginalCases(apply)
    const { error } = await supabase
      .from('cases')
      .update({ billing_scheduled_on: nextDate })
      .eq('case_id', caseId)
    if (error) {
      const message = `${error.message || ''}`
      const applyBack = (list: CaseWithDetails[]) =>
        list.map((row) => (row.case_id === caseId ? { ...row, billing_scheduled_on: previous } : row))
      setCases(applyBack)
      setOriginalCases(applyBack)
      alert(
        /billing_scheduled_on|collection_month|schema cache|does not exist/i.test(message)
          ? '請求予定日の列がありません。Supabase で add_cases_billing_scheduled_on.sql を実行してください。'
          : '請求予定日の保存に失敗しました',
      )
    }
  }

  const handleCollectionMonthChange = async (caseId: string, value: string) => {
    const nextMonth = value || null
    const previous = originalCases.find((row) => row.case_id === caseId)?.collection_month ?? null
    const apply = (list: CaseWithDetails[]) =>
      list.map((row) => (row.case_id === caseId ? { ...row, collection_month: nextMonth } : row))
    setCases(apply)
    setOriginalCases(apply)
    const { error } = await supabase.from('cases').update({ collection_month: nextMonth }).eq('case_id', caseId)
    if (error) {
      const message = `${error.message || ''}`
      const applyBack = (list: CaseWithDetails[]) =>
        list.map((row) => (row.case_id === caseId ? { ...row, collection_month: previous } : row))
      setCases(applyBack)
      setOriginalCases(applyBack)
      alert(
        /collection_month|schema cache|does not exist/i.test(message)
          ? '回収月の列がありません。Supabase で add_cases_billing_scheduled_on.sql を実行してください。'
          : '回収月の保存に失敗しました',
      )
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
    writeStoredStaffFilter(staffFilter)
    setCases(filterCasesByStaff(originalCases, staffFilter, staffOptions))
  }

  const handleShowAll = () => {
    writeStoredStaffFilter('')
    setStaffFilter('')
    fetchCases('')
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

      setReportKind('detail')
      setReportRows(rows)
      setReportMeta({
        staffLabel: getSelectedStaffLabel(),
        count: rows.length,
      })
      setPrintToken((token) => token + 1)
    } catch (error) {
      console.error('PDF出力エラー:', error)
      alert(error instanceof Error ? error.message : 'PDF出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  const handleExportContractPdf = async () => {
    if ((exportStartDate || exportEndDate) && !validateExportDateRange()) return

    const scoped = filterCasesByStaff(originalCases, staffFilter, staffOptions).filter((row) => {
      if (!isCollectionTarget(row.status)) return false
      if (!exportStartDate && !exportEndDate) return true
      const day = String(row.created_date || '').slice(0, 10)
      return day >= exportStartDate && day <= exportEndDate
    })
    if (scoped.length === 0) {
      alert('対象の受注・完了案件がありません')
      return
    }

    setExporting(true)
    try {
      const caseIds = scoped.map((row) => row.case_id)
      const amountRows: any[] = []
      for (let i = 0; i < caseIds.length; i += 80) {
        const chunk = caseIds.slice(i, i + 80)
        const { data, error } = await supabase
          .from('cases')
          .select('case_id, total_amount, gross_profit, gross_margin')
          .in('case_id', chunk)
        if (error) {
          const errText = `${error.message || ''} ${error.details || ''}`.toLowerCase()
          const missingAmountColumns =
            errText.includes('column') &&
            (errText.includes('total_amount') || errText.includes('gross_profit') || errText.includes('gross_margin'))
          if (!missingAmountColumns) throw new Error('案件金額データの取得に失敗しました')
          break
        }
        amountRows.push(...(data || []))
      }
      const detailData = await fetchCaseDetailsForReport(supabase, caseIds)
      const productIds = Array.from(
        new Set(
          detailData
            .map((detail) => (detail.product_id != null ? String(detail.product_id) : ''))
            .filter(Boolean),
        ),
      )
      const productCostMap = await fetchProductCostMap(supabase, productIds)
      const groupedDetails = mapDetailRowsForReport(detailData, productCostMap)
      const amountByCaseId = new Map(amountRows.map((row) => [row.case_id, row]))

      const rows = scoped.map((row) => {
        const caseAmount = amountByCaseId.get(row.case_id)
        const storedBusiness = deriveBusinessFallback(caseAmount?.total_amount ?? row.total_amount)
        const amounts = computeCaseAmounts(groupedDetails.get(row.case_id) || [], {
          businessTotal: storedBusiness,
          grossProfitTotal: deriveGrossProfitFallback(
            caseAmount?.gross_profit,
            caseAmount?.total_amount ?? row.total_amount,
            caseAmount?.gross_margin,
          ),
        })
        const collection = collectionScheduleForCase(row, customerTerms)
        return {
          customer_name: row.customer_name || '不明',
          subject: row.subject || '-',
          business_total: storedBusiness !== 0 ? storedBusiness : amounts.businessTotal,
          billing_scheduled_on: row.billing_scheduled_on,
          collection_month_label: collection.label,
          collection_sort: collection.sort,
          gross_profit_total: amounts.grossProfitTotal,
        }
      })
      rows.sort((a, b) =>
        a.collection_sort.localeCompare(b.collection_sort)
        || a.customer_name.localeCompare(b.customer_name, 'ja')
        || a.subject.localeCompare(b.subject, 'ja'),
      )

      setReportKind('contract')
      setContractRows(rows)
      setReportMeta({
        staffLabel: getSelectedStaffLabel(),
        count: rows.length,
      })
      setPrintToken((token) => token + 1)
    } catch (error) {
      console.error('成約PDF出力エラー:', error)
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
  const contractTables = contractFiscalTables(contractRows)
  const contractPeriodLabel = exportStartDate && exportEndDate
    ? `${exportStartDate} ～ ${exportEndDate}`
    : '指定なし（受注・完了の全件）'

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
        <button
          onClick={() => void handleExportContractPdf()}
          disabled={exporting}
          className="btn-3d btn-primary"
          style={{ padding: '10px 18px', opacity: exporting ? 0.6 : 1, backgroundColor: '#b45309', borderColor: '#92400e' }}
        >
          {exporting ? '出力中...' : '受注・完了 PDF印刷'}
        </button>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          作成日で期間指定。未指定なら受注と完了の全件です。担当者の選択が反映されます。
        </span>
      </div>

      {!billingColumnReady && (
        <p style={{ color: '#fcd34d', fontSize: 13 }}>
          請求予定日と手入力の回収月を保存するには、Supabase で add_cases_billing_scheduled_on.sql を実行してください。
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
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
            <th style={thStyle}>請求予定日</th>
            <th style={thStyle}>回収月</th>
            <th style={thStyle}>回収額</th>
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
              <td style={tdStyle}>
                {isCollectionTarget(c.status) ? (
                  <input
                    type="date"
                    value={c.billing_scheduled_on || ''}
                    onChange={(e) => void handleBillingDateChange(c.case_id, e.target.value)}
                    style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4, padding: '4px 6px' }}
                  />
                ) : (
                  '—'
                )}
              </td>
              <td style={tdStyle}>
                {isCollectionTarget(c.status) && !customerTermsFor(c, customerTerms) ? (
                  <input
                    type="month"
                    value={c.collection_month || ''}
                    onChange={(e) => void handleCollectionMonthChange(c.case_id, e.target.value)}
                    style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4, padding: '4px 6px' }}
                  />
                ) : (
                  collectionForCase(c, customerTerms)
                )}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {isCollectionTarget(c.status) ? formatYen(c.total_amount) : '—'}
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
      </div>

      {cases.length === 0 && (
        <p style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>
          案件がありません
        </p>
      )}

      <div style={{ position: 'absolute', left: -99999, top: 0 }}>
        <div ref={printRef} style={{ width: '287mm', boxSizing: 'border-box', padding: 0, backgroundColor: '#ffffff', color: '#000000', fontFamily: '"Yu Gothic", "YuGothic", Meiryo, "MS PGothic", sans-serif', fontWeight: 700 }}>
          {reportKind === 'contract' ? (
            <>
              <div style={{ marginBottom: 6 }}>
                <h1 style={{ margin: '0 0 4px', fontSize: '14pt', fontWeight: 700 }}>受注・完了一覧（回収予定）</h1>
                <div style={{ fontSize: '9pt', fontWeight: 700, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>作成日: {contractPeriodLabel}</span>
                  <span>担当者: {reportMeta.staffLabel}</span>
                  <span>件数: {reportMeta.count} 件</span>
                  <span>出力日: {new Date().toLocaleDateString('ja-JP')}</span>
                </div>
                <div style={{ fontSize: '8pt', fontWeight: 700, marginTop: 2 }}>
                  列は9月から翌年8月です。回収予定額は事業費（税込）をその月の列に入れ、最下行が月ごとの合計です。粗利額は税抜、単位は円です。
                </div>
              </div>
              {contractTables.map((table) => {
                const monthTotals = table.slots.map((slot) =>
                  table.rows.reduce((sum, row) => sum + (row.collection_sort === slot.key ? row.business_total : 0), 0),
                )
                const businessTotal = table.rows.reduce((sum, row) => sum + row.business_total, 0)
                const grossTotal = table.rows.reduce((sum, row) => sum + row.gross_profit_total, 0)
                return (
                  <div key={table.fiscalYear} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '11pt', fontWeight: 700, marginBottom: 3 }}>{fiscalYearLabel(table.fiscalYear)}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ ...printMonthThStyle, width: '11%' }} rowSpan={2}>顧客名</th>
                          <th style={{ ...printMonthThStyle, width: '13%' }} rowSpan={2}>件名</th>
                          <th style={{ ...printMonthThStyle, width: '8%' }} rowSpan={2}>事業費</th>
                          <th style={{ ...printMonthThStyle, width: '8%' }} rowSpan={2}>請求予定日</th>
                          <th style={{ ...printMonthThStyle, backgroundColor: '#cbd5e1' }} colSpan={4}>{table.slots[0].year}年</th>
                          <th style={{ ...printMonthThStyle, backgroundColor: '#cbd5e1' }} colSpan={8}>{table.slots[4].year}年</th>
                          <th style={{ ...printMonthThStyle, width: '8%' }} rowSpan={2}>粗利額</th>
                        </tr>
                        <tr>
                          {table.slots.map((slot) => (
                            <th key={slot.key} style={{ ...printMonthThStyle, textAlign: 'right' }}>{slot.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, index) => (
                          <tr key={`${table.fiscalYear}-${row.customer_name}-${row.subject}-${index}`}>
                            <td style={printMonthTdStyle}>{row.customer_name}</td>
                            <td style={printMonthTdStyle}>{row.subject}</td>
                            <td style={printMonthAmountStyle}>{formatSheetAmount(row.business_total)}</td>
                            <td style={{ ...printMonthAmountStyle, textAlign: 'center' }}>{row.billing_scheduled_on ? formatReportDate(row.billing_scheduled_on) : '—'}</td>
                            {table.slots.map((slot) => (
                              <td key={slot.key} style={printMonthAmountStyle}>
                                {row.collection_sort === slot.key ? formatSheetAmount(row.business_total) : ''}
                              </td>
                            ))}
                            <td style={printMonthAmountStyle}>{formatSheetAmount(row.gross_profit_total)}</td>
                          </tr>
                        ))}
                        {table.rows.length > 0 && (
                          <tr>
                            <td style={printMonthTotalStyle} colSpan={2}>回収予定額計</td>
                            <td style={printMonthAmountTotalStyle}>{formatSheetAmount(businessTotal)}</td>
                            <td style={printMonthTotalStyle} />
                            {monthTotals.map((total, index) => (
                              <td key={table.slots[index].key} style={printMonthAmountTotalStyle}>{formatSheetAmount(total)}</td>
                            ))}
                            <td style={printMonthAmountTotalStyle}>{formatSheetAmount(grossTotal)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>
          ) : (
          <>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: '16pt', fontWeight: 700 }}>案件明細表</h1>
            <div style={{ fontSize: '11pt', fontWeight: 700, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
          </>
          )}
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
  border: '1px solid #000',
  padding: '4px 4px',
  backgroundColor: '#e2e8f0',
  textAlign: 'left',
  fontSize: '11pt',
  fontWeight: 700,
  color: '#000',
}

const printTdStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '4px 4px',
  fontSize: '11pt',
  fontWeight: 700,
  color: '#000',
  verticalAlign: 'top',
  wordBreak: 'break-word',
}

const printTotalStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '4px 4px',
  fontSize: '11pt',
  fontWeight: 700,
  color: '#000',
  backgroundColor: '#f8fafc',
}

const printMonthThStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '3px 1px',
  backgroundColor: '#e2e8f0',
  textAlign: 'center',
  fontSize: '10pt',
  fontWeight: 700,
  color: '#000',
  lineHeight: 1.2,
}

const printMonthTdStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '3px 2px',
  fontSize: '10pt',
  fontWeight: 700,
  color: '#000',
  verticalAlign: 'top',
  wordBreak: 'break-word',
  lineHeight: 1.25,
}

const printMonthAmountStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '3px 1px',
  fontSize: '8.5pt',
  fontWeight: 700,
  color: '#000',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
}

const printMonthTotalStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '3px 2px',
  fontSize: '10pt',
  fontWeight: 700,
  color: '#000',
  backgroundColor: '#f8fafc',
}

const printMonthAmountTotalStyle: React.CSSProperties = {
  ...printMonthAmountStyle,
  backgroundColor: '#f8fafc',
}