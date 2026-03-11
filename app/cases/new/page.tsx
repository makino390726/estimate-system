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
  quantity?: number | null
  unit_price: number
  cost_price: number
  retail_price?: number | null  // ★ 定価
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
  unit_price: number | null
  price_rate?: number | null
  exclude_from_total?: boolean
  amount: number
  cost_price: number
  section_id: number | null
  remarks?: string
  unregistered_product?: string  // ★ 直接入力された商品名
  comment?: string  // ★ コメント機能
  display_order?: number
}

export default function CaseNewPage() {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)

  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [honorific, setHonorific] = useState<string>('様')  // ★ 敬称
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

  // ★ 更新モード管理用
  const [isUpdateMode, setIsUpdateMode] = useState(false)
  const [loadedCaseId, setLoadedCaseId] = useState<string | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)

  // ★ 明細編集モーダル用
  const [showEditRowModal, setShowEditRowModal] = useState(false)
  const [editRowIndex, setEditRowIndex] = useState<number>(-1)
  const [editRowData, setEditRowData] = useState<Row | null>(null)

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
  const [manualProductUnitPrice, setManualProductUnitPrice] = useState<number | null>(null)
  const [manualProductCostPrice, setManualProductCostPrice] = useState(0)
  const [manualProductQuantity, setManualProductQuantity] = useState(1)

  // ★ 単価計算モーダル用state
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceModalRowIndex, setPriceModalRowIndex] = useState<number | null>(null)
  const [priceModalListPrice, setPriceModalListPrice] = useState<number | null>(null)
  const [priceModalDirectPrice, setPriceModalDirectPrice] = useState<number | null>(null)  // ★ 直接入力用の値
  const [priceModalRate, setPriceModalRate] = useState<number | null>(null)
  const [priceModalCalculatedPrice, setPriceModalCalculatedPrice] = useState<number | null>(null)
  const [priceModalMode, setPriceModalMode] = useState<'direct' | 'calculate'>('calculate')
  const [priceModalShowRemarksCheckbox, setPriceModalShowRemarksCheckbox] = useState(false)  // ★ 定価備考表示チェック

  // ★ コメント挿入機能用state
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [commentRowIndex, setCommentRowIndex] = useState<number | null>(null)
  const [commentText, setCommentText] = useState<string>('')

  // ★ テーブル・モーダル用スタイル定義（ダークテーマ対応）
  const thStyle: React.CSSProperties = {
    border: '1px solid #334155',
    padding: '8px 12px',
    backgroundColor: '#1e293b',
    fontSize: 16,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    color: '#cbd5e1',
  }
  const tdStyle: React.CSSProperties = {
    border: '1px solid #334155',
    padding: '8px 12px',
    fontSize: 16,
    verticalAlign: 'middle',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
  }
  const sumRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 16,
    padding: '6px 10px',
    borderBottom: '1px solid #334155',
    color: '#cbd5e1',
  }
  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: 60,
    zIndex: 1000,
  }
  const modalContentStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    padding: 24,
    borderRadius: 8,
    width: '900px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    fontSize: 16,
    color: '#e2e8f0',
    border: '1px solid #334155',
  }

  // ★ ラベル用スタイル追加
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#94a3b8',
  }

  // ★ 入力フィールド用スタイル追加
  const inputStyle: React.CSSProperties = {
    fontSize: 16,
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #475569',
    borderRadius: 4,
    padding: '8px 12px',
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

  // 次の案件番号を取得（cases.case_noの最大+1、数値のみ対象）
  // 文字列番号の場合は最新の数値部分を抽出して+1
  const fetchNextCaseNo = async (): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('case_no, created_date')
        .not('case_no', 'is', null)
        .order('created_date', { ascending: false })
        .limit(200)

      if (error) throw error
      const nums = (data || [])
        .map((r: any) => {
          const val = String(r.case_no || '')
          // 文字列に数字が含まれていれば抽出
          const digits = val.replace(/\D+/g, '')
          const parsed = parseInt(digits, 10)
          return Number.isFinite(parsed) ? parsed : 0
        })
        .filter((n: number) => n > 0)
      const next = (nums.length ? Math.max(...nums) : 0) + 1
      return next
    } catch (e) {
      console.warn('次の案件番号取得に失敗:', (e as any)?.message)
      return 1
    }
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
        retail_price: product.retail_price || null,  // ★ 定価を取得
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
      const customerIds = [
        ...new Set(
          data
            .map((c) => c.customer_id)
            .filter(Boolean)
        ),
      ]

      console.log('【過去案件読込】担当者ID:', staffIds)
      console.log('【過去案件読込】顧客ID:', customerIds)

      let staffsData: any[] = []
      let customersData: any[] = []

      if (staffIds.length > 0) {
        const result = await supabase
          .from('staffs')
          .select('id, name')
          .in('id', staffIds)
        console.log('【過去案件読込】担当者データ取得結果:', result)
        console.log('【過去案件読込】担当者エラー:', result.error)
        if (result.error) {
          console.error('【過去案件読込】担当者データ取得エラー詳細:', result.error.message)
        }
        staffsData = result.data || []
      }

      if (customerIds.length > 0) {
        console.log('【過去案件読込】顧客クエリ開始: カラムサイズ=', customerIds.length)
        const result = await supabase
          .from('customers')
          .select('id, name')
          .in('id', customerIds)
        console.log('【過去案件読込】顧客データ取得結果:', result)
        console.log('【過去案件読込】顧客エラー:', result.error)
        if (result.error) {
          console.error('【過去案件読込】顧客データ取得エラー詳細:', result.error.message)
        }
        customersData = result.data || []
      }

      console.log('【過去案件読込】最終staffsData:', staffsData)
      console.log('【過去案件読込】最終customersData:', customersData)

      const staffMap = new Map(staffsData.map((s) => [String(s.id), s.name]))
      const customerMap = new Map(customersData.map((c) => [String(c.id), c.name]))

      console.log('【過去案件読込】staffMap:', Array.from(staffMap.entries()))
      console.log('【過去案件読込】customerMap:', Array.from(customerMap.entries()))

      const enrichedCases = data.map((c) => ({
        ...c,
        customer_name: customerMap.get(String(c.customer_id)) || c.customer_id || '-',
        staff_name: staffMap.get(String(c.staff_id)) || c.staff_id || '-',
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
    // ★ customer_idに得意先名を保存する仕様に合わせて、stateも名前を保持
    setCustomerId(customer.name)
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
      unit_price: null,  // ★ 単価は初期値null
      price_rate: null,
      exclude_from_total: false,
      amount: 0,  // ★ 金額は0で初期化
      cost_price: product.cost_price || 0,  // ★ 原価は保持
      section_id: null,
    }

    setRows((prev) => normalizeRowOrder([...prev, newRow]))
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
      unit_price: manualProductUnitPrice,  // ★ null許容型で保持
      price_rate: null,
      exclude_from_total: false,
      amount: (manualProductUnitPrice ?? 0) * (manualProductQuantity > 0 ? manualProductQuantity : 1),
      cost_price: manualProductCostPrice >= 0 ? manualProductCostPrice : 0,
      section_id: null,
      unregistered_product: manualProductName.trim(),  // ★ 直接入力商品名を保存
    }

    setRows((prev) => normalizeRowOrder([...prev, newRow]))

    // フォームをリセット
    setManualProductName('')
    setManualProductSpec('')
    setManualProductUnit('')
    setManualProductUnitPrice(null)
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

    // ★ 顧客情報取得
    let customerName = ''
    if (caseData.customer_id) {
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('name')
        .eq('id', caseData.customer_id)
        .single()

      if (!customerError && customerData) {
        customerName = customerData.name
      } else {
        customerName = caseData.customer_id
      }
    }

    // 明細
    const { data: detailsData, error: detailsError } = await supabase
      .from('case_details')
      .select('*')
      .eq('case_id', caseId)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })

    if (detailsError || !detailsData || detailsData.length === 0) {
      alert('この案件には明細データがありません')
      return
    }

    const productIds = detailsData.map((d) => d.product_id).filter(Boolean)

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, unit, retail_price')
      .in('id', productIds)

    const productMap = new Map((productsData || []).map((p) => [p.id, p]))

    // ★ 過去案件読込時にproducts配列に追加（定価参照用）
    const productsToAdd = (productsData || []).map(p => ({
      id: p.id,
      name: p.name,
      spec: '',
      unit: p.unit || '',
      unit_price: 0,
      cost_price: 0,
      retail_price: p.retail_price || null,
    }))
    setProducts(prev => {
      const existingIds = new Set(prev.map(p => p.id))
      const newProducts = productsToAdd.filter(p => !existingIds.has(p.id))
      return [...prev, ...newProducts]
    })

    const loadedRows: Row[] = detailsData.map((detail, index) => {
      const product = productMap.get(detail.product_id)

      return {
        product_id: detail.product_id || '',
        item_name:
          detail.unregistered_product || product?.name || `削除された商品(ID:${detail.product_id})`,
        spec: detail.spec || '',
        unit: product?.unit || detail.unit || '',
        quantity: detail.quantity || 1,
        unit_price: detail.unit_price || 0,
        price_rate: detail.price_rate ?? null,
        exclude_from_total: detail.exclude_from_total ?? false,
        amount: detail.amount || 0,
        cost_price: detail.cost_unit_price || 0,
        section_id: detail.section_id || null,
        remarks: detail.remarks || undefined,
        unregistered_product: detail.unregistered_product || undefined,
        comment: detail.comment || undefined,
        display_order: detail.display_order ?? index + 1,
      }
    })

    // ★ 保存仕様に合わせ、customer_idには顧客名を保持する
    setCustomerId(customerName)
    setCustomerName(customerName)
    setHonorific(caseData.honorific || '様')  // ★ 敬称を読み込み
    setStaffId(staffData?.id || null)
    setStaffName(staffData?.name || '')
    setSubject(caseData.subject || '')
    setDiscount(caseData.special_discount || 0)
    setTaxRate(0.1)
    setLayoutType(caseData.layout_type || 'vertical')

    setEstimateNo(caseData.case_no || '')
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

    setRows(normalizeRowOrder(loadedRows))
    setShowPastCaseModal(false)

    // ★ 更新モードを有効化
    setIsUpdateMode(true)
    setLoadedCaseId(caseId)

    alert(
      `過去案件「${caseData.subject}」の情報を読み込みました\n顧客: ${caseData.customer_id || '不明'
      }\n担当者: ${staffData?.name || '不明'}\n\n保存時に「更新」または「新規登録」を選択できます。`
    )
  }

  const handleQuantityChange = (index: number, quantity: number) => {
    const newRows = [...rows]
    newRows[index].quantity = quantity
    newRows[index].amount = quantity * (newRows[index].unit_price ?? 0)
    setRows(newRows)
  }

  const handleUnitPriceChange = (index: number, unitPrice: number | null) => {
    const newRows = [...rows]
    newRows[index].unit_price = unitPrice
    newRows[index].price_rate = null
    newRows[index].amount = newRows[index].quantity * (unitPrice ?? 0)
    setRows(newRows)
  }

  // ★ 単価計算モーダルを開く
  const handleOpenPriceModal = (index: number) => {
    setPriceModalRowIndex(index)

    const row = rows[index]
    const product = products.find(p => p.id === row.product_id)

    // ★ product_idがあればproductsテーブルからretail_priceを取得
    const retailPrice = (product?.retail_price && product.retail_price > 0) ? product.retail_price : null

    // ★ case_detailのunit_price（現在の単価）を直接入力欄に表示
    const currentUnitPrice = row.unit_price && row.unit_price > 0 ? row.unit_price : null

    // ★ 過去案件読込時：掛率計算の定価欄にはretail_price、直接入力欄にはunit_priceを表示
    // 新規追加時：retail_priceを初期値として表示
    setPriceModalDirectPrice(currentUnitPrice)  // ★ 直接入力用の値を保持

    if (currentUnitPrice && retailPrice) {
      // 過去案件読込時：掛率計算モードでretail_priceを表示
      setPriceModalListPrice(retailPrice)
      setPriceModalMode('calculate')
    } else if (currentUnitPrice) {
      // unit_priceのみある場合：直接入力モード
      setPriceModalListPrice(currentUnitPrice)
      setPriceModalMode('direct')
    } else {
      // 新規追加時：retail_priceを初期値として表示
      setPriceModalListPrice(retailPrice)
      setPriceModalMode('calculate')
    }

    setPriceModalRate(null)
    setPriceModalCalculatedPrice(null)
    setPriceModalShowRemarksCheckbox(true)

    // ★ 定価を表示
    if (retailPrice !== null) {
      alert(`定価: ${retailPrice.toLocaleString()}円`)
    } else {
      alert('定価が未登録です')
    }

    setShowPriceModal(true)
  }

  // ★ 掛率で計算
  const handleCalculatePrice = () => {
    if (priceModalListPrice === null || priceModalRate === null) {
      alert('定価と掛率を入力してください')
      return
    }
    const calculated = Math.floor(priceModalListPrice * (priceModalRate / 100))
    setPriceModalCalculatedPrice(calculated)
  }

  // ★ 単価を反映して閉じる
  const handleApplyPrice = async () => {
    if (priceModalRowIndex === null) return

    let finalPrice: number | null = null
    let remarks = ''

    if (priceModalMode === 'calculate') {
      if (priceModalCalculatedPrice === null) {
        alert('計算結果が未設定です')
        return
      }
      finalPrice = priceModalCalculatedPrice
      // ★ チェックボックスがオンの場合のみ定価を備考に保存
      if (priceModalShowRemarksCheckbox && priceModalListPrice) {
        remarks = `定価：${priceModalListPrice.toLocaleString()}`
      }
    } else {
      if (priceModalDirectPrice === null) {
        alert('単価を入力してください')
        return
      }
      finalPrice = priceModalDirectPrice
      remarks = ''
    }

    // ★ 入力値をretail_priceに更新（nullまたは0の場合のみ）
    const row = rows[priceModalRowIndex]
    if (row.product_id && priceModalListPrice && priceModalListPrice > 0) {
      const product = products.find(p => p.id === row.product_id)
      // 元の値がnullまたは0の場合のみ更新
      if (!product?.retail_price || product.retail_price === 0) {
        const { error } = await supabase
          .from('products')
          .update({ retail_price: priceModalListPrice })
          .eq('id', row.product_id)

        if (error) {
          console.error('retail_price更新エラー:', error)
        } else {
          // 商品リストを更新（ローカル）
          const updatedProducts = products.map(p =>
            p.id === row.product_id ? { ...p, retail_price: priceModalListPrice } : p
          )
          setProducts(updatedProducts)
        }
      }
    }

    // 備考を含めて行を更新
    const newRows = [...rows]
    newRows[priceModalRowIndex].unit_price = finalPrice
    newRows[priceModalRowIndex].amount = newRows[priceModalRowIndex].quantity * (finalPrice ?? 0)
    newRows[priceModalRowIndex].remarks = remarks
    newRows[priceModalRowIndex].price_rate = priceModalMode === 'calculate' ? priceModalRate : null
    setRows(newRows)

    setShowPriceModal(false)
  }

  const normalizeRowOrder = (list: Row[]) =>
    list.map((row, index) => ({
      ...row,
      display_order: index + 1,
    }))

  const handleDeleteRow = (index: number) => {
    const nextRows = rows.filter((_, i) => i !== index)
    setRows(normalizeRowOrder(nextRows))
  }

  const handleChangeRowOrder = (index: number, nextOrder: number) => {
    if (!Number.isFinite(nextOrder)) {
      setRows(normalizeRowOrder(rows))
      return
    }

    const total = rows.length
    const clamped = Math.min(Math.max(Math.floor(nextOrder), 1), total)
    if (clamped === index + 1) {
      setRows(normalizeRowOrder(rows))
      return
    }

    const newRows = [...rows]
    const [moved] = newRows.splice(index, 1)
    newRows.splice(clamped - 1, 0, moved)
    setRows(normalizeRowOrder(newRows))
  }

  const handleInsertRow = (index: number) => {
    const baseSectionId = rows[index]?.section_id ?? null
    const newRow: Row = {
      product_id: '',
      item_name: '',
      spec: '',
      unit: '',
      quantity: 1,
      unit_price: null,
      price_rate: null,
      exclude_from_total: false,
      amount: 0,
      cost_price: 0,
      section_id: baseSectionId,
      remarks: undefined,
      unregistered_product: undefined,
      comment: undefined,
    }

    const newRows = [...rows]
    newRows.splice(index + 1, 0, newRow)
    setRows(normalizeRowOrder(newRows))
  }

  const handleCopyRow = (index: number) => {
    const source = rows[index]
    const copied: Row = {
      ...source,
      amount: source.quantity * (source.unit_price ?? 0),
    }
    const newRows = [...rows]
    newRows.splice(index + 1, 0, copied)
    setRows(normalizeRowOrder(newRows))
  }

  const handleOpenEditRowModal = (index: number) => {
    setEditRowIndex(index)
    setEditRowData({ ...rows[index] })
    setShowEditRowModal(true)
  }

  const handleSaveEditRow = () => {
    if (editRowIndex === -1 || !editRowData) return

    const trimmedName = (editRowData.item_name || '').trim()
    const matchedProduct = editRowData.product_id
      ? products.find((p) => p.id === editRowData.product_id)
      : null
    const defaultName = matchedProduct?.name || ''
    const shouldKeepName = trimmedName.length > 0
    const resolvedUnregisteredName = editRowData.product_id
      ? (shouldKeepName && trimmedName !== defaultName ? trimmedName : undefined)
      : (shouldKeepName ? trimmedName : undefined)

    const newRows = [...rows]
    newRows[editRowIndex] = {
      ...editRowData,
      unregistered_product: resolvedUnregisteredName,
      amount: editRowData.quantity * (editRowData.unit_price ?? 0)
    }
    setRows(normalizeRowOrder(newRows))
    setShowEditRowModal(false)
    setEditRowIndex(-1)
    setEditRowData(null)
  }

  // ★ コメント挿入用ハンドラー
  const handleOpenCommentModal = (index: number) => {
    setCommentRowIndex(index)
    setCommentText(rows[index].comment || '')
    setShowCommentModal(true)
  }

  const handleSaveComment = () => {
    if (commentRowIndex === null) return

    const newRows = [...rows]
    newRows[commentRowIndex].comment = commentText
    setRows(newRows)
    setShowCommentModal(false)
    setCommentRowIndex(null)
    setCommentText('')
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

    // ★ 更新モードの場合、選択モーダルを表示
    if (isUpdateMode && loadedCaseId) {
      setShowSaveModal(true)
      return
    }

    // 通常の新規登録処理
    await performSave('new')
  }

  const performSave = async (mode: 'new' | 'update') => {
    setShowSaveModal(false)  // モーダルを閉じる

    try {
      let targetCaseId: string

      if (mode === 'update' && loadedCaseId) {
        // 更新モード
        targetCaseId = loadedCaseId

        const { error: caseError } = await supabase
          .from('cases')
          .update({
            case_no: estimateNo || null,
            subject: subject,
            created_date: estimateDate,
            // ★ customer_idには得意先名を保存する仕様
            customer_id: customerId,
            staff_id: staffId,
            coreplus_no: null,
            special_discount: discount,
            total_amount: totalAmount,
            layout_type: layoutType,
            delivery_place: deliveryPlace,
            delivery_deadline: deliveryDeadline,
            delivery_terms: deliveryTerms,
            validity_text: validityText,
            payment_terms: paymentTerms,
            honorific: honorific,  // ★ 敬称を保存
          })
          .eq('case_id', loadedCaseId)

        if (caseError) {
          throw new Error(`案件更新エラー: ${caseError.message}`)
        }

        // 既存の明細とセクションを削除
        await supabase.from('case_details').delete().eq('case_id', loadedCaseId)
        await supabase.from('case_sections').delete().eq('case_id', loadedCaseId)

      } else {
        // 新規登録モード
        targetCaseId = generateCaseId()

        // 新規採番ルール：常に次の案件番号を採番
        const nextCaseNo = await fetchNextCaseNo()

        const { error: caseError } = await supabase.from('cases').insert({
          case_id: targetCaseId,
          case_no: nextCaseNo,
          subject: subject,
          created_date: estimateDate,
          // ★ customer_idには得意先名を保存する仕様
          customer_id: customerId,
          staff_id: staffId,
          coreplus_no: null,
          status: '商談中',
          special_discount: discount,
          total_amount: totalAmount,
          layout_type: layoutType,
          delivery_place: deliveryPlace,
          delivery_deadline: deliveryDeadline,
          delivery_terms: deliveryTerms,
          validity_text: validityText,
          payment_terms: paymentTerms,
          honorific: honorific,  // ★ 敬称を保存
          approve_staff: null,
          approve_manager: null,
          approve_director: null,
          approve_president: null,
          oral_request_manager: null,
          oral_request_director: null,
          oral_request_president: null,
        })

        if (caseError) {
          throw new Error(`案件登録エラー: ${caseError.message}`)
        }
      }

      if (layoutType === 'horizontal' && sections.length > 0) {
        const sectionsToInsert = sections.map((section) => ({
          case_id: targetCaseId,
          section_id: section.id,
          section_name: section.name,
        }))

        const { error: sectionError } = await supabase
          .from('case_sections')
          .insert(sectionsToInsert)

        if (sectionError) {
          if (mode === 'new') {
            await supabase.from('cases').delete().eq('case_id', targetCaseId)
          }
          throw new Error(`セクション登録エラー: ${sectionError.message}`)
        }
      }

      const detailsToInsert = rows.map((row, index) => ({
        case_id: targetCaseId,
        coreplus_no: null,
        product_id: row.product_id || null,
        spec: row.spec,
        unit: row.unit,
        quantity: row.quantity,
        unit_price: row.unit_price,
        price_rate: row.price_rate ?? null,
        exclude_from_total: row.exclude_from_total ?? false,
        amount: row.amount,
        cost_unit_price: row.cost_price,
        section_id: row.section_id,
        unregistered_product: row.unregistered_product || null,
        remarks: row.remarks || null,
        comment: row.comment || null,  // ★ コメントを追加
        display_order: row.display_order ?? index + 1,
      }))

      const { error: detailsError } = await supabase
        .from('case_details')
        .insert(detailsToInsert)

      if (detailsError) {
        if (mode === 'new') {
          await supabase.from('cases').delete().eq('case_id', targetCaseId)
        }
        if (layoutType === 'horizontal') {
          await supabase.from('case_sections').delete().eq('case_id', targetCaseId)
        }
        throw new Error(`明細登録エラー: ${detailsError.message}`)
      }

      const actionText = mode === 'update' ? '更新' : '保存'
      alert(`見積書を${actionText}しました`)

      // 更新モードをリセット
      if (mode === 'update') {
        setIsUpdateMode(false)
        setLoadedCaseId(null)
      }

      router.push(`/cases/approval/${targetCaseId}`)
    } catch (error) {
      console.error('保存エラー:', error)
      alert(
        `保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'
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
  const subtotal = rows.reduce((s, r) => s + (r.exclude_from_total ? 0 : r.amount), 0)
  const totalCostAmount = rows.reduce((s, r) => {
    const costUnitPrice = r.exclude_from_total ? (r.unit_price ?? 0) : r.cost_price
    return s + costUnitPrice * r.quantity
  }, 0)
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
          <h1 style={{ margin: 0, color: '#fff', fontSize: '20pt' }}>案件登録</h1>
          <Link
            href="/selectors"
            className="selector-button"
            style={{
              textDecoration: 'none',
              backgroundColor: '#16a34a',
              border: '1px solid #15803d',
              color: '#fff',
              padding: '10px 16px',
              flex: '0 0 auto',
              width: 'fit-content',
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
            border: '1px solid #334155',
            borderRadius: 8,
            backgroundColor: '#1e293b',
          }}
        >
          <label
            style={{
              fontWeight: 'bold',
              marginBottom: 12,
              display: 'block',
              fontSize: 20,
              color: '#93c5fd',
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
                padding: '10px 16px',
                backgroundColor:
                  layoutType === 'vertical' ? '#2563eb' : 'transparent',
                borderRadius: 6,
                border:
                  layoutType === 'vertical'
                    ? '2px solid #3b82f6'
                    : '2px solid #334155',
                color: layoutType === 'vertical' ? '#fff' : '#cbd5e1',
                transition: 'all 0.2s ease',
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
                className="hidden"
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
                padding: '10px 16px',
                backgroundColor:
                  layoutType === 'horizontal' ? '#2563eb' : 'transparent',
                borderRadius: 6,
                border:
                  layoutType === 'horizontal'
                    ? '2px solid #3b82f6'
                    : '2px solid #334155',
                color: layoutType === 'horizontal' ? '#fff' : '#cbd5e1',
                transition: 'all 0.2s ease',
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
                className="hidden"
              />
              <span style={{ fontSize: 18, fontWeight: 'bold' }}>
                📊 横様式(セクションあり)
              </span>
            </label>

            {layoutType === 'horizontal' && (
              <button
                onClick={() => setShowSectionModal(true)}
                className="selector-button"
              >
                ⚙️ セクション設定
              </button>
            )}
          </div>

          {layoutType === 'horizontal' && sections.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: '#0f172a',
                borderRadius: 6,
              }}
            >
              <strong style={{ color: '#94a3b8' }}>📌 登録済みセクション:</strong>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 8,
                }}
              >
                {sections.map((section) => (
                  <span
                    key={section.id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#16a34a',
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
            border: '1px solid #334155',
            borderRadius: 8,
            backgroundColor: '#1e293b',
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: 16,
              fontSize: 20,
              fontWeight: 'bold',
              color: '#e2e8f0',
            }}
          >
            📝 付帯情報
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '16px 24px',
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
                style={{ ...inputStyle, width: '100%' }}
                placeholder="数値のみ入力"
              />
              <span style={{ fontSize: 14, color: '#64748b' }}>
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
                style={{ ...inputStyle, width: '100%' }}
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
                style={{ ...inputStyle, width: '100%' }}
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
                style={{ ...inputStyle, width: '100%' }}
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
                style={{ ...inputStyle, width: '100%' }}
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
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>
                御支払条件:
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* 顧客・担当者 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>
              顧客:
              <span style={{ marginLeft: 8, fontSize: 11, color: '#ef4444', fontWeight: 'normal' }}>
                ※印刷時に2行に分けたい場合、分割するところに、2つ以上スペースを空けてください
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={customerName}
                readOnly
                style={{ ...inputStyle, flex: 1, backgroundColor: '#334155' }}
                placeholder="顧客を選択してください"
              />
              <button
                onClick={() => setShowCustomerModal(true)}
                className="selector-button primary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                顧客選択
              </button>
              <select
                value={honorific}
                onChange={(e) => setHonorific(e.target.value)}
                style={{
                  ...inputStyle,
                  width: '80px',
                  padding: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="様">様</option>
                <option value="御中">御中</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>担当者:</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={staffName}
                readOnly
                style={{ ...inputStyle, flex: 1, backgroundColor: '#334155' }}
                placeholder="担当者を選択してください"
              />
              <button
                onClick={() => setShowStaffModal(true)}
                className="selector-button primary"
              >
                担当者選択
              </button>
            </div>
          </div>
        </div>

        {/* 件名 */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>件名:</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
            placeholder="例: ○○工事見積"
          />
        </div>

        {/* 明細 */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, color: '#e2e8f0' }}>明細</h2>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  fetchPastCases()
                  setShowPastCaseModal(true)
                }}
                className="selector-button primary"
              >
                📋 過去案件から読込
              </button>
              <button
                onClick={() => setShowProductModal(true)}
                className="selector-button primary"
              >
                + 商品追加
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '44px' }}>順番</th>
                  <th style={{ ...thStyle, width: '52px' }}>除外</th>
                  {layoutType === 'horizontal' && (
                    <th style={{ ...thStyle, minWidth: '180px' }}>セクション</th>
                  )}
                  <th style={{ ...thStyle, minWidth: '250px' }}>商品名</th>
                  <th style={{ ...thStyle, minWidth: '200px' }}>規格</th>
                  <th style={{ ...thStyle, width: '80px' }}>単位</th>
                  <th style={{ ...thStyle, width: '100px' }}>数量</th>
                  <th style={{ ...thStyle, width: '150px' }}>単価</th>
                  <th style={{ ...thStyle, width: '150px' }}>金額</th>
                  <th style={{ ...thStyle, width: '150px' }}>原価額</th>
                  <th style={{ ...thStyle, width: '150px' }}>粗利額</th>
                  <th style={{ ...thStyle, width: '100px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const costUnitPrice = row.exclude_from_total ? (row.unit_price ?? 0) : row.cost_price
                  const costAmount = costUnitPrice * row.quantity
                  const displayAmount = row.exclude_from_total ? 0 : row.amount
                  const grossProfit = displayAmount - costAmount

                  return (
                    <tr key={index}>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.display_order ?? index + 1}
                          onChange={(e) => {
                            const value = e.target.value
                            const newRows = [...rows]
                            newRows[index].display_order = value === '' ? undefined : Number(value)
                            setRows(newRows)
                          }}
                          onBlur={() => {
                            const targetOrder = row.display_order ?? index + 1
                            handleChangeRowOrder(index, targetOrder)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const targetOrder = row.display_order ?? index + 1
                              handleChangeRowOrder(index, targetOrder)
                            }
                          }}
                          style={{ ...inputStyle, width: '48px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!row.exclude_from_total}
                          onChange={(e) => {
                            const newRows = [...rows]
                            newRows[index].exclude_from_total = e.target.checked
                            setRows(newRows)
                          }}
                        />
                      </td>
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
                            style={{ ...inputStyle, width: '100%' }}
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
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{row.unit}</td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.quantity}
                          onChange={(e) =>
                            handleQuantityChange(index, Number(e.target.value))
                          }
                          style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleOpenPriceModal(index)}
                          className="w-full text-right px-3 py-2 rounded-md"
                          style={{
                            backgroundColor: row.unit_price ? '#334155' : '#1e293b',
                            border: '1px solid #475569',
                            cursor: 'pointer',
                            color: '#e2e8f0',
                          }}
                        >
                          {row.unit_price ? row.unit_price.toLocaleString() : '未入力'}
                        </button>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{displayAmount.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{costAmount.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{grossProfit.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '6px',
                            justifyItems: 'center',
                          }}
                        >
                          <button
                            onClick={() => handleOpenEditRowModal(index)}
                            className="selector-button"
                            style={{
                              backgroundColor: '#0284c7',
                              borderColor: '#0369a1',
                              color: '#fff',
                              width: 52,
                              height: 52,
                              padding: 0,
                              fontSize: 13,
                              lineHeight: 1.1,
                              textAlign: 'center',
                            }}
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleInsertRow(index)}
                            className="selector-button"
                            style={{
                              backgroundColor: '#0ea5e9',
                              borderColor: '#0284c7',
                              color: '#fff',
                              width: 52,
                              height: 52,
                              padding: 0,
                              fontSize: 13,
                              lineHeight: 1.1,
                              textAlign: 'center',
                            }}
                          >
                            挿入
                          </button>
                          <button
                            onClick={() => handleCopyRow(index)}
                            className="selector-button"
                            style={{
                              backgroundColor: '#7c3aed',
                              borderColor: '#6d28d9',
                              color: '#fff',
                              width: 52,
                              height: 52,
                              padding: 0,
                              fontSize: 13,
                              lineHeight: 1.1,
                              textAlign: 'center',
                            }}
                          >
                            複製
                          </button>
                          <button
                            onClick={() => handleDeleteRow(index)}
                            className="selector-button"
                            style={{
                              backgroundColor: '#dc2626',
                              borderColor: '#991b1b',
                              color: '#fff',
                              width: 52,
                              height: 52,
                              padding: 0,
                              fontSize: 13,
                              lineHeight: 1.1,
                              textAlign: 'center',
                            }}
                          >
                            削除
                          </button>
                          <button
                            onClick={() => handleOpenCommentModal(index)}
                            className="selector-button"
                            style={{
                              backgroundColor: row.comment ? '#16a34a' : '#475569',
                              borderColor: row.comment ? '#15803d' : '#334155',
                              color: '#fff',
                              width: 52,
                              height: 52,
                              padding: 0,
                              fontSize: 12,
                              lineHeight: 1.1,
                              textAlign: 'center',
                            }}
                            title={row.comment ? 'コメント: ' + row.comment : 'コメント追加'}
                          >
                            💬 {row.comment ? 'コメント有' : 'コメント'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 合計・出精値引き・消費税 */}
        <div
          style={{
            marginLeft: 'auto',
            width: '100%',
            maxWidth: 450,
            marginBottom: 24,
            backgroundColor: '#1e293b',
            borderRadius: 8,
            padding: '8px',
            border: '1px solid #334155',
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
          <div style={{ ...sumRowStyle, padding: '10px' }}>
            <span>出精値引き</span>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              style={{ ...inputStyle, width: 140, textAlign: 'right' }}
            />
          </div>
          <div style={sumRowStyle}>
            <span>値引後小計</span>
            <span>{subtotalAfterDiscount.toLocaleString()} 円</span>
          </div>
          <div style={{ ...sumRowStyle, padding: '10px' }}>
            <span>消費税率</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                value={taxRate * 100}
                onChange={(e) => setTaxRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)}
                style={{ ...inputStyle, width: 80, textAlign: 'right' }}
                step="0.1"
                min="0"
                max="100"
              />
              <span>%</span>
            </div>
          </div>
          <div style={sumRowStyle}>
            <span>消費税 ({(taxRate * 100).toFixed(1)}%)</span>
            <span>{taxAmount.toLocaleString()} 円</span>
          </div>
          <div
            style={{
              ...sumRowStyle,
              fontWeight: 'bold',
              fontSize: 20,
              backgroundColor: '#0f172a',
              padding: '12px',
              marginTop: '8px',
              borderRadius: '4px'
            }}
          >
            <span>合計金額</span>
            <span style={{ color: '#60a5fa' }}>
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
            paddingTop: 16,
            borderTop: '1px solid #334155'
          }}
        >
          <button onClick={handleClear} className="selector-button">
            キャンセル
          </button>
          <button
            onClick={handlePrintPreview}
            className="selector-button"
          >
            📄 PDF印刷プレビュー
          </button>
          <button onClick={handleSave} className="selector-button primary">
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #4a5568' }}>
                <button
                  onClick={() => setProductModalTab('search')}
                  className="btn-3d"
                  style={{
                    backgroundColor: productModalTab === 'search' ? '#3182ce' : '#4a5568',
                    color: '#fff',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                  }}
                >
                  📚 マスタから選択
                </button>
                <button
                  onClick={() => setProductModalTab('manual')}
                  className="btn-3d"
                  style={{
                    backgroundColor: productModalTab === 'manual' ? '#3182ce' : '#4a5568',
                    color: '#fff',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
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
                          <th style={thStyle}>商品コード</th>
                          <th style={thStyle}>商品名</th>
                          <th style={thStyle}>規格</th>
                          <th style={thStyle}>単位</th>
                          <th style={thStyle}>原価</th>
                          <th style={thStyle}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((product) => (
                          <tr key={product.id}>
                            <td style={tdStyle}>{product.id}</td>
                            <td style={tdStyle}>{product.name}</td>
                            <td style={tdStyle}>{product.spec || '-'}</td>
                            <td style={tdStyle}>{product.unit || '-'}</td>
                            <td style={tdStyle}>
                              {(product.cost_price || 0).toLocaleString()}
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
                    backgroundColor: '#0f172a',
                    borderRadius: 4,
                    marginBottom: 16,
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}>
                      <div>
                        <label style={labelStyle}>商品名 <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                          type="text"
                          value={manualProductName}
                          onChange={(e) => setManualProductName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddManualProduct()}
                          className="input-inset"
                          style={{ ...inputStyle, width: '100%', fontSize: 16 }}
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
                          style={{ ...inputStyle, width: '100%', fontSize: 16 }}
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
                          style={{ ...inputStyle, width: '100%', fontSize: 16 }}
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
                          style={{ ...inputStyle, width: '100%', fontSize: 16 }}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>単価</label>
                        <input
                          type="text"
                          value={manualProductUnitPrice ?? ''}
                          onChange={(e) => setManualProductUnitPrice(e.target.value ? Number(e.target.value) : null)}
                          className="input-inset"
                          style={{ ...inputStyle, width: '100%', fontSize: 16 }}
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
                          style={{ ...inputStyle, width: '100%', fontSize: 16 }}
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

        {/* ★ 単価計算モーダル */}
        {showPriceModal && (
          <div style={modalOverlayStyle}>
            <div style={{
              ...modalContentStyle,
              maxWidth: 600,
            }}>
              <h2>単価設定</h2>

              {/* タブボタン */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #4a5568' }}>
                <button
                  onClick={() => setPriceModalMode('calculate')}
                  className="btn-3d"
                  style={{
                    backgroundColor: priceModalMode === 'calculate' ? '#3182ce' : '#4a5568',
                    color: '#fff',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                  }}
                >
                  📊 掛率計算
                </button>
                <button
                  onClick={() => setPriceModalMode('direct')}
                  className="btn-3d"
                  style={{
                    backgroundColor: priceModalMode === 'direct' ? '#3182ce' : '#4a5568',
                    color: '#fff',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                  }}
                >
                  ✏️ 直接入力
                </button>
              </div>

              {/* 掛率計算モード */}
              {priceModalMode === 'calculate' && (
                <>
                  <div style={{
                    padding: 16,
                    backgroundColor: '#2d3748',
                    borderRadius: 4,
                    marginBottom: 16,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ ...labelStyle, color: '#e2e8f0' }}>定価</label>
                        <input
                          type="text"
                          value={priceModalListPrice ?? ''}
                          onChange={(e) => setPriceModalListPrice(e.target.value ? Number(e.target.value) : null)}
                          className="input-inset"
                          style={{ width: '100%', fontSize: 16, backgroundColor: '#1a202c', color: '#fff', border: '1px solid #4a5568' }}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, color: '#e2e8f0' }}>掛率 (%)</label>
                        <input
                          type="text"
                          value={priceModalRate ?? ''}
                          onChange={(e) => setPriceModalRate(e.target.value ? Number(e.target.value) : null)}
                          className="input-inset"
                          style={{ width: '100%', fontSize: 16, backgroundColor: '#1a202c', color: '#fff', border: '1px solid #4a5568' }}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCalculatePrice}
                      className="btn-3d btn-primary"
                      style={{ width: '100%', marginBottom: 12 }}
                    >
                      計算
                    </button>

                    {priceModalCalculatedPrice !== null && (
                      <div style={{
                        padding: 12,
                        backgroundColor: '#1a202c',
                        border: '2px solid #48bb78',
                        borderRadius: 4,
                        textAlign: 'center',
                      }}>
                        <span style={{ fontSize: 14, color: '#a0aec0' }}>計算結果</span>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#48bb78' }}>
                          {priceModalCalculatedPrice.toLocaleString()} 円
                        </div>
                      </div>
                    )}

                    {/* 備考に定価を表示するチェックボックス */}
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        id="showRemarksCheckbox"
                        checked={priceModalShowRemarksCheckbox}
                        onChange={(e) => setPriceModalShowRemarksCheckbox(e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <label
                        htmlFor="showRemarksCheckbox"
                        style={{ fontSize: 14, cursor: 'pointer', userSelect: 'none', color: '#e2e8f0' }}
                      >
                        備考に定価を表示
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* 直接入力モード */}
              {priceModalMode === 'direct' && (
                <>
                  <div style={{
                    padding: 16,
                    backgroundColor: '#2d3748',
                    borderRadius: 4,
                    marginBottom: 16,
                  }}>
                    <div>
                      <label style={{ ...labelStyle, color: '#e2e8f0' }}>単価</label>
                      <input
                        type="text"
                        value={priceModalDirectPrice ?? ''}
                        onChange={(e) => setPriceModalDirectPrice(e.target.value ? Number(e.target.value) : null)}
                        className="input-inset"
                        style={{ width: '100%', fontSize: 16, backgroundColor: '#1a202c', color: '#fff', border: '1px solid #4a5568' }}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowPriceModal(false)}
                  className="btn-3d btn-reset"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleApplyPrice}
                  className="btn-3d btn-primary"
                  style={{ backgroundColor: '#28a745' }}
                >
                  ✅ 確定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ★ コメント挿入モーダル */}
        {showCommentModal && (
          <div style={modalOverlayStyle}>
            <div style={{
              ...modalContentStyle,
              maxWidth: 500,
            }}>
              <h2>明細コメント</h2>

              <div style={{
                padding: 16,
                backgroundColor: '#2d3748',
                borderRadius: 4,
                marginBottom: 16,
              }}>
                <label style={{ ...labelStyle, color: '#e2e8f0' }}>コメント内容</label>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  style={{
                    width: '100%',
                    height: 120,
                    padding: 12,
                    backgroundColor: '#1a202c',
                    color: '#fff',
                    border: '1px solid #4a5568',
                    borderRadius: 4,
                    fontSize: 14,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                  placeholder="このセクションについてのメモ、注記など..."
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowCommentModal(false)
                    setCommentRowIndex(null)
                    setCommentText('')
                  }}
                  className="btn-3d btn-reset"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveComment}
                  className="btn-3d btn-primary"
                  style={{ backgroundColor: '#28a745' }}
                >
                  ✅ 保存
                </button>
              </div>
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
                  style={{ backgroundColor: '#2563eb', color: '#fff' }}
                >
                  検索
                </button>
              </div>

              <div style={{ maxHeight: 500, overflow: 'auto' }}>  {/* 400 → 500に拡大 */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>案件ID</th>
                      <th style={thStyle}>案件No</th>
                      <th style={thStyle}>作成日</th>
                      <th style={thStyle}>件名</th>
                      <th style={thStyle}>顧客名</th>
                      <th style={thStyle}>担当者</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastCases.map((c) => (
                      <tr key={c.case_id}>
                        <td style={tdStyle}>
                          {c.case_id || '-'}
                        </td>
                        <td style={tdStyle}>
                          {c.case_no || '未採番'}
                        </td>
                        <td style={tdStyle}>
                          {c.created_date || '-'}
                        </td>
                        <td style={tdStyle}>{c.subject || '-'}</td>
                        <td style={tdStyle}>
                          {c.customer_name || '-'}
                        </td>
                        <td style={tdStyle}>{c.staff_name || '-'}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() =>
                              handleLoadPastCase(c.case_id)
                            }
                            className="btn-3d btn-primary"
                            style={{ fontSize: 15, backgroundColor: '#2563eb', color: '#fff' }}
                          >
                            読込
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pastCases.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
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

        {/* 保存モード選択モーダル */}
        {showSaveModal && (
          <div style={modalOverlayStyle}>
            <div
              style={{
                ...modalContentStyle,
                maxWidth: 500,
                padding: 32,
              }}
            >
              <h2 style={{ marginBottom: 24, textAlign: 'center' }}>保存方法を選択してください</h2>

              <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#f8f9fa', borderRadius: 8 }}>
                <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                  過去案件から読み込んだデータです。<br />
                  既存の案件を更新するか、新しい案件として登録するか選択してください。
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  onClick={() => performSave('update')}
                  className="btn-3d"
                  style={{
                    padding: '16px 24px',
                    fontSize: 18,
                    backgroundColor: '#28a745',
                    color: '#fff',
                  }}
                >
                  既存案件を更新する
                </button>

                <button
                  onClick={() => performSave('new')}
                  className="btn-3d btn-primary"
                  style={{
                    padding: '16px 24px',
                    fontSize: 18,
                  }}
                >
                  新しい案件として登録する
                </button>

                <button
                  onClick={() => setShowSaveModal(false)}
                  className="btn-3d btn-reset"
                  style={{
                    padding: '12px 24px',
                    fontSize: 16,
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 明細編集モーダル */}
        {showEditRowModal && editRowData && (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: 700 }}>
              <h2 style={{ marginBottom: 20 }}>明細編集</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                    商品名:
                  </label>
                  <input
                    type="text"
                    value={editRowData.item_name}
                    onChange={(e) => setEditRowData({ ...editRowData, item_name: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                    規格:
                  </label>
                  <input
                    type="text"
                    value={editRowData.spec}
                    onChange={(e) => setEditRowData({ ...editRowData, spec: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                      単位:
                    </label>
                    <input
                      type="text"
                      value={editRowData.unit}
                      onChange={(e) => setEditRowData({ ...editRowData, unit: e.target.value })}
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                      数量:
                    </label>
                    <input
                      type="number"
                      value={editRowData.quantity}
                      onChange={(e) => setEditRowData({ ...editRowData, quantity: Number(e.target.value) })}
                      style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                      単価:
                    </label>
                    <input
                      type="number"
                      value={editRowData.unit_price ?? ''}
                      onChange={(e) => setEditRowData({ ...editRowData, unit_price: e.target.value ? Number(e.target.value) : null, price_rate: null })}
                      style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                      原価単価:
                    </label>
                    <input
                      type="number"
                      value={editRowData.cost_price}
                      onChange={(e) => setEditRowData({ ...editRowData, cost_price: Number(e.target.value) })}
                      style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                    />
                  </div>
                </div>

                {layoutType === 'horizontal' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                      セクション:
                    </label>
                    <select
                      value={editRowData.section_id || ''}
                      onChange={(e) => setEditRowData({ ...editRowData, section_id: e.target.value ? Number(e.target.value) : null })}
                      style={{ ...inputStyle, width: '100%' }}
                    >
                      <option value="">選択してください</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#e2e8f0' }}>
                    備考:
                  </label>
                  <input
                    type="text"
                    value={editRowData.remarks || ''}
                    onChange={(e) => setEditRowData({ ...editRowData, remarks: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>

                <div style={{
                  padding: 16,
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  border: '1px solid #334155'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#94a3b8' }}>金額:</span>
                    <span style={{ fontWeight: 'bold', fontSize: 18, color: '#e2e8f0' }}>
                      {((editRowData.quantity * (editRowData.unit_price ?? 0))).toLocaleString()} 円
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#94a3b8' }}>原価額:</span>
                    <span style={{ color: '#e2e8f0' }}>
                      {(editRowData.quantity * editRowData.cost_price).toLocaleString()} 円
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>粗利額:</span>
                    <span style={{ color: '#22c55e' }}>
                      {((editRowData.quantity * (editRowData.unit_price ?? 0)) - (editRowData.quantity * editRowData.cost_price)).toLocaleString()} 円
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowEditRowModal(false)
                    setEditRowIndex(-1)
                    setEditRowData(null)
                  }}
                  className="btn-3d btn-reset"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveEditRow}
                  className="btn-3d btn-primary"
                >
                  保存
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
          honorific={honorific}  // ★ 敬称を追加
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