'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'
import { useReactToPrint } from 'react-to-print'
import PrintEstimate from './PrintEstimate'

function generateCaseId(): string {
  const timestamp = Date.now().toString(16)
  const randomPart = Math.random().toString(16).substring(2, 10)
  return `${timestamp}${randomPart}`.substring(0, 16)
}

type Product = { 
  id: string
  name: string
  spec: string
  unit: string
  quantity?: number | null  // ★ 追加
  unit_price: number
  cost_price: number
}
type Customer = { id: string; name: string }
type Staff = { id: number; name: string }
type Section = { id: number; name: string }
type Row = {
  product_id: string
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  cost_price: number
  section_id: number | null
}

export default function CaseNewPage() {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)

  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [staffId, setStaffId] = useState<number | null>(null)
  const [staffName, setStaffName] = useState<string>('')
  const [subject, setSubject] = useState('')
  const [discount, setDiscount] = useState(0)
  const [taxRate, setTaxRate] = useState(0.1)
  const [rows, setRows] = useState<Row[]>([])

  const [estimateNo, setEstimateNo] = useState('')
  const [estimateDate, setEstimateDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [deliveryPlace, setDeliveryPlace] = useState('お打合せの通り')
  const [deliveryDeadline, setDeliveryDeadline] = useState('お打合せの通り')
  const [deliveryTerms, setDeliveryTerms] = useState('お打合せの通り')
  const [validityText, setValidityText] = useState('お打合せの通り')
  const [paymentTerms, setPaymentTerms] = useState('お打合せの通り')

  const [layoutType, setLayoutType] = useState<'vertical' | 'horizontal'>(
    'vertical'
  )
  const [sections, setSections] = useState<Section[]>([])
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')

  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showPastCaseModal, setShowPastCaseModal] = useState(false)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [staffs, setStaffs] = useState<Staff[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pastCases, setPastCases] = useState<any[]>([])

  const [customerSearchName, setCustomerSearchName] = useState('')
  const [productSearchName, setProductSearchName] = useState('')
  const [productSearchSpec, setProductSearchSpec] = useState('')
  const [pastCaseSearchSubject, setPastCaseSearchSubject] = useState('')
  const [printReady, setPrintReady] = useState(false)

  // ★ 直接入力用state
  const [productModalTab, setProductModalTab] = useState<'search' | 'manual'>('search')
  const [manualProductName, setManualProductName] = useState('')
  const [manualProductSpec, setManualProductSpec] = useState('')
  const [manualProductUnit, setManualProductUnit] = useState('')
  const [manualProductUnitPrice, setManualProductUnitPrice] = useState(0)
  const [manualProductCostPrice, setManualProductCostPrice] = useState(0)
  const [manualProductQuantity, setManualProductQuantity] = useState(1)

  // ★ テーブル・モーダル用スタイル定義（未定義エラー対策）
  const thStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: 6,
    backgroundColor: '#f1f3f5',
    fontSize: 16,  // 12 → 16
    textAlign: 'center',
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    padding: 6,
    fontSize: 16,  // 12 → 16
    verticalAlign: 'middle',
    backgroundColor: '#fff',
  }
  const sumRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 16,  // 12 → 16
    padding: '4px 8px',
    borderBottom: '1px solid #eee',
  }
  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.35)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: 60,
    zIndex: 1000,
  }
  const modalContentStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 8,
    width: '900px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    fontSize: 16,  // 12 → 16
  }

  // ★ ラベル用スタイル追加
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: 16,  // 12 → 16
    fontWeight: 'bold',
  }

  // ★ 入力フィールド用スタイル追加
  const inputStyle: React.CSSProperties = {
    fontSize: 16,  // 12 → 16
  }

  // ★ ページネーション用の state を追加
  const [productPage, setProductPage] = useState(0)
  const [productTotalCount, setProductTotalCount] = useState(0)
  const productPageSize = 100  // 1ページあたり100件

  useEffect(() => {
    fetchCustomers()
    fetchStaffs()
    fetchProducts(0)  // ★ 初回は0ページ目を取得
  }, [])

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name')

    if (!error) setCustomers(data || [])
  }

  const fetchStaffs = async () => {
    const { data, error } = await supabase
      .from('staffs')
      .select('*')
      .order('name')

    if (!error) setStaffs(data || [])
  }

  const fetchProducts = async (page: number = 0) => {
    try {
      const start = page * productPageSize
      const end = start + productPageSize - 1

      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .order('name')
        .range(start, end)

      // 検索条件を追加
      if (productSearchName) {
        query = query.ilike('name', `%${productSearchName}%`)
      }
      if (productSearchSpec) {
        query = query.ilike('spec', `%${productSearchSpec}%`)
      }

      const { data, error, count } = await query

      if (error) throw error

      const normalizedData = (data || []).map(product => ({
        id: product.id || '',
        name: product.name || '',
        spec: product.spec || '',
        unit: product.unit || '',
        unit_price: product.unit_price || 0,
        cost_price: product.cost_price || 0,
      }))

      setProducts(normalizedData)
      setProductTotalCount(count || 0)
      setProductPage(page)
    } catch (error) {
      console.error('商品取得エラー:', error)
      alert('商品取得エラーが発生しました')
    }
  }

  const fetchPastCases = async () => {
    let query = supabase
      .from('cases')
      .select('*')
      .order('created_date', { ascending: false })

    if (pastCaseSearchSubject) {
      query = query.ilike('subject', `%${pastCaseSearchSubject}%`)
    }

    const { data, error } = await query

    if (!error && data) {
      const staffIds = [
        ...new Set(
          data
            .map((c) => c.staff_id)
            .filter(Boolean)
        ),
      ]

      const { data: staffsData } = await supabase
        .from('staffs')
        .select('id, name')
        .in('id', staffIds)

      const staffMap = new Map(staffsData?.map((s) => [s.id, s.name]))

      const enrichedCases = data.map((c) => ({
        ...c,
        customer_name: c.customer_id || '-',
        staff_name: staffMap.get(c.staff_id) || '-',
      }))

      setPastCases(enrichedCases)
    }
  }

  const handleCustomerSearch = async () => {
    let query = supabase.from('customers').select('*')

    if (customerSearchName) {
      query = query.ilike('name', `%${customerSearchName}%`)
    }

    const { data, error } = await query.order('name')

    if (!error) setCustomers(data || [])
  }

  const handleProductSearch = async () => {
    setProductPage(0)
    await fetchProducts(0)
  }

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerId(customer.id)
    setCustomerName(customer.name)
    setShowCustomerModal(false)
  }

  const handleSelectStaff = (staff: Staff) => {
    setStaffId(staff.id)
    setStaffName(staff.name)
    setShowStaffModal(false)
  }

  const handleSelectProduct = (product: Product) => {
    if (!product || !product.id) {
      console.error('商品情報が不正です:', product)
      alert('商品情報が不正です')
      return
    }

    console.log('選択された商品:', product) // ★ デバッグ用

    const newRow: Row = {
      product_id: product.id || '',
      item_name: product.name || '',
      spec: product.spec || '',
      unit: product.unit || '',
      quantity: product.quantity || 1,  // ★ undefined の場合は 1
      unit_price: product.unit_price || 0,  // ★ undefined の場合は 0
      amount: (product.unit_price || 0) * (product.quantity || 1),  // ★ 両方チェック
      cost_price: product.cost_price || 0,
      section_id: null,
    }

    setRows((prev) => [...prev, newRow])
    setShowProductModal(false)
  }

  // ★ 直接入力商品を追加するハンドラー
  const handleAddManualProduct = () => {
    if (!manualProductName.trim()) {
      alert('商品名を入力してください')
      return
    }

    const newRow: Row = {
      product_id: '',  // マスタに登録されていないため空
      item_name: manualProductName.trim(),
      spec: manualProductSpec.trim(),
      unit: manualProductUnit.trim() || '個',
      quantity: manualProductQuantity > 0 ? manualProductQuantity : 1,
      unit_price: manualProductUnitPrice >= 0 ? manualProductUnitPrice : 0,
      amount: (manualProductUnitPrice >= 0 ? manualProductUnitPrice : 0) * (manualProductQuantity > 0 ? manualProductQuantity : 1),
      cost_price: manualProductCostPrice >= 0 ? manualProductCostPrice : 0,
      section_id: null,
    }

    setRows((prev) => [...prev, newRow])

    // フォームをリセット
    setManualProductName('')
    setManualProductSpec('')
    setManualProductUnit('')
    setManualProductUnitPrice(0)
    setManualProductCostPrice(0)
    setManualProductQuantity(1)
    setProductModalTab('search')

    setShowProductModal(false)
  }

  const handleLoadPastCase = async (caseId: string) => {
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('case_id', caseId)
      .single()

    if (caseError || !caseData) {
      alert('案件情報の取得に失敗しました')
      return
    }

    // 担当者情報
    let staffData: Staff | null = null

    if (caseData.staff_id) {
      const { data, error } = await supabase
        .from('staffs')
        .select('id, name')
        .eq('id', caseData.staff_id)
        .single()

      if (!error && data) {
        staffData = data as Staff
      }
    }

    // 明細
    const { data: detailsData, error: detailsError } = await supabase
      .from('case_details')
      .select('*')
      .eq('case_id', caseId)

    if (detailsError || !detailsData || detailsData.length === 0) {
      alert('この案件には明細データがありません')
      return
    }

    const productIds = detailsData.map((d) => d.product_id).filter(Boolean)

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, unit')
      .in('id', productIds)

    const productMap = new Map((productsData || []).map((p) => [p.id, p]))

    const loadedRows: Row[] = detailsData.map((detail) => {
      const product = productMap.get(detail.product_id)

      return {
        product_id: detail.product_id || '',
        item_name:
          product?.name || `削除された商品(ID:${detail.product_id})`,
        spec: detail.spec || '',
        unit: product?.unit || detail.unit || '',
        quantity: detail.quantity || 1,
        unit_price: detail.unit_price || 0,
        amount: detail.amount || 0,
        cost_price: detail.cost_unit_price || 0,
        section_id: detail.section_id || null,
      }
    })

    setCustomerId(caseData.customer_id || '')
    setCustomerName(caseData.customer_id || '')
    setStaffId(staffData?.id || null)
    setStaffName(staffData?.name || '')
    setSubject(caseData.subject || '')
    setDiscount(caseData.special_discount || 0)
    setTaxRate(0.1)
    setLayoutType(caseData.layout_type || 'vertical')

    setEstimateNo('')
    setEstimateDate(
      caseData.created_date || new Date().toISOString().split('T')[0]
    )
    setDeliveryPlace(caseData.delivery_place || 'お打合せの通り')
    setDeliveryDeadline(caseData.delivery_deadline || 'お打合せの通り')
    setDeliveryTerms(caseData.delivery_terms || 'お打合せの通り')
    setValidityText(caseData.validity_text || 'お打合せの通り')
    setPaymentTerms(caseData.payment_terms || 'お打合せの通り')

    // セクション
    if (caseData.layout_type === 'horizontal') {
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('case_sections')
        .select('*')
        .eq('case_id', caseId)
        .order('section_id')

      if (!sectionsError && sectionsData) {
        const loadedSections = sectionsData.map((s) => ({
          id: s.section_id,
          name: s.section_name,
        }))
        setSections(loadedSections)
      }
    } else {
      setSections([])
    }

    setRows(loadedRows)
    setShowPastCaseModal(false)

    alert(
      `過去案件「${caseData.subject}」の情報を読み込みました\n顧客: ${
        caseData.customer_id || '不明'
      }\n担当者: ${staffData?.name || '不明'}`
    )
  }

  const handleQuantityChange = (index: number, quantity: number) => {
    const newRows = [...rows]
    newRows[index].quantity = quantity
    newRows[index].amount = quantity * newRows[index].unit_price
    setRows(newRows)
  }

  const handleUnitPriceChange = (index: number, unitPrice: number) => {
    const newRows = [...rows]
    newRows[index].unit_price = unitPrice
    newRows[index].amount = newRows[index].quantity * unitPrice
    setRows(newRows)
  }

  const handleDeleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index))
  }

  const handleAddSection = () => {
    if (!newSectionName.trim()) {
      alert('セクション名を入力してください')
      return
    }

    const newSection: Section = {
      id: sections.length + 1,
      name: newSectionName.trim(),
    }

    setSections([...sections, newSection])
    setNewSectionName('')
  }

  const handleDeleteSection = (id: number) => {
    const usedInRows = rows.some((row) => row.section_id === id)

    if (usedInRows) {
      alert('このセクションは明細で使用されているため削除できません')
      return
    }

    setSections(sections.filter((s) => s.id !== id))
  }

  const handleClear = () => {
    if (rows.length > 0 || customerId || subject) {
      if (!confirm('入力内容をクリアしてもよろしいですか？')) {
        return
      }
    }

    setCustomerId('')
    setCustomerName('')
    setStaffId(null)
    setStaffName('')
    setSubject('')
    setDiscount(0)
    setTaxRate(0.1)
    setRows([])
    setLayoutType('vertical')
    setSections([])
    setEstimateNo('')
    setEstimateDate(new Date().toISOString().split('T')[0])
    setDeliveryPlace('お打合せの通り')
    setDeliveryDeadline('お打合せの通り')
    setDeliveryTerms('お打合せの通り')
    setValidityText('お打合せの通り')
    setPaymentTerms('お打合せの通り')

    alert('入力内容をクリアしました')
  }

  const handleSave = async () => {
    if (!customerId) {
      alert('顧客を選択してください')
      return
    }

    if (!staffId) {
      alert('担当者を選択してください')
      return
    }

    if (!subject.trim()) {
      alert('件名を入力してください')
      return
    }

    if (rows.length === 0) {
      alert('明細を1件以上追加してください')
      return
    }

    if (layoutType === 'horizontal') {
      const noSectionRows = rows.filter((row) => row.section_id === null)
      if (noSectionRows.length > 0) {
        alert('横様式の場合、全ての明細にセクションを設定してください')
        return
      }
    }

    try {
      const newCaseId = generateCaseId()

      const { error: caseError } = await supabase.from('cases').insert({
        case_id: newCaseId,
        case_no: estimateNo ? parseInt(estimateNo) : null,
        subject: subject,
        created_date: estimateDate,
        customer_id: customerId,
        staff_id: staffId,
        status: '商談中',  // ★ 'draft' → '商談中' に変更
        special_discount: discount,
        layout_type: layoutType,
        delivery_place: deliveryPlace,
        delivery_deadline: deliveryDeadline,
        delivery_terms: deliveryTerms,
        validity_text: validityText,
        payment_terms: paymentTerms,
        approve_staff: null,
        approve_manager: null,
        approve_director: null,
        approve_president: null,
      })

      if (caseError) {
        throw new Error(`案件登録エラー: ${caseError.message}`)
      }

      if (layoutType === 'horizontal' && sections.length > 0) {
        const sectionsToInsert = sections.map((section) => ({
          case_id: newCaseId,
          section_id: section.id,
          section_name: section.name,
        }))

        const { error: sectionError } = await supabase
          .from('case_sections')
          .insert(sectionsToInsert)

        if (sectionError) {
          await supabase.from('cases').delete().eq('case_id', newCaseId)
          throw new Error(`セクション登録エラー: ${sectionError.message}`)
        }
      }

      const detailsToInsert = rows.map((row) => ({
        case_id: newCaseId,
        product_id: row.product_id,
        spec: row.spec,
        unit: row.unit,
        quantity: row.quantity,
        unit_price: row.unit_price,
        amount: row.amount,
        cost_unit_price: row.cost_price,
        section_id: row.section_id,
      }))

      const { error: detailsError } = await supabase
        .from('case_details')
        .insert(detailsToInsert)

      if (detailsError) {
        await supabase.from('cases').delete().eq('case_id', newCaseId)
        if (layoutType === 'horizontal') {
          await supabase.from('case_sections').delete().eq('case_id', newCaseId)
        }
        throw new Error(`明細登録エラー: ${detailsError.message}`)
      }

      alert('見積書を保存しました')
      router.push(`/cases/approval/${newCaseId}`)
    } catch (error) {
      console.error('保存エラー:', error)
      alert(
        `保存に失敗しました: ${
          error instanceof Error ? error.message : '不明なエラー'
        }`
      )
    }
  }

  // 印刷ハンドラ
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `見積書_${customerName || '無題'}_${new Date()
      .toISOString()
      .split('T')[0]}`,
  })

  const handlePrintPreview = () => {
    if (!customerId) return alert('顧客未選択')
    if (!staffId) return alert('担当者未選択')
    if (!subject.trim()) return alert('件名未入力')
    if (rows.length === 0) return alert('明細がありません')
    if (layoutType === 'horizontal' && rows.some(r => r.section_id === null)) return alert('横様式は全明細にセクション必須')
    
    // ★ 少し遅延させて印刷を実行
    setTimeout(() => {
      if (!printRef.current) {
        console.warn('printRef が未設定です')
        return alert('印刷対象の生成が完了していません')
      }
      handlePrint()
    }, 200)
  }

  // 小計等計算
  const subtotal = rows.reduce((s, r) => s + r.amount, 0)
  const totalCostAmount = rows.reduce((s, r) => s + r.cost_price * r.quantity, 0)
  const totalGrossProfit = subtotal - totalCostAmount
  const grossProfitRate = subtotal > 0 ? (totalGrossProfit / subtotal) * 100 : 0
  const subtotalAfterDiscount = subtotal - discount
  const taxAmount = Math.floor(subtotalAfterDiscount * taxRate)
  const totalAmount = subtotalAfterDiscount + taxAmount

  // State追加
  const [approvalStamps, setApprovalStamps] = useState({
    staff: false,
    manager: false,
    director: false,
    president: false,
  })

  const productTotalPages = Math.ceil(productTotalCount / productPageSize)

  return (
    <>
      {/* 入力画面 JSX（あなたの既存部分をここに配置） */}
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h1 style={{ margin: 0 }}>案件登録</h1>
          <Link
            href="/"
            className="btn-3d"
            style={{
              backgroundColor: '#6c757d',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            ← メニューに戻る
          </Link>
        </div>

        {/* 様式選択 */}
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            border: '2px solid #007bff',
            borderRadius: 4,
            backgroundColor: '#e3f2fd',
          }}
        >
          <label
            style={{
              fontWeight: 'bold',
              marginBottom: 8,
              display: 'block',
              fontSize: 20,  // 16 → 20
              color: '#007bff',
            }}
          >
            📋 様式選択:
          </label>

          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                padding: '8px 12px',
                backgroundColor:
                  layoutType === 'vertical' ? '#fff' : 'transparent',
                borderRadius: 4,
                border:
                  layoutType === 'vertical'
                    ? '2px solid #007bff'
                    : '2px solid transparent',
              }}
            >
              <input
                type="radio"
                name="layoutType"
                value="vertical"
                checked={layoutType === 'vertical'}
                onChange={() => {
                  setLayoutType('vertical')
                  setSections([])
                }}
                style={{
                  width: 20,
                  height: 20,
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 18, fontWeight: 'bold' }}>
                📄 縦様式（セクションなし）
              </span>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                padding: '8px 12px',
                backgroundColor:
                  layoutType === 'horizontal' ? '#fff' : 'transparent',
                borderRadius: 4,
                border:
                  layoutType === 'horizontal'
                    ? '2px solid #007bff'
                    : '2px solid transparent',
              }}
            >
              <input
                type="radio"
                name="layoutType"
                value="horizontal"
                checked={layoutType === 'horizontal'}
                onChange={() => {
                  setLayoutType('horizontal')
                  setShowSectionModal(true)
                }}
                style={{
                  width: 20,
                  height: 20,
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 18, fontWeight: 'bold' }}>
                📊 横様式(セクションあり)
              </span>
            </label>

            {layoutType === 'horizontal' && (
              <button
                onClick={() => setShowSectionModal(true)}
                className="btn-3d"
                style={{
                  fontSize: 16,
                  backgroundColor: '#6c757d',
                  color: '#fff',
                  padding: '8px 16px',
                }}
              >
                ⚙️ セクション設定
              </button>
            )}
          </div>

          {layoutType === 'horizontal' && sections.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 8,
                backgroundColor: '#fff',
                borderRadius: 4,
              }}
            >
              <strong>📌 登録済みセクション:</strong>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                {sections.map((section) => (
                  <span
                    key={section.id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      borderRadius: 4,
                      fontSize: 16,
                      fontWeight: 'bold',
                    }}
                  >
                    {section.id}. {section.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 付帯情報 */}
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            border: '1px solid #ddd',
            borderRadius: 4,
            backgroundColor: '#f8f9fa',
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: 12,
              fontSize: 20,  // 16 → 20
              fontWeight: 'bold',
            }}
          >
            📝 付帯情報
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>
                見積番号:
              </label>
              <input
                type="text"
                value={estimateNo}
                onChange={(e) => setEstimateNo(e.target.value)}
                className="input-inset"
                style={{ width: '100%', fontSize: 16 }}
                placeholder="数値のみ入力"
              />
              <span style={{ fontSize: 14, color: '#666' }}>
                ※空欄の場合は未採番
              </span>
            </div>

            <div>
              <label style={labelStyle}>
                日付:
              </label>
              <input
                type="date"
                value={estimateDate}
                onChange={(e) => setEstimateDate(e.target.value)}
                className="input-inset"
                style={{ width: '100%', fontSize: 16 }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                受渡場所:
              </label>
              <input
                type="text"
                value={deliveryPlace}
                onChange={(e) => setDeliveryPlace(e.target.value)}
                className="input-inset"
                style={{ width: '100%', fontSize: 16 }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                受渡期限:
              </label>
              <input
                type="text"
                value={deliveryDeadline}
                onChange={(e) => setDeliveryDeadline(e.target.value)}
                className="input-inset"
                style={{ width: '100%', fontSize: 16 }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                受渡条件:
              </label>
              <input
                type="text"
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                className="input-inset"
                style={{ width: '100%', fontSize: 16 }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                有効期限:
              </label>
              <input
                type="text"
                value={validityText}
                onChange={(e) => setValidityText(e.target.value)}
                className="input-inset"
                style={{ width: '100%', fontSize: 16 }}
              />
            </div>

            <div style={{ gridColumn: 'span 3' }}>
              <label style={labelStyle}>
                御支払条件:
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="input-inset"
                style={{ width: '100%', fontSize: 16 }}
              />
            </div>
          </div>
        </div>

        {/* 顧客・担当者 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>顧客:</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                type="text"
                value={customerName}
                readOnly
                className="input-inset"
                style={{ flex: 1, fontSize: 16 }}
                placeholder="顧客を選択してください"
              />
              <button
                onClick={() => setShowCustomerModal(true)}
                className="btn-3d btn-search"
                style={{ fontSize: 16 }}
              >
                顧客選択
              </button>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <label style={labelStyle}>担当者:</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                type="text"
                value={staffName}
                readOnly
                className="input-inset"
                style={{ flex: 1, fontSize: 16 }}
                placeholder="担当者を選択してください"
              />
              <button
                onClick={() => setShowStaffModal(true)}
                className="btn-3d btn-search"
                style={{ fontSize: 16 }}
              >
                担当者選択
              </button>
            </div>
          </div>
        </div>

        {/* 件名 */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>件名:</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input-inset"
            style={{ width: '100%', marginTop: 4, fontSize: 16 }}
            placeholder="例: ○○工事見積"
          />
        </div>

        {/* 明細 */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h2 style={{ margin: 0 }}>明細</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  fetchPastCases()
                  setShowPastCaseModal(true)
                }}
                className="btn-3d"
                style={{ backgroundColor: '#17a2b8', color: '#fff' }}
              >
                📋 過去案件から読込
              </button>
              <button
                onClick={() => setShowProductModal(true)}
                className="btn-3d btn-primary"
              >
                + 商品追加
              </button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {layoutType === 'horizontal' && (
                  <th style={thStyle}>セクション</th>
                )}
                <th style={thStyle}>商品名</th>
                <th style={thStyle}>規格</th>
                <th style={thStyle}>単位</th>
                <th style={thStyle}>数量</th>
                <th style={thStyle}>単価</th>
                <th style={thStyle}>金額</th>
                <th style={thStyle}>原価額</th>
                <th style={thStyle}>粗利額</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const costAmount = row.cost_price * row.quantity
                const grossProfit = row.amount - costAmount

                return (
                  <tr key={index}>
                    {layoutType === 'horizontal' && (
                      <td style={tdStyle}>
                        <select
                          value={row.section_id || ''}
                          onChange={(e) => {
                            const newRows = [...rows]
                            newRows[index].section_id = e.target.value
                              ? Number(e.target.value)
                              : null
                            setRows(newRows)
                          }}
                          className="input-inset"
                          style={{ width: 150 }}
                        >
                          <option value="">選択してください</option>
                          {sections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {section.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td style={tdStyle}>{row.item_name}</td>
                    <td style={tdStyle}>{row.spec}</td>
                    <td style={tdStyle}>{row.unit}</td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        value={row.quantity}
                        onChange={(e) =>
                          handleQuantityChange(index, Number(e.target.value))
                        }
                        className="input-inset"
                        style={{ width: 80, fontSize: 16 }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        value={row.unit_price}
                        onChange={(e) =>
                          handleUnitPriceChange(index, Number(e.target.value))
                        }
                        className="input-inset"
                        style={{ width: 100, fontSize: 16 }}
                      />
                    </td>
                    <td style={tdStyle}>{row.amount.toLocaleString()}</td>
                    <td style={tdStyle}>{costAmount.toLocaleString()}</td>
                    <td style={tdStyle}>{grossProfit.toLocaleString()}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleDeleteRow(index)}
                        className="btn-3d"
                        style={{
                          backgroundColor: '#dc3545',
                          color: '#fff',
                          fontSize: 15,
                        }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 合計・出精値引き・消費税 */}
        <div
          style={{
            marginLeft: 'auto',
            maxWidth: 400,
            marginBottom: 24,
          }}
        >
          <div style={sumRowStyle}>
            <span>小計</span>
            <span>{subtotal.toLocaleString()} 円</span>
          </div>
          <div style={sumRowStyle}>
            <span>総原価額</span>
            <span>{totalCostAmount.toLocaleString()} 円</span>
          </div>
          <div style={sumRowStyle}>
            <span>粗利額</span>
            <span>{totalGrossProfit.toLocaleString()} 円</span>
          </div>
          <div style={sumRowStyle}>
            <span>粗利率</span>
            <span>{grossProfitRate.toFixed(1)} %</span>
          </div>
          <div style={sumRowStyle}>
            <span>出精値引き</span>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="input-inset"
              style={{ width: 120, textAlign: 'right', fontSize: 16 }}
            />
          </div>
          <div style={sumRowStyle}>
            <span>値引後小計</span>
            <span>{subtotalAfterDiscount.toLocaleString()} 円</span>
          </div>
          <div style={sumRowStyle}>
            <span>消費税 ({(taxRate * 100).toFixed(0)}%)</span>
            <span>{taxAmount.toLocaleString()} 円</span>
          </div>
          <div
            style={{
              ...sumRowStyle,
              fontWeight: 'bold',
              fontSize: 18,
              backgroundColor: '#f8f9fa',
            }}
          >
            <span>合計金額</span>
            <span style={{ color: '#dc3545' }}>
              {totalAmount.toLocaleString()} 円
            </span>
          </div>
        </div>

        {/* 保存・印刷ボタン */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            justifyContent: 'flex-end',
          }}
        >
          <button onClick={handleClear} className="btn-3d btn-reset">
            キャンセル
          </button>
          <button
            onClick={handlePrintPreview}
            className="btn-3d"
            style={{ backgroundColor: '#17a2b8', color: '#fff' }}
          >
            📄 PDF印刷プレビュー
          </button>
          <button onClick={handleSave} className="btn-3d btn-primary">
            保存
          </button>
        </div>

        {/* セクション設定モーダル */}
        {showSectionModal && (
          <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
              <h2>セクション設定</h2>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>セクション名:</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === 'Enter' && handleAddSection()
                    }
                    className="input-inset"
                    style={{ flex: 1, fontSize: 16 }}
                    placeholder="例: 仮設工事"
                  />
                  <button
                    onClick={handleAddSection}
                    className="btn-3d btn-primary"
                  >
                    追加
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <strong>登録済みセクション:</strong>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    marginTop: 8,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>ID</th>
                      <th style={thStyle}>セクション名</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((section) => (
                      <tr key={section.id}>
                        <td style={tdStyle}>{section.id}</td>
                        <td style={tdStyle}>{section.name}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => handleDeleteSection(section.id)}
                            className="btn-3d"
                            style={{
                              backgroundColor: '#dc3545',
                              color: '#fff',
                              fontSize: 15,
                            }}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sections.length === 0 && (
                  <p
                    style={{
                      color: '#999',
                      textAlign: 'center',
                      marginTop: 16,
                    }}
                  >
                    セクションが登録されていません
                  </p>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={() => setShowSectionModal(false)}
                  className="btn-3d btn-primary"
                >
                  完了
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 顧客選択モーダル */}
        {showCustomerModal && (
          <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
              <h2>顧客選択</h2>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="顧客名で検索"
                  value={customerSearchName}
                  onChange={(e) => setCustomerSearchName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCustomerSearch()}
                  className="input-inset"
                  style={{ flex: 1, fontSize: 16 }}
                />
                <button
                  onClick={handleCustomerSearch}
                  className="btn-3d btn-search"
                >
                  検索
                </button>
                <button
                  onClick={() => {
                    setShowCustomerModal(false)
                    router.push('/customers/select')
                  }}
                  className="btn-3d"
                  style={{ backgroundColor: '#28a745', color: '#fff' }}
                >
                  + 新規登録
                </button>
              </div>

              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>顧客名</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan={2} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
                          該当する顧客が見つかりません
                          <br />
                          <button
                            onClick={() => {
                              setShowCustomerModal(false)
                              router.push('/customers/select')
                            }}
                            className="btn-3d"
                            style={{ backgroundColor: '#28a745', color: '#fff', marginTop: 8 }}
                          >
                            新規顧客を登録
                          </button>
                        </td>
                      </tr>
                    ) : (
                      customers.map((customer) => (
                        <tr key={customer.id}>
                          <td style={tdStyle}>{customer.name}</td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => handleSelectCustomer(customer)}
                              className="btn-3d btn-primary"
                              style={{ fontSize: 16 }}
                            >
                              選択
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="btn-3d btn-reset"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 担当者選択モーダル */}
        {showStaffModal && (
          <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
              <h2>担当者選択</h2>

              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>担当者名</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffs.map((staff) => (
                      <tr key={staff.id}>
                        <td style={tdStyle}>{staff.name}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => handleSelectStaff(staff)}
                            className="btn-3d btn-primary"
                            style={{ fontSize: 15 }}
                          >
                            選択
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button
                  onClick={() => setShowStaffModal(false)}
                  className="btn-3d btn-reset"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 商品選択モーダル */}
        {showProductModal && (
          <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
              <h2>商品追加</h2>

              {/* ★ タブボタン */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #ddd' }}>
                <button
                  onClick={() => setProductModalTab('search')}
                  className="btn-3d"
                  style={{
                    backgroundColor: productModalTab === 'search' ? '#007bff' : '#e9ecef',
                    color: productModalTab === 'search' ? '#fff' : '#333',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}
                >
                  📚 マスタから選択
                </button>
                <button
                  onClick={() => setProductModalTab('manual')}
                  className="btn-3d"
                  style={{
                    backgroundColor: productModalTab === 'manual' ? '#007bff' : '#e9ecef',
                    color: productModalTab === 'manual' ? '#fff' : '#333',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}
                >
                  ✏️ 直接入力
                </button>
              </div>

              {/* ★ マスタから選択タブ */}
              {productModalTab === 'search' && (
                <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="商品名で検索"
                  value={productSearchName}
                  onChange={(e) => setProductSearchName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleProductSearch()}
                  className="input-inset"
                  style={{ flex: 1, fontSize: 16 }}
                />
                <input
                  type="text"
                  placeholder="規格で検索"
                  value={productSearchSpec}
                  onChange={(e) => setProductSearchSpec(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleProductSearch()}
                  className="input-inset"
                  style={{ flex: 1, fontSize: 16 }}
                />
                <button
                  onClick={handleProductSearch}
                  className="btn-3d btn-search"
                >
                  検索
                </button>
              </div>

              {/* ★ ページネーション情報 */}
              <div style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>
                全 {productTotalCount} 件中 {productPage * productPageSize + 1} 〜 {Math.min((productPage + 1) * productPageSize, productTotalCount)} 件を表示
              </div>

              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>商品名</th>
                      <th style={thStyle}>規格</th>
                      <th style={thStyle}>単位</th>
                      <th style={thStyle}>単価</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td style={tdStyle}>{product.name}</td>
                        <td style={tdStyle}>{product.spec || '-'}</td>
                        <td style={tdStyle}>{product.unit || '-'}</td>
                        <td style={tdStyle}>
                          {(product.unit_price || 0).toLocaleString()}
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => handleSelectProduct(product)}
                            className="btn-3d btn-primary"
                            style={{ fontSize: 15 }}
                          >
                            選択
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ★ ページネーションボタン */}
              {productTotalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
                  <button
                    disabled={productPage === 0}
                    onClick={() => fetchProducts(0)}
                    className="btn-3d"
                    style={{ fontSize: 14, padding: '4px 8px' }}
                  >
                    最初
                  </button>
                  <button
                    disabled={productPage === 0}
                    onClick={() => fetchProducts(productPage - 1)}
                    className="btn-3d"
                    style={{ fontSize: 14, padding: '4px 8px' }}
                  >
                    ← 前へ
                  </button>
                  <span style={{ fontSize: 16, fontWeight: 'bold' }}>
                    {productPage + 1} / {productTotalPages}
                  </span>
                  <button
                    disabled={productPage === productTotalPages - 1}
                    onClick={() => fetchProducts(productPage + 1)}
                    className="btn-3d"
                    style={{ fontSize: 14, padding: '4px 8px' }}
                  >
                    次へ →
                  </button>
                  <button
                    disabled={productPage === productTotalPages - 1}
                    onClick={() => fetchProducts(productTotalPages - 1)}
                    className="btn-3d"
                    style={{ fontSize: 14, padding: '4px 8px' }}
                  >
                    最後
                  </button>
                </div>
              )}

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button
                  onClick={() => {
                    setProductSearchName('')
                    setProductSearchSpec('')
                    setProducts([])
                    setProductPage(0)
                    setProductTotalCount(0)
                  }}
                  className="btn-3d btn-reset"
                  style={{ marginRight: 8 }}
                >
                  リセット
                </button>
                <button
                  onClick={() => setShowProductModal(false)}
                  className="btn-3d btn-reset"
                >
                  閉じる
                </button>
              </div>
                </>
              )}

              {/* ★ 直接入力タブ */}
              {productModalTab === 'manual' && (
                <>
              <div style={{
                padding: 16,
                backgroundColor: '#f8f9fa',
                borderRadius: 4,
                marginBottom: 16,
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}>
                  <div>
                    <label style={labelStyle}>商品名 <span style={{ color: '#dc3545' }}>*</span></label>
                    <input
                      type="text"
                      value={manualProductName}
                      onChange={(e) => setManualProductName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddManualProduct()}
                      className="input-inset"
                      style={{ width: '100%', fontSize: 16 }}
                      placeholder="商品名を入力"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>規格</label>
                    <input
                      type="text"
                      value={manualProductSpec}
                      onChange={(e) => setManualProductSpec(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddManualProduct()}
                      className="input-inset"
                      style={{ width: '100%', fontSize: 16 }}
                      placeholder="例: 1000x2000"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>単位</label>
                    <input
                      type="text"
                      value={manualProductUnit}
                      onChange={(e) => setManualProductUnit(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddManualProduct()}
                      className="input-inset"
                      style={{ width: '100%', fontSize: 16 }}
                      placeholder="例: 個、m、kg"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>数量</label>
                    <input
                      type="text"
                      value={manualProductQuantity}
                      onChange={(e) => setManualProductQuantity(Number(e.target.value) || 0)}
                      className="input-inset"
                      style={{ width: '100%', fontSize: 16 }}
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>単価</label>
                    <input
                      type="text"
                      value={manualProductUnitPrice}
                      onChange={(e) => setManualProductUnitPrice(Number(e.target.value) || 0)}
                      className="input-inset"
                      style={{ width: '100%', fontSize: 16 }}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>原価</label>
                    <input
                      type="text"
                      value={manualProductCostPrice}
                      onChange={(e) => setManualProductCostPrice(Number(e.target.value) || 0)}
                      className="input-inset"
                      style={{ width: '100%', fontSize: 16 }}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowProductModal(false)}
                  className="btn-3d btn-reset"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAddManualProduct}
                  className="btn-3d btn-primary"
                  style={{ backgroundColor: '#28a745' }}
                >
                  ✅ 追加
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 過去案件読込モーダル */}
        {showPastCaseModal && (
          <div style={modalOverlayStyle}>
            <div
              style={{
                ...modalContentStyle,
                maxWidth: 1400,  // 1200 → 1400に拡大
                width: '95%',    // 追加：画面幅の95%
              }}
            >
              <h2>過去案件から読込</h2>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="件名で検索"
                  value={pastCaseSearchSubject}
                  onChange={(e) =>
                    setPastCaseSearchSubject(e.target.value)
                  }
                  onKeyPress={(e) =>
                    e.key === 'Enter' && fetchPastCases()
                  }
                  className="input-inset"
                  style={{ flex: 1, fontSize: 18 }}
                />
                <button
                  onClick={fetchPastCases}
                  className="btn-3d btn-search"
                >
                  検索
                </button>
              </div>

              <div style={{ maxHeight: 500, overflow: 'auto' }}>  {/* 400 → 500に拡大 */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>案件No</th>
                      <th style={thStyle}>件名</th>
                      <th style={thStyle}>顧客名</th>
                      <th style={thStyle}>担当者</th>
                      <th style={thStyle}>作成日</th>
                      <th style={thStyle}>受渡場所</th>
                      <th style={thStyle}>受渡期限</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastCases.map((c) => (
                      <tr key={c.case_id}>
                        <td style={tdStyle}>
                          {c.case_no || '未採番'}
                        </td>
                        <td style={tdStyle}>{c.subject || '-'}</td>
                        <td style={tdStyle}>
                          {c.customer_name || '-'}
                        </td>
                        <td style={tdStyle}>{c.staff_name || '-'}</td>
                        <td style={tdStyle}>
                          {c.created_date || '-'}
                        </td>
                        <td style={tdStyle}>
                          {c.delivery_place || '-'}
                        </td>
                        <td style={tdStyle}>
                          {c.delivery_deadline || '-'}
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() =>
                              handleLoadPastCase(c.case_id)
                            }
                            className="btn-3d btn-primary"
                            style={{ fontSize: 15 }}
                          >
                            読込
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pastCases.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            ...tdStyle,
                            textAlign: 'center',
                            color: '#999',
                          }}
                        >
                          過去案件が見つかりません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button
                  onClick={() => setShowPastCaseModal(false)}
                  className="btn-3d btn-reset"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
{/* ここまでが画面本体 */}
</div>

{/* 印刷コンポーネント（画面外に配置） */}
<div style={{ position: 'absolute', top: 0, left: '-9999px' }}>
  <PrintEstimate
    ref={printRef}
    printRef={printRef}
    customerName={customerName || ''}
    estimateNo={estimateNo}
    estimateDate={estimateDate}
    subject={subject}
    deliveryPlace={deliveryPlace}
    deliveryDeadline={deliveryDeadline}
    deliveryTerms={deliveryTerms}
    validityText={validityText}
    paymentTerms={paymentTerms}
    rows={rows}
    sections={sections}
    discount={discount}
    taxRate={0.1}
    subtotal={subtotal}
    subtotalAfterDiscount={subtotalAfterDiscount}
    taxAmount={taxAmount}
    totalAmount={totalAmount}
    layoutType={layoutType}
    MAX_ROWS_PER_PAGE={15}  // ★ ここで1ページ15行に設定
    approvalStamps={approvalStamps}
    stampUrls={{
      staff: approvalStamps.staff ? '/stamps/staff.png' : null,
      manager: approvalStamps.manager ? '/stamps/manager.png' : null,
      director: approvalStamps.director ? '/stamps/director.png' : null,
      president: approvalStamps.president ? '/stamps/president.png' : null,
    }}
  />
</div>
    </>
  )
}