'use client'
import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabaseClient'
import { useReactToPrint } from 'react-to-print'
import PrintPurchaseOrder from './PrintPurchaseOrder'
import PrintWarehouseMove from './PrintWarehouseMove'

function generateOrderId(): string {
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
  retail_price?: number | null
}
type Supplier = { id: string; name: string }
type Staff = { id: number; name: string; stamp_path?: string | null }
type Section = { id: number; name: string }
type Row = {
  product_id: string
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number | null
  amount: number
  cost_price: number
  section_id: number | null
  remarks?: string
  unregistered_product?: string
  max_stock_qty?: number
}

function PurchaseOrderPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const printRef = useRef<HTMLDivElement>(null)

  const [supplierId, setSupplierId] = useState<string>('')
  const [supplierName, setSupplierName] = useState<string>('')
  const [staffId, setStaffId] = useState<number | null>(null)
  const [staffName, setStaffName] = useState<string>('')
  const [staffStampUrl, setStaffStampUrl] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [discount, setDiscount] = useState(0)
  const [taxRate, setTaxRate] = useState(0.1)
  const [rows, setRows] = useState<Row[]>([])

  const [orderNo, setOrderNo] = useState('')
  const [department, setDepartment] = useState('')
  const DEPARTMENTS = ['生産品', '肥料', '農薬', 'その他', '工事']
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [purchaserName, setPurchaserName] = useState('')
  const [note, setNote] = useState('')

  const [layoutType, setLayoutType] = useState<'vertical' | 'horizontal'>(
    'vertical'
  )
  const [sections, setSections] = useState<Section[]>([])
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')

  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showEstimateModal, setShowEstimateModal] = useState(false)

  const [isUpdateMode, setIsUpdateMode] = useState(false)
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [staffs, setStaffs] = useState<Staff[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouseStocks, setWarehouseStocks] = useState<Array<{product_id: string; product_name: string; stock_qty: number; unit: string; spec: string; cost_price: number}>>([])
  const [estimates, setEstimates] = useState<any[]>([])

  const [supplierSearchName, setSupplierSearchName] = useState('')
  const [productSearchName, setProductSearchName] = useState('')
  const [productSearchSpec, setProductSearchSpec] = useState('')
  const [stockSearchName, setStockSearchName] = useState('')
  
  const [showStockEditModal, setShowStockEditModal] = useState(false)
  const [editingStock, setEditingStock] = useState<{product_id: string; product_name: string; stock_qty: number; spec: string; unit: string; cost_price: number} | null>(null)
  const [editSpec, setEditSpec] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editCostPrice, setEditCostPrice] = useState<number>(0)
  const [estimateSearchSubject, setEstimateSearchSubject] = useState('')
  const [printReady, setPrintReady] = useState(false)
  
  const [isNewSupplier, setIsNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')

  const [productModalTab, setProductModalTab] = useState<'search' | 'manual'>('search')
  const [manualProductName, setManualProductName] = useState('')
  const [manualProductSpec, setManualProductSpec] = useState('')
  const [manualProductUnit, setManualProductUnit] = useState('')
  const [manualProductUnitPrice, setManualProductUnitPrice] = useState<number | null>(null)
  const [manualProductCostPrice, setManualProductCostPrice] = useState(0)
  const [manualProductQuantity, setManualProductQuantity] = useState(1)

  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceModalRowIndex, setPriceModalRowIndex] = useState<number | null>(null)
  const [priceModalListPrice, setPriceModalListPrice] = useState<number | null>(null)
  const [priceModalDirectPrice, setPriceModalDirectPrice] = useState<number | null>(null)
  const [priceModalRate, setPriceModalRate] = useState<number | null>(null)
  const [priceModalCalculatedPrice, setPriceModalCalculatedPrice] = useState<number | null>(null)
  const [priceModalMode, setPriceModalMode] = useState<'direct' | 'calculate'>('calculate')

  // 表題モード: 注文書作成 / 移動伝票作成 / 倉庫移動
  const [titleMode, setTitleMode] = useState<'order' | 'transfer-slip' | 'warehouse-move'>('order')
  const titleText = (m: typeof titleMode) =>
    m === 'order' ? '注文書作成' : m === 'transfer-slip' ? '移動伝票作成' : '倉庫移動'
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>('')
  const [destinationWarehouseName, setDestinationWarehouseName] = useState<string>('')
  const [warehouses, setWarehouses] = useState<Array<{id: string; name: string}>>([])
  const [transferSourceWarehouseId, setTransferSourceWarehouseId] = useState<string>('')
  const [transferSourceWarehouseName, setTransferSourceWarehouseName] = useState<string>('')

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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#94a3b8',
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 16,
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #475569',
    borderRadius: 4,
    padding: '8px 12px',
  }

  const [productPage, setProductPage] = useState(0)
  const [productTotalCount, setProductTotalCount] = useState(0)
  const productPageSize = 100

  useEffect(() => {
    fetchSuppliers()
    fetchStaffs()
    fetchProducts(0)
    fetchWarehouses()
    
    // URLパラメータから見積IDを取得して読み込む
    const caseId = searchParams.get('caseId')
    if (caseId) {
      handleLoadEstimate(caseId)
    }
  }, [searchParams])

  // 新規（未更新）かつ未採番なら自動採番
  useEffect(() => {
    if (!isUpdateMode && !orderNo) {
      allocateOrderNo()
    }
  }, [isUpdateMode, orderNo])


  const fetchSuppliers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name')

    if (!error) setSuppliers(data || [])
  }

  const fetchStaffs = async () => {
    const { data, error } = await supabase
      .from('staffs')
      .select('id, name, stamp_path')
      .order('name')

    if (!error) setStaffs(data || [])
  }

  const fetchWarehouses = async () => {
    const { data, error } = await supabase
      .from('warehouses')
      .select('id, name')
      .order('id')
    
    if (error) {
      console.error('倉庫取得エラー:', error)
      return
    }
    setWarehouses((data || []).map((w: any) => ({ id: String(w.id), name: w.name || '' })))
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
        retail_price: product.retail_price || null,
      }))

      setProducts(normalizedData)
      setProductTotalCount(count || 0)
      setProductPage(page)
    } catch (error) {
      console.error('商品取得エラー:', error)
      alert('商品取得エラーが発生しました')
    }
  }

  // 移動元倉庫の在庫取得（v_warehouse_stocks ビュー想定）
  const fetchWarehouseStocks = async () => {
    try {
      if (!transferSourceWarehouseId) {
        alert('移動元倉庫を選択してください')
        return
      }
      let query = supabase
        .from('v_warehouse_stocks')
        .select('warehouse_id, product_id, product_name, stock_qty')
        .eq('warehouse_id', transferSourceWarehouseId)

      if (stockSearchName) {
        query = query.ilike('product_name', `%${stockSearchName}%`)
      }

      const { data, error } = await query
      if (error) throw error
      
      const stockData = (data || []).map((r: any) => ({
        product_id: String(r.product_id),
        product_name: r.product_name || '',
        stock_qty: Number(r.stock_qty || 0)
      }))

      // productsテーブルから単位・規格・原価を取得して紐付け
      const productIds = stockData.map(s => s.product_id).filter(Boolean)
      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from('products')
          .select('id, unit, spec, cost_price')
          .in('id', productIds)
        
        const productMap = new Map((productsData || []).map((p: any) => [p.id, p]))
        
        setWarehouseStocks(stockData.map(s => {
          const product = productMap.get(s.product_id)
          return {
            ...s,
            unit: product?.unit || '',
            spec: product?.spec || '',
            cost_price: product?.cost_price || 0
          }
        }))
      } else {
        setWarehouseStocks(stockData.map(s => ({ ...s, unit: '', spec: '', cost_price: 0 })))
      }
    } catch (err) {
      console.error('倉庫在庫取得エラー:', err)
      alert('倉庫在庫の取得に失敗しました')
    }
  }

  // 発注番号の自動採番（既存の最大値 + 1 を算出）
  const allocateOrderNo = async () => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('order_no, created_date')
        .not('order_no', 'is', null)
        .order('created_date', { ascending: false })
        .limit(100)

      if (error) throw error

      const nums = (data || [])
        .map((r: any) => parseInt(String(r.order_no), 10))
        .filter((n: number) => !isNaN(n))

      const next = (nums.length ? Math.max(...nums) : 0) + 1
      setOrderNo(String(next))
    } catch (err) {
      console.error('発注番号の採番に失敗:', err)
      // 採番失敗時は未採番のまま
    }
  }

  const fetchEstimates = async () => {
    let query = supabase
      .from('cases')
      .select('*')
      .order('created_date', { ascending: false })

    if (estimateSearchSubject) {
      query = query.ilike('subject', `%${estimateSearchSubject}%`)
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

      setEstimates(enrichedCases)
    }
  }

  const handleSupplierSearch = async () => {
    let query = supabase.from('customers').select('*')

    if (supplierSearchName) {
      query = query.ilike('name', `%${supplierSearchName}%`)
    }

    const { data, error } = await query.order('name')

    if (!error) setSuppliers(data || [])
  }

  const handleProductSearch = async () => {
    setProductPage(0)
    await fetchProducts(0)
  }

  const handleSelectSupplier = (supplier: Supplier) => {
    setSupplierId(supplier.name)
    setSupplierName(supplier.name)
    setIsNewSupplier(false)
    setShowSupplierModal(false)
  }

  const handleSelectNewSupplier = () => {
    if (!newSupplierName.trim()) {
      alert('発注先名を入力してください')
      return
    }
    // 直接入力時はID未採番でも印刷/保存のチェックを通すため、IDにも名称を入れておく
    const name = newSupplierName.trim()
    setSupplierId(name)
    setSupplierName(name)
    setIsNewSupplier(true)
    setNewSupplierName('')
    setShowSupplierModal(false)
  }

  const handleSelectStaff = (staff: Staff) => {
    setStaffId(staff.id)
    setStaffName(staff.name)
    setStaffStampUrl(staff.stamp_path || null)
    setShowStaffModal(false)
  }

  const handleSelectProduct = (product: Product) => {
    if (!product || !product.id) {
      console.error('商品情報が不正です:', product)
      alert('商品情報が不正です')
      return
    }

    const newRow: Row = {
      product_id: product.id || '',
      item_name: product.name || '',
      spec: product.spec || '',
      unit: product.unit || '',
      quantity: product.quantity || 1,
      unit_price: null,
      amount: 0,
      cost_price: product.cost_price || 0,
      section_id: null,
    }

    setRows((prev) => [...prev, newRow])
    setShowProductModal(false)
  }

  const handleAddManualProduct = () => {
    if (!manualProductName.trim()) {
      alert('商品名を入力してください')
      return
    }

    const newRow: Row = {
      product_id: '',
      item_name: manualProductName.trim(),
      spec: manualProductSpec.trim(),
      unit: manualProductUnit.trim() || '個',
      quantity: manualProductQuantity > 0 ? manualProductQuantity : 1,
      unit_price: manualProductUnitPrice,
      amount: (manualProductUnitPrice ?? 0) * (manualProductQuantity > 0 ? manualProductQuantity : 1),
      cost_price: manualProductCostPrice >= 0 ? manualProductCostPrice : 0,
      section_id: null,
      unregistered_product: manualProductName.trim(),
    }

    setRows((prev) => [...prev, newRow])

    setManualProductName('')
    setManualProductSpec('')
    setManualProductUnit('')
    setManualProductUnitPrice(null)
    setManualProductCostPrice(0)
    setManualProductQuantity(1)
    setProductModalTab('search')

    setShowProductModal(false)
  }

  const handleLoadEstimate = async (caseId: string) => {
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('case_id', caseId)
      .single()

    if (caseError || !caseData) {
      alert('見積情報の取得に失敗しました')
      return
    }

    let staffData: Staff | null = null

    if (caseData.staff_id) {
      const { data, error } = await supabase
        .from('staffs')
        .select('id, name, stamp_path')
        .eq('id', caseData.staff_id)
        .single()

      if (!error && data) {
        staffData = data as Staff
      }
    }

    const { data: detailsData, error: detailsError } = await supabase
      .from('case_details')
      .select('*')
      .eq('case_id', caseId)

    if (detailsError || !detailsData || detailsData.length === 0) {
      alert('この見積には明細データがありません')
      return
    }

    const productIds = detailsData.map((d) => d.product_id).filter(Boolean)

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, unit, retail_price')
      .in('id', productIds)

    const productMap = new Map((productsData || []).map((p) => [p.id, p]))

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

    const loadedRows: Row[] = detailsData.map((detail) => {
      const product = productMap.get(detail.product_id)

      return {
        product_id: detail.product_id || '',
        item_name:
          product?.name || detail.unregistered_product || `削除された商品(ID:${detail.product_id})`,
        spec: detail.spec || '',
        unit: product?.unit || detail.unit || '',
        quantity: detail.quantity || 1,
        unit_price: detail.unit_price || 0,
        amount: detail.amount || 0,
        cost_price: detail.cost_unit_price || 0,
        section_id: detail.section_id || null,
        remarks: detail.remarks || undefined,
        unregistered_product: detail.unregistered_product || undefined,
      }
    })

    setSupplierId(caseData.customer_name || caseData.customer_id || '')
    setSupplierName(caseData.customer_name || caseData.customer_id || '')
    setStaffId(staffData?.id || null)
    setStaffName(staffData?.name || '')
    setStaffStampUrl(staffData?.stamp_path || null)
    setSubject(caseData.subject || '')
    setDiscount(caseData.special_discount || 0)
    setTaxRate(0.1)
    setLayoutType(caseData.layout_type || 'vertical')

    setOrderNo(caseData.order_no || '')
    setOrderDate(
      caseData.created_date || new Date().toISOString().split('T')[0]
    )
    setDepartment(caseData.department || '')
    setPurchaserName(caseData.purchaser_name || '')
    setNote(caseData.note || '')

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
    setShowEstimateModal(false)

    // 注文データ（status='注文'）を読み込んだ場合は更新モードに設定
    if (caseData.status === '注文') {
      setIsUpdateMode(true)
      setLoadedOrderId(caseId)
      alert(
        `注文「${caseData.subject}」を読み込みました（更新モード）\n発注先: ${
          caseData.customer_id || '不明'
        }\n担当者: ${staffData?.name || '不明'}`
      )
    } else {
      alert(
        `見積「${caseData.subject}」の情報を読み込みました\n発注先: ${
          caseData.customer_id || '不明'
        }\n担当者: ${staffData?.name || '不明'}`
      )
    }
  }

  const handleQuantityChange = (index: number, quantity: number) => {
    const newRows = [...rows]
    const row = newRows[index]
    
    // 移動伝票モードで在庫数チェック
    if (titleMode === 'transfer-slip' && row.max_stock_qty !== undefined) {
      if (quantity > row.max_stock_qty) {
        alert(`在庫数量を超えています。\n最大: ${row.max_stock_qty}\n入力値: ${quantity}\n\n在庫数量に制限します。`)
        quantity = row.max_stock_qty
      }
    }
    
    newRows[index].quantity = quantity
    newRows[index].amount = quantity * (newRows[index].unit_price ?? 0)
    setRows(newRows)
  }

  const handleUnitPriceChange = (index: number, unitPrice: number | null) => {
    const newRows = [...rows]
    newRows[index].unit_price = unitPrice
    newRows[index].amount = newRows[index].quantity * (unitPrice ?? 0)
    setRows(newRows)
  }

  const handleOpenPriceModal = (index: number) => {
    setPriceModalRowIndex(index)
    
    const row = rows[index]
    const product = products.find(p => p.id === row.product_id)
    
    const retailPrice = (product?.retail_price && product.retail_price > 0) ? product.retail_price : null
    const currentUnitPrice = row.unit_price && row.unit_price > 0 ? row.unit_price : null
    
    setPriceModalDirectPrice(currentUnitPrice)
    
    if (currentUnitPrice && retailPrice) {
      setPriceModalListPrice(retailPrice)
      setPriceModalMode('calculate')
    } else if (currentUnitPrice) {
      setPriceModalListPrice(currentUnitPrice)
      setPriceModalMode('direct')
    } else {
      setPriceModalListPrice(retailPrice)
      setPriceModalMode('calculate')
    }
    
    setPriceModalRate(null)
    setPriceModalCalculatedPrice(null)

    if (retailPrice !== null) {
      alert(`定価: ${retailPrice.toLocaleString()}円`)
    } else {
      alert('定価が未登録です')
    }

    setShowPriceModal(true)
  }

  const handleCalculatePrice = () => {
    if (priceModalListPrice === null || priceModalRate === null) {
      alert('定価と掛率を入力してください')
      return
    }
    const calculated = Math.floor(priceModalListPrice * (priceModalRate / 100))
    setPriceModalCalculatedPrice(calculated)
  }

  const handleApplyPrice = async () => {
    if (priceModalRowIndex === null) return

    let finalPrice: number | null = null

    if (priceModalMode === 'calculate') {
      if (priceModalCalculatedPrice === null) {
        alert('計算結果が未設定です')
        return
      }
      finalPrice = priceModalCalculatedPrice
    } else {
      if (priceModalDirectPrice === null) {
        alert('単価を入力してください')
        return
      }
      finalPrice = priceModalDirectPrice
    }

    const row = rows[priceModalRowIndex]
    if (row.product_id && priceModalListPrice && priceModalListPrice > 0) {
      // 商品マスタは変更せず、ローカル状態のみ更新
      const updatedProducts = products.map(p => 
        p.id === row.product_id ? { ...p, retail_price: priceModalListPrice } : p
      )
      setProducts(updatedProducts)
    }

    const newRows = [...rows]
    newRows[priceModalRowIndex].unit_price = finalPrice
    newRows[priceModalRowIndex].amount = newRows[priceModalRowIndex].quantity * (finalPrice ?? 0)
    setRows(newRows)

    setShowPriceModal(false)
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
    if (rows.length > 0 || supplierId || subject) {
      if (!confirm('入力内容をクリアしてもよろしいですか？')) {
        return
      }
    }

    setSupplierId('')
    setSupplierName('')
    setStaffId(null)
    setStaffName('')
    setSubject('')
    setDiscount(0)
    setTaxRate(0.1)
    setRows([])
    setLayoutType('vertical')
    setSections([])
    setOrderNo('')
    setOrderDate(new Date().toISOString().split('T')[0])
    setNote('')
    // 支払条件は入力欄削除に伴い初期化不要

    alert('入力内容をクリアしました')
  }

  const handleSave = async () => {
    // 倉庫移動モード時のバリデーション
    if (titleMode === 'warehouse-move') {
      if (!destinationWarehouseId) {
        alert('移動先倉庫を選択してください')
        return
      }
      if (!supplierId) {
        alert('移動元倉庫を選択してください')
        return
      }
      // 発注者は任意のため、未選択でも続行
      if (rows.length === 0) {
        alert('明細を1件以上追加してください')
        return
      }
      // 倉庫移動専用の保存処理
      await performWarehouseMoveSave()
      return
    }

    // 移動伝票作成モード: 移動元の出庫を反映（在庫減算）
    if (titleMode === 'transfer-slip') {
      if (!transferSourceWarehouseId) {
        alert('移動元倉庫を選択してください')
        return
      }
      if (rows.length === 0) {
        alert('明細を1件以上追加してください')
        return
      }
      await performTransferSlipSave()
      return
    }

    // 通常の注文書作成時のバリデーション
    if (!supplierId && !supplierName.trim()) {
      alert('発注先を選択してください')
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

    if (isUpdateMode && loadedOrderId) {
      setShowSaveModal(true)
      return
    }

    await performSave('new')
  }

  const performTransferSlipSave = async () => {
    try {
      let successOutboundCount = 0
      let successStockUpdateCount = 0
      let errorMessages: string[] = []

      console.log('=== 移動伝票保存開始（出庫のみ） ===')
      console.log('移動元倉庫ID:', transferSourceWarehouseId)
      console.log('移動品目数:', rows.length)

      // 出庫データを作成（warehouse_outboundsテーブル）
      try {
        // warehouse_outboundsのカラム構造を検出
        let outboundQtyColumnName = 'quantity'
        const { data: sampleOutbound } = await supabase
          .from('warehouse_outbounds')
          .select('*')
          .limit(1)

        if (sampleOutbound && sampleOutbound.length > 0) {
          const sample = sampleOutbound[0]
          if ('stock_qty' in sample) outboundQtyColumnName = 'stock_qty'
          else if ('quantity' in sample) outboundQtyColumnName = 'quantity'
          else if ('qty' in sample) outboundQtyColumnName = 'qty'
          else if ('stock' in sample) outboundQtyColumnName = 'stock'
          else if ('amount' in sample) outboundQtyColumnName = 'amount'
        }

        const outboundRecords = rows
          .filter((row) => row.product_id)
          .map((row) => {
            const record: any = {
              warehouse_id: transferSourceWarehouseId,
              product_id: String(row.product_id),
              created_at: new Date().toISOString(),
            }
            record[outboundQtyColumnName] = row.quantity
            return record
          })

        if (outboundRecords.length > 0) {
          const { error: outboundInsertError } = await supabase
            .from('warehouse_outbounds')
            .insert(outboundRecords)

          if (outboundInsertError) {
            console.error('出庫記録のエラー:', outboundInsertError.message)
            errorMessages.push('出庫記録: ' + outboundInsertError.message)
          } else {
            successOutboundCount += outboundRecords.length
          }
        } else {
          console.log('⚠️ product_idがある出庫レコードがないため、スキップします')
        }
      } catch (e: any) {
        console.error('出庫記録の例外:', e?.message)
        errorMessages.push('出庫記録: ' + (e?.message || '不明なエラー'))
      }

      // 在庫更新（トリガーが未設定でも反映させるため）
      try {
        // warehouse_stocksの数量列を検出
        let stockQtyColumnName = 'stock_qty'
        const { data: sampleStocks } = await supabase
          .from('warehouse_stocks')
          .select('*')
          .limit(1)

        if (sampleStocks && sampleStocks.length > 0) {
          const sample = sampleStocks[0]
          if ('stock_qty' in sample) stockQtyColumnName = 'stock_qty'
          else if ('quantity' in sample) stockQtyColumnName = 'quantity'
          else if ('qty' in sample) stockQtyColumnName = 'qty'
          else if ('stock' in sample) stockQtyColumnName = 'stock'
        }

        const productIds = rows.map(r => r.product_id).filter(Boolean) as string[]
        if (productIds.length > 0) {
          const { data: currentStocks, error: curErr } = await supabase
            .from('warehouse_stocks')
            .select('*')
            .eq('warehouse_id', transferSourceWarehouseId)
            .in('product_id', productIds)

          if (curErr) {
            console.error('在庫取得エラー:', curErr.message)
            errorMessages.push('在庫取得: ' + curErr.message)
          } else {
            const curMap = new Map<string, number>()
            for (const s of currentStocks || []) {
              const qty = Number(s[stockQtyColumnName] || 0)
              curMap.set(String(s.product_id), qty)
            }

            const upserts: any[] = []
            for (const r of rows) {
              if (!r.product_id) continue
              const pid = String(r.product_id)
              const current = curMap.get(pid) || 0
              const next = Math.max(0, current - r.quantity)
              const rec: any = { warehouse_id: transferSourceWarehouseId, product_id: pid }
              rec[stockQtyColumnName] = next
              upserts.push(rec)
            }

            if (upserts.length > 0) {
              const { error: upsertErr } = await supabase
                .from('warehouse_stocks')
                .upsert(upserts, { onConflict: 'warehouse_id,product_id' })

              if (upsertErr) {
                console.error('在庫更新エラー:', upsertErr.message)
                errorMessages.push('在庫更新: ' + upsertErr.message)
              } else {
                successStockUpdateCount += upserts.length
              }
            }
          }
        }
      } catch (e: any) {
        console.error('在庫更新の例外:', e?.message)
        errorMessages.push('在庫更新: ' + (e?.message || '不明なエラー'))
      }

      let message = `移動伝票の保存が完了しました\n移動元: ${transferSourceWarehouseName}\n対象品目数: ${rows.length}件`
      message += `\n✓ 出庫登録: ${successOutboundCount}件`
      message += `\n✓ 在庫更新: ${successStockUpdateCount}件`
      if (errorMessages.length > 0) {
        message += `\n\n⚠️ エラー:\n${errorMessages.join('\n')}`
      }

      alert(message)
      handleClear()
    } catch (error) {
      console.error('移動伝票保存エラー:', error)
      alert(`移動伝票保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
  }

  const performWarehouseMoveSave = async () => {
    try {
      let successInboundCount = 0
      let successOutboundCount = 0
      let errorMessages: string[] = []

      console.log('=== 倉庫移動保存開始 ===')
      console.log('移動先倉庫ID:', destinationWarehouseId)
      console.log('移動品目数:', rows.length)
      console.log('rows:', rows)

      // 入庫データを作成（warehouse_inboundsテーブル）
      try {
        // warehouse_inboundsのカラム構造を検出
        let inboundQtyColumnName = 'quantity' // デフォルト
        const { data: sampleInbound, error: sampleInboundError } = await supabase
          .from('warehouse_inbounds')
          .select('*')
          .limit(1)
        
        console.log('入庫サンプル取得:', { sampleInbound, error: sampleInboundError?.message })
        
        if (sampleInbound && sampleInbound.length > 0) {
          const sample = sampleInbound[0]
          if ('stock_qty' in sample) inboundQtyColumnName = 'stock_qty'
          else if ('quantity' in sample) inboundQtyColumnName = 'quantity'
          else if ('qty' in sample) inboundQtyColumnName = 'qty'
          else if ('stock' in sample) inboundQtyColumnName = 'stock'
          else if ('amount' in sample) inboundQtyColumnName = 'amount'
          console.log('検出された入庫数量列名:', inboundQtyColumnName)
        } else {
          console.log('⚠️ warehouse_inbounds のサンプルなし。デフォルト列名を使用:', inboundQtyColumnName)
        }

        const inboundRecords = rows
          .filter((row) => row.product_id) // product_idがあるもののみ
          .map((row) => {
            const record: any = {
              warehouse_id: destinationWarehouseId,
              product_id: String(row.product_id), // テキスト型として保持
              created_at: new Date().toISOString(),
            }
            record[inboundQtyColumnName] = row.quantity
            return record
          })

        console.log(`入庫レコード(${inboundRecords.length}件):`, inboundRecords)

        if (inboundRecords.length > 0) {
          const { error: inboundInsertError, data: inboundData } = await supabase
            .from('warehouse_inbounds')
            .insert(inboundRecords)
            .select()
          
          if (inboundInsertError) {
            console.error('入庫記録のエラー:', inboundInsertError.message)
            errorMessages.push('入庫記録: ' + inboundInsertError.message)
          } else {
            console.log(`✓ 入庫記録を登録しました(${inboundRecords.length}件)`, inboundData)
            console.log('※ トリガー関数により warehouse_stocks は自動更新されます')
            successInboundCount += inboundRecords.length
          }
        } else {
          console.log('⚠️ product_idがある入庫レコードがないため、スキップします')
        }
      } catch (inboundError: any) {
        console.error('入庫記録の例外:', inboundError?.message)
        errorMessages.push('入庫記録: ' + (inboundError?.message || '不明なエラー'))
      }

      // 出庫データを作成（warehouse_outboundsテーブル）
      try {
        // warehouse_outboundsのカラム構造を検出
        let outboundQtyColumnName = 'quantity' // デフォルト
        const { data: sampleOutbound, error: sampleOutboundError } = await supabase
          .from('warehouse_outbounds')
          .select('*')
          .limit(1)

        console.log('出庫サンプル取得:', { sampleOutbound, error: sampleOutboundError?.message })

        if (sampleOutbound && sampleOutbound.length > 0) {
          const sample = sampleOutbound[0]
          if ('stock_qty' in sample) outboundQtyColumnName = 'stock_qty'
          else if ('quantity' in sample) outboundQtyColumnName = 'quantity'
          else if ('qty' in sample) outboundQtyColumnName = 'qty'
          else if ('stock' in sample) outboundQtyColumnName = 'stock'
          else if ('amount' in sample) outboundQtyColumnName = 'amount'
          console.log('検出された出庫数量列名:', outboundQtyColumnName)
        } else {
          console.log('⚠️ warehouse_outbounds のサンプルなし。デフォルト列名を使用:', outboundQtyColumnName)
        }

        const outboundRecords = rows
          .filter((row) => row.product_id) // product_idがあるもののみ
          .map((row) => {
            const record: any = {
              warehouse_id: supplierId, // 移動元
              product_id: String(row.product_id),
              created_at: new Date().toISOString(),
            }
            record[outboundQtyColumnName] = row.quantity
            return record
          })

        console.log(`出庫レコード(${outboundRecords.length}件):`, outboundRecords)

        if (outboundRecords.length > 0) {
          const { error: outboundInsertError, data: outboundData } = await supabase
            .from('warehouse_outbounds')
            .insert(outboundRecords)
            .select()

          if (outboundInsertError) {
            console.error('出庫記録のエラー:', outboundInsertError.message)
            errorMessages.push('出庫記録: ' + outboundInsertError.message)
          } else {
            console.log(`✓ 出庫記録を登録しました(${outboundRecords.length}件)`, outboundData)
            console.log('※ トリガー関数により warehouse_stocks は自動更新されます')
            successOutboundCount += outboundRecords.length
          }
        } else {
          console.log('⚠️ product_idがある出庫レコードがないため、スキップします')
        }
      } catch (outboundError: any) {
        console.error('出庫記録の例外:', outboundError?.message)
        errorMessages.push('出庫記録: ' + (outboundError?.message || '不明なエラー'))
      }

      // 結果メッセージ
      let message = `倉庫移動処理が完了しました\n移動元: ${supplierName}\n移動先: ${destinationWarehouseName}\n対象品目数: ${rows.length}件`
      
      message += `\n✓ 出庫登録: ${successOutboundCount}件`
      message += `\n✓ 入庫登録: ${successInboundCount}件`
      
      if (errorMessages.length > 0) {
        message += `\n\n⚠️ エラー:\n${errorMessages.join('\n')}`
      }

      // 倉庫移動ケースレコードの保存
      try {
        const caseId = generateOrderId()
        const { error: caseError } = await supabase.from('cases').insert({
          case_id: caseId,
          subject: subject || '倉庫移動',
          created_date: orderDate,
          status: '倉庫移動',
          source_warehouse_id: supplierId,
          source_warehouse_name: supplierName,
          destination_warehouse_id: destinationWarehouseId,
          destination_warehouse_name: destinationWarehouseName,
          note: note || null,
        })

        if (caseError) {
          console.warn('ケース記録警告:', caseError.message)
        }
      } catch (e: any) {
        console.warn('ケース記録の例外:', e?.message)
      }
      
      console.log('=== 倉庫移動保存完了 ===')
      alert(message)
      
      // フォームをクリア
      handleClear()
    } catch (error) {
      console.error('倉庫移動保存エラー:', error)
      alert(
        `倉庫移動の保存に失敗しました: ${
          error instanceof Error ? error.message : '不明なエラー'
        }`
      )
    }
  }

  const performSave = async (mode: 'new' | 'update') => {
    setShowSaveModal(false)

    try {
      let finalSupplierId = supplierId

      // 新規発注先の場合、customersテーブルに登録
      if (isNewSupplier && supplierName) {
        const newCustomerId = `CUST_${Date.now()}`
        const { error: customerError } = await supabase
          .from('customers')
          .insert({ id: newCustomerId, name: supplierName })

        if (customerError) {
          throw new Error(`発注先登録エラー: ${customerError.message}`)
        }

        finalSupplierId = supplierName
        setIsNewSupplier(false)
        alert(`新規発注先「${supplierName}」を登録しました`)
      }

      let targetOrderId: string

      if (mode === 'update' && loadedOrderId) {
        targetOrderId = loadedOrderId

        const { error: orderError } = await supabase
          .from('cases')
          .update({
            case_no: orderNo ? parseInt(orderNo) : null,
            order_no: orderNo || null,
            subject: subject,
            created_date: orderDate,
            customer_id: finalSupplierId,
            staff_id: staffId,
            status: '注文',
            department: department || null,
            special_discount: discount,
            layout_type: layoutType,
            purchaser_name: purchaserName || null,
            note: note || null,
          })
          .eq('case_id', loadedOrderId)

        if (orderError) {
          throw new Error(`発注書更新エラー: ${orderError.message}`)
        }

        await supabase.from('case_details').delete().eq('case_id', loadedOrderId)
        await supabase.from('case_sections').delete().eq('case_id', loadedOrderId)

      } else {
        targetOrderId = generateOrderId()

        const { error: orderError } = await supabase.from('cases').insert({
          case_id: targetOrderId,
          case_no: orderNo ? parseInt(orderNo) : null,
          order_no: orderNo || null,
          subject: subject,
          created_date: orderDate,
          customer_id: finalSupplierId,
          staff_id: staffId,
          status: '注文',
          department: department || null,
          special_discount: discount,
          layout_type: layoutType,
          purchaser_name: purchaserName || null,
          note: note || null,
          approve_staff: null,
          approve_manager: null,
          approve_director: null,
          approve_president: null,
        })

        if (orderError) {
          throw new Error(`発注書登録エラー: ${orderError.message}`)
        }
      }

      if (layoutType === 'horizontal' && sections.length > 0) {
        const sectionsToInsert = sections.map((section) => ({
          case_id: targetOrderId,
          section_id: section.id,
          section_name: section.name,
        }))

        const { error: sectionError } = await supabase
          .from('case_sections')
          .insert(sectionsToInsert)

        if (sectionError) {
          if (mode === 'new') {
            await supabase.from('cases').delete().eq('case_id', targetOrderId)
          }
          throw new Error(`セクション登録エラー: ${sectionError.message}`)
        }
      }

      const detailsToInsert = rows.map((row) => ({
        case_id: targetOrderId,
        product_id: row.product_id || null,
        spec: row.spec,
        unit: row.unit,
        quantity: row.quantity,
        unit_price: row.unit_price,
        amount: row.amount,
        cost_unit_price: row.cost_price,
        section_id: row.section_id,
        unregistered_product: row.unregistered_product || null,
        remarks: row.remarks || null,
      }))

      const { error: detailsError } = await supabase
        .from('case_details')
        .insert(detailsToInsert)

      if (detailsError) {
        if (mode === 'new') {
          await supabase.from('cases').delete().eq('case_id', targetOrderId)
        }
        if (layoutType === 'horizontal') {
          await supabase.from('case_sections').delete().eq('case_id', targetOrderId)
        }
        throw new Error(`明細登録エラー: ${detailsError.message}`)
      }

      const actionText = mode === 'update' ? '更新' : '保存'
      alert(`発注書を${actionText}しました`)
      
      if (mode === 'update') {
        setIsUpdateMode(false)
        setLoadedOrderId(null)
      }
    } catch (error) {
      console.error('保存エラー:', error)
      alert(
        `保存に失敗しました: ${
          error instanceof Error ? error.message : '不明なエラー'
        }`
      )
    }
  }

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `発注書_${supplierName || '無題'}_${new Date()
      .toISOString()
      .split('T')[0]}`,
  })

  const handlePrintPreview = () => {
    if (!supplierId && !supplierName.trim()) return alert('発注先未選択')
    // 担当者は印刷時も任意とする
    if (!subject.trim()) return alert('件名未入力')
    if (rows.length === 0) return alert('明細がありません')
    if (layoutType === 'horizontal' && rows.some(r => r.section_id === null)) return alert('横様式は全明細にセクション必須')
    
    setTimeout(() => {
      if (!printRef.current) {
        console.warn('printRef が未設定です')
        return alert('印刷対象の生成が完了していません')
      }
      handlePrint()
    }, 200)
  }

  const subtotal = rows.reduce((s, r) => s + r.amount, 0)
  const totalCostAmount = rows.reduce((s, r) => s + r.cost_price * r.quantity, 0)
  const totalGrossProfit = subtotal - totalCostAmount
  const grossProfitRate = subtotal > 0 ? (totalGrossProfit / subtotal) * 100 : 0
  const subtotalAfterDiscount = subtotal - discount
  const taxAmount = Math.floor(subtotalAfterDiscount * taxRate)
  const totalAmount = subtotalAfterDiscount + taxAmount

  const [approvalStamps, setApprovalStamps] = useState({
    staff: false,
    manager: false,
    director: false,
    president: false,
  })

  const productTotalPages = Math.ceil(productTotalCount / productPageSize)

  return (
    <>
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { key: 'order', label: '注文書作成' },
                { key: 'transfer-slip', label: '移動伝票作成' },
                { key: 'warehouse-move', label: '倉庫移動' },
              ].map((opt: any) => {
                const active = titleMode === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => setTitleMode(opt.key)}
                    className="btn-3d"
                    style={{
                      padding: '10px 16px',
                      fontSize: '20pt',
                      fontWeight: 700,
                      border: '1px solid #334155',
                      backgroundColor: active ? '#2563eb' : '#1e293b',
                      color: active ? '#fff' : '#cbd5e1',
                      borderRadius: 8,
                      lineHeight: 1.1,
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
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
                発注番号:
              </label>
              <input
                type="text"
                value={orderNo}
                readOnly
                style={{ ...inputStyle, width: '100%' }}
                placeholder="自動採番"
              />
              <span style={{ fontSize: 14, color: '#64748b' }}>
                ※自動採番。採番不可の場合は未採番
              </span>
            </div>

            <div>
              <label style={labelStyle}>部門:</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input-inset"
                style={{ ...inputStyle, width: '100%' }}
              >
                <option value="">選択してください</option>
                {DEPARTMENTS.map((name, idx) => (
                  <option key={idx} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>
                日付:
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            {titleMode !== 'warehouse-move' && (
              <div>
                <label style={labelStyle}>
                  納品先名:
                </label>
                <input
                  type="text"
                  value={purchaserName}
                  onChange={(e) => setPurchaserName(e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                  placeholder="例: 山田太郎"
                />
              </div>
            )}
          </div>
        </div>

        {/* 倉庫移動モード専用: 移動先/移動元倉庫 */}
        {titleMode === 'warehouse-move' && (
          <div style={{ marginBottom: 16, padding: 16, border: '1px solid #334155', borderRadius: 8, backgroundColor: '#1e293b' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>移動先倉庫:</label>
                <select
                  value={destinationWarehouseId}
                  onChange={(e) => {
                    const wh = warehouses.find(w => w.id === e.target.value)
                    setDestinationWarehouseId(e.target.value)
                    setDestinationWarehouseName(wh?.name || '')
                  }}
                  style={{ ...inputStyle, width: '100%', maxWidth: 400 }}
                >
                  <option value="">選択してください</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.id} - {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>移動元倉庫:</label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    const wh = warehouses.find(w => w.id === e.target.value)
                    setSupplierId(e.target.value)
                    setSupplierName(wh?.name || '')
                  }}
                  style={{ ...inputStyle, width: '100%', maxWidth: 400 }}
                >
                  <option value="">選択してください</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.id} - {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 移動伝票作成モード専用: 移動元倉庫表示/選択 */}
        {titleMode === 'transfer-slip' && (
          <div style={{ marginBottom: 16, padding: 16, border: '1px solid #334155', borderRadius: 8, backgroundColor: '#1e293b' }}>
            <div>
              <label style={labelStyle}>移動元倉庫:</label>
              <select
                value={transferSourceWarehouseId}
                onChange={(e) => {
                  const wh = warehouses.find(w => w.id === e.target.value)
                  setTransferSourceWarehouseId(e.target.value)
                  setTransferSourceWarehouseName(wh?.name || '')
                }}
                style={{ ...inputStyle, width: '100%', maxWidth: 400 }}
              >
                <option value="">選択してください</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id} - {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* 発注先・担当者 (倉庫移動では非表示) */}
        {titleMode !== 'warehouse-move' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>発注先:</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={supplierName}
                readOnly
                style={{ ...inputStyle, flex: 1, backgroundColor: '#334155' }}
                placeholder="発注先を選択してください"
              />
              <button
                onClick={() => setShowSupplierModal(true)}
                className="selector-button primary"
              >
                発注先選択
              </button>
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
        )}

        {/* 倉庫移動モード: 納品先名 */}
        {titleMode === 'warehouse-move' && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>納品先名:</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={staffName}
                readOnly
                style={{ ...inputStyle, flex: 1, backgroundColor: '#334155' }}
                placeholder="納品先名を選択してください"
              />
              <button
                onClick={() => setShowStaffModal(true)}
                className="selector-button primary"
              >
                納品先名選択
              </button>
            </div>
          </div>
        )}

        {/* 件名・備考 (倉庫移動では非表示) */}
        {titleMode !== 'warehouse-move' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <div>
            <label style={labelStyle}>件名:</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
              placeholder="例: ○○工事発注"
            />
          </div>
          <div>
            <label style={labelStyle}>備考:</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
              placeholder="備考を入力"
            />
          </div>
        </div>
        )}

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
                  fetchEstimates()
                  setShowEstimateModal(true)
                }}
                className="selector-button primary"
              >
                📋 見積から読込
              </button>
              <button
                onClick={() => {
                  if (titleMode === 'transfer-slip') {
                    if (!transferSourceWarehouseId) {
                      alert('移動元倉庫を選択してください')
                      return
                    }
                    fetchWarehouseStocks()
                  } else {
                    // 通常は商品マスタを維持
                  }
                  setShowProductModal(true)
                }}
                className="selector-button primary"
              >
                + 商品追加
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: titleMode === 'warehouse-move' ? '700px' : '1000px' }}>
              <thead>
                <tr>
                  {titleMode !== 'warehouse-move' && layoutType === 'horizontal' && (
                    <th style={{...thStyle, minWidth: '180px'}}>セクション</th>
                  )}
                  <th style={{...thStyle, minWidth: '250px'}}>品名</th>
                  <th style={{...thStyle, minWidth: '200px'}}>規格</th>
                  <th style={{...thStyle, width: '80px'}}>単位</th>
                  <th style={{...thStyle, width: '100px'}}>数量</th>
                  {titleMode !== 'warehouse-move' && (
                    <>
                      <th style={{...thStyle, width: '150px'}}>単価</th>
                      <th style={{...thStyle, width: '150px'}}>金額</th>
                      <th style={{...thStyle, width: '150px'}}>原価額</th>
                      <th style={{...thStyle, width: '150px'}}>粗利額</th>
                    </>
                  )}
                  <th style={{...thStyle, width: '100px'}}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const costAmount = row.cost_price * row.quantity
                  const grossProfit = row.amount - costAmount

                  return (
                    <tr key={index}>
                      {titleMode !== 'warehouse-move' && layoutType === 'horizontal' && (
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
                      <td style={tdStyle}>
                        {row.item_name}
                        {titleMode !== 'warehouse-move' && (row.unit_price === null || row.unit_price === 0) && (
                          <span style={{ color: '#ef4444', marginLeft: 8, fontSize: 14, fontWeight: 'bold' }}>
                            価格未入力
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>{row.spec}</td>
                      <td style={{...tdStyle, textAlign: 'center'}}>{row.unit}</td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={row.quantity}
                          onChange={(e) =>
                            handleQuantityChange(index, Number(e.target.value))
                          }
                          style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                        />
                      </td>
                      {titleMode !== 'warehouse-move' && (
                        <>
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
                          <td style={{...tdStyle, textAlign: 'right'}}>{row.amount.toLocaleString()}</td>
                          <td style={{...tdStyle, textAlign: 'right'}}>{costAmount.toLocaleString()}</td>
                          <td style={{...tdStyle, textAlign: 'right'}}>{grossProfit.toLocaleString()}</td>
                        </>
                      )}
                      <td style={{...tdStyle, textAlign: 'center'}}>
                        <button
                          onClick={() => handleDeleteRow(index)}
                          className="selector-button"
                          style={{
                            backgroundColor: '#dc2626',
                            borderColor: '#991b1b',
                            color: '#fff',
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
        </div>

        {/* 合計 (倉庫移動では非表示) */}
        {titleMode !== 'warehouse-move' && (
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
          <div style={{...sumRowStyle, padding: '10px'}}>
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
          <div style={sumRowStyle}>
            <span>消費税 ({(taxRate * 100).toFixed(0)}%)</span>
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
        )}

        {/* ボタン */}
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
                    style={{ flex: 1, fontSize: 16, ...inputStyle }}
                    placeholder="例: 仮設工事"
                  />
                  <button
                    onClick={handleAddSection}
                    className="selector-button primary"
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
                            className="selector-button"
                            style={{
                              backgroundColor: '#dc2626',
                              borderColor: '#991b1b',
                              color: '#fff',
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
                  className="selector-button primary"
                >
                  完了
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 部門一覧編集モーダルは固定化に伴い削除 */}

        {/* 発注先選択モーダル */}
        {showSupplierModal && (
          <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
              <h2>発注先選択</h2>

              {/* 新規入力フィールド */}
              <div
                style={{
                  marginBottom: 16,
                  padding: 16,
                  backgroundColor: '#0f172a',
                  borderRadius: 8,
                  border: '2px solid #16a34a',
                }}
              >
                <label style={{ ...labelStyle, color: '#16a34a' }}>
                  ✨ 新規発注先を直接入力:
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    placeholder="発注先名を入力（例: ○○株式会社）"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSelectNewSupplier()}
                    style={{ flex: 1, fontSize: 16, ...inputStyle }}
                  />
                  <button
                    onClick={handleSelectNewSupplier}
                    className="selector-button primary"
                    style={{ backgroundColor: '#16a34a', borderColor: '#15803d' }}
                  >
                    ✓ 新規登録
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  ※ 保存時に顧客マスタに自動登録されます
                </div>
              </div>

              <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginBottom: 12 }}>
                <label style={{ ...labelStyle, fontSize: 14 }}>既存の発注先から検索:</label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="発注先名で検索"
                  value={supplierSearchName}
                  onChange={(e) => setSupplierSearchName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSupplierSearch()}
                  style={{ flex: 1, fontSize: 16, ...inputStyle }}
                />
                <button
                  onClick={handleSupplierSearch}
                  className="selector-button primary"
                >
                  検索
                </button>
              </div>

              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>発注先名</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.length === 0 ? (
                      <tr>
                        <td colSpan={2} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
                          該当する発注先が見つかりません
                        </td>
                      </tr>
                    ) : (
                      suppliers.map((supplier) => (
                        <tr key={supplier.id}>
                          <td style={tdStyle}>{supplier.name}</td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => handleSelectSupplier(supplier)}
                              className="selector-button primary"
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
                  onClick={() => setShowSupplierModal(false)}
                  className="selector-button"
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
                            className="selector-button primary"
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
                  className="selector-button"
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

              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #475569' }}>
                <button
                  onClick={() => setProductModalTab('search')}
                  style={{
                    backgroundColor: productModalTab === 'search' ? '#2563eb' : 'transparent',
                    color: productModalTab === 'search' ? '#fff' : '#cbd5e1',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  📚 マスタから選択
                </button>
                <button
                  onClick={() => setProductModalTab('manual')}
                  style={{
                    backgroundColor: productModalTab === 'manual' ? '#2563eb' : 'transparent',
                    color: productModalTab === 'manual' ? '#fff' : '#cbd5e1',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  ✏️ 直接入力
                </button>
              </div>

              {productModalTab === 'search' && titleMode !== 'transfer-slip' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input
                      type="text"
                      placeholder="商品名で検索"
                      value={productSearchName}
                      onChange={(e) => setProductSearchName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleProductSearch()}
                      style={{ flex: 1, fontSize: 16, ...inputStyle }}
                    />
                    <input
                      type="text"
                      placeholder="規格で検索"
                      value={productSearchSpec}
                      onChange={(e) => setProductSearchSpec(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleProductSearch()}
                      style={{ flex: 1, fontSize: 16, ...inputStyle }}
                    />
                    <button
                      onClick={handleProductSearch}
                      className="selector-button primary"
                    >
                      検索
                    </button>
                  </div>

                  <div style={{ marginBottom: 8, fontSize: 14, color: '#94a3b8' }}>
                    全 {productTotalCount} 件中 {productPage * productPageSize + 1} 〜{' '}
                    {Math.min((productPage + 1) * productPageSize, productTotalCount)} 件を表示
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
                                className="selector-button primary"
                              >
                                選択
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {productTotalPages > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 16,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <button
                        disabled={productPage === 0}
                        onClick={() => fetchProducts(0)}
                        className="selector-button"
                      >
                        最初
                      </button>
                      <button
                        disabled={productPage === 0}
                        onClick={() => fetchProducts(productPage - 1)}
                        className="selector-button"
                      >
                        ← 前へ
                      </button>
                      <span style={{ fontSize: 16, fontWeight: 'bold', color: '#e2e8f0' }}>
                        {productPage + 1} / {productTotalPages}
                      </span>
                      <button
                        disabled={productPage === productTotalPages - 1}
                        onClick={() => fetchProducts(productPage + 1)}
                        className="selector-button"
                      >
                        次へ →
                      </button>
                      <button
                        disabled={productPage === productTotalPages - 1}
                        onClick={() => fetchProducts(productTotalPages - 1)}
                        className="selector-button"
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
                      className="selector-button"
                      style={{ marginRight: 8 }}
                    >
                      リセット
                    </button>
                    <button
                      onClick={() => setShowProductModal(false)}
                      className="selector-button"
                    >
                      閉じる
                    </button>
                  </div>
                </>
              )}

              {productModalTab === 'search' && titleMode === 'transfer-slip' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input
                      type="text"
                      placeholder="在庫の商品名で検索（移動元）"
                      value={stockSearchName}
                      onChange={(e) => setStockSearchName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && fetchWarehouseStocks()}
                      style={{ flex: 1, fontSize: 16, ...inputStyle }}
                    />
                    <button
                      onClick={fetchWarehouseStocks}
                      className="selector-button primary"
                    >
                      検索
                    </button>
                  </div>

                  <div style={{ maxHeight: 400, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>商品コード</th>
                          <th style={thStyle}>商品名（移動元在庫）</th>
                          <th style={thStyle}>規格</th>
                          <th style={thStyle}>単位</th>
                          <th style={{ ...thStyle, width: 80 }}>在庫</th>
                          <th style={thStyle}>原価</th>
                          <th style={thStyle}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warehouseStocks.map((stk) => {
                          const hasIssue = !stk.spec || !stk.unit || stk.cost_price <= 0
                          return (
                            <tr key={stk.product_id} style={hasIssue ? { backgroundColor: '#422006' } : {}}>
                              <td style={tdStyle}>{stk.product_id}</td>
                              <td style={tdStyle}>{stk.product_name}</td>
                              <td 
                                style={{ ...tdStyle, cursor: !stk.spec ? 'pointer' : 'default' }}
                                onClick={() => {
                                  if (!stk.spec) {
                                    setEditingStock(stk)
                                    setEditSpec(stk.spec || '')
                                    setEditUnit(stk.unit || '')
                                    setEditCostPrice(stk.cost_price || 0)
                                    setShowStockEditModal(true)
                                  }
                                }}
                              >
                                {stk.spec || <span style={{ color: '#fbbf24', fontSize: 12 }}>未登録 - クリックで入力</span>}
                              </td>
                              <td 
                                style={{ ...tdStyle, cursor: !stk.unit ? 'pointer' : 'default' }}
                                onClick={() => {
                                  if (!stk.unit) {
                                    setEditingStock(stk)
                                    setEditSpec(stk.spec || '')
                                    setEditUnit(stk.unit || '')
                                    setEditCostPrice(stk.cost_price || 0)
                                    setShowStockEditModal(true)
                                  }
                                }}
                              >
                                {stk.unit ? stk.unit : <span style={{ color: '#f87171', fontSize: 12 }}>データなし - クリックで入力</span>}
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{stk.stock_qty}</td>
                              <td 
                                style={{ ...tdStyle, textAlign: 'right', cursor: stk.cost_price <= 0 ? 'pointer' : 'default' }}
                                onClick={() => {
                                  if (stk.cost_price <= 0) {
                                    setEditingStock(stk)
                                    setEditSpec(stk.spec || '')
                                    setEditUnit(stk.unit || '')
                                    setEditCostPrice(stk.cost_price || 0)
                                    setShowStockEditModal(true)
                                  }
                                }}
                              >
                                {stk.cost_price > 0 ? (
                                  stk.cost_price.toLocaleString()
                                ) : (
                                  <span style={{ color: '#f87171', fontSize: 12 }}>データなし - クリックで入力</span>
                                )}
                              </td>
                              <td style={tdStyle}>
                                <button
                                  onClick={() => {
                                    // 不足情報（規格・単位・原価）があっても行追加を許可
                                    const newRow: Row = {
                                      product_id: stk.product_id,
                                      item_name: stk.product_name,
                                      spec: stk.spec || '',
                                      unit: stk.unit || '',
                                      quantity: 1,
                                      unit_price: null,
                                      amount: 0,
                                      cost_price: stk.cost_price || 0,
                                      section_id: null,
                                      max_stock_qty: stk.stock_qty,
                                    }
                                    setRows((prev) => [...prev, newRow])
                                    setShowProductModal(false)
                                  }}
                                  className="selector-button primary"
                                >
                                  選択
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                        {warehouseStocks.length === 0 && (
                          <tr>
                            <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>
                              在庫が見つかりません
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <button
                      onClick={() => {
                        setStockSearchName('')
                        setWarehouseStocks([])
                      }}
                      className="selector-button"
                      style={{ marginRight: 8 }}
                    >
                      リセット
                    </button>
                    <button
                      onClick={() => setShowProductModal(false)}
                      className="selector-button"
                    >
                      閉じる
                    </button>
                  </div>
                </>
              )}

              {productModalTab === 'manual' && (
                <>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: '#0f172a',
                      borderRadius: 4,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>
                          商品名 <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={manualProductName}
                          onChange={(e) => setManualProductName(e.target.value)}
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="商品名を入力"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>規格</label>
                        <input
                          type="text"
                          value={manualProductSpec}
                          onChange={(e) => setManualProductSpec(e.target.value)}
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="例: 1000x2000"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>単位</label>
                        <input
                          type="text"
                          value={manualProductUnit}
                          onChange={(e) => setManualProductUnit(e.target.value)}
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="例: 個、m、kg"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>数量</label>
                        <input
                          type="number"
                          value={manualProductQuantity}
                          onChange={(e) =>
                            setManualProductQuantity(Number(e.target.value) || 0)
                          }
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>単価</label>
                        <input
                          type="number"
                          value={manualProductUnitPrice ?? ''}
                          onChange={(e) =>
                            setManualProductUnitPrice(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>原価</label>
                        <input
                          type="number"
                          value={manualProductCostPrice}
                          onChange={(e) =>
                            setManualProductCostPrice(Number(e.target.value) || 0)
                          }
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 16,
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      onClick={() => setShowProductModal(false)}
                      className="selector-button"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleAddManualProduct}
                      className="selector-button primary"
                      style={{ backgroundColor: '#16a34a' }}
                    >
                      ✅ 追加
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 単価計算モーダル */}
        {showPriceModal && (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: 600 }}>
              <h2>単価設定</h2>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 16,
                  borderBottom: '2px solid #475569',
                }}
              >
                <button
                  onClick={() => setPriceModalMode('calculate')}
                  style={{
                    backgroundColor:
                      priceModalMode === 'calculate' ? '#2563eb' : 'transparent',
                    color: priceModalMode === 'calculate' ? '#fff' : '#cbd5e1',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  📊 掛率計算
                </button>
                <button
                  onClick={() => setPriceModalMode('direct')}
                  style={{
                    backgroundColor:
                      priceModalMode === 'direct' ? '#2563eb' : 'transparent',
                    color: priceModalMode === 'direct' ? '#fff' : '#cbd5e1',
                    borderRadius: '4px 4px 0 0',
                    border: 'none',
                    padding: '8px 16px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  ✏️ 直接入力
                </button>
              </div>

              {priceModalMode === 'calculate' && (
                <>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: '#0f172a',
                      borderRadius: 4,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 12,
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <label style={labelStyle}>定価</label>
                        <input
                          type="number"
                          value={priceModalListPrice ?? ''}
                          onChange={(e) =>
                            setPriceModalListPrice(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>掛率 (%)</label>
                        <input
                          type="number"
                          value={priceModalRate ?? ''}
                          onChange={(e) =>
                            setPriceModalRate(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          style={{ width: '100%', fontSize: 16, ...inputStyle }}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCalculatePrice}
                      className="selector-button primary"
                      style={{ width: '100%', marginBottom: 12 }}
                    >
                      計算
                    </button>

                    {priceModalCalculatedPrice !== null && (
                      <div
                        style={{
                          padding: 12,
                          backgroundColor: '#1e293b',
                          border: '2px solid #16a34a',
                          borderRadius: 4,
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ fontSize: 14, color: '#94a3b8' }}>計算結果</span>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#16a34a' }}>
                          {priceModalCalculatedPrice.toLocaleString()} 円
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {priceModalMode === 'direct' && (
                <>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: '#0f172a',
                      borderRadius: 4,
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>単価</label>
                      <input
                        type="number"
                        value={priceModalDirectPrice ?? ''}
                        onChange={(e) =>
                          setPriceModalDirectPrice(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        style={{ width: '100%', fontSize: 16, ...inputStyle }}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowPriceModal(false)}
                  className="selector-button"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleApplyPrice}
                  className="selector-button primary"
                  style={{ backgroundColor: '#16a34a' }}
                >
                  ✅ 確定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 見積読込モーダル */}
        {showEstimateModal && (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: 1400, width: '95%' }}>
              <h2>見積から読込</h2>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="件名で検索"
                  value={estimateSearchSubject}
                  onChange={(e) => setEstimateSearchSubject(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchEstimates()}
                  style={{ flex: 1, fontSize: 18, ...inputStyle }}
                />
                <button
                  onClick={fetchEstimates}
                  className="selector-button primary"
                  style={{ backgroundColor: '#2563eb' }}
                >
                  検索
                </button>
              </div>

              <div style={{ maxHeight: 500, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>見積No</th>
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
                    {estimates.map((c) => (
                      <tr key={c.case_id}>
                        <td style={tdStyle}>{c.case_no || '未採番'}</td>
                        <td style={tdStyle}>{c.subject || '-'}</td>
                        <td style={tdStyle}>{c.customer_name || '-'}</td>
                        <td style={tdStyle}>{c.staff_name || '-'}</td>
                        <td style={tdStyle}>{c.created_date || '-'}</td>
                        <td style={tdStyle}>{c.delivery_place || '-'}</td>
                        <td style={tdStyle}>{c.delivery_deadline || '-'}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => handleLoadEstimate(c.case_id)}
                            className="selector-button primary"
                            style={{ backgroundColor: '#2563eb' }}
                          >
                            読込
                          </button>
                        </td>
                      </tr>
                    ))}
                    {estimates.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            ...tdStyle,
                            textAlign: 'center',
                            color: '#94a3b8',
                          }}
                        >
                          見積が見つかりません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button
                  onClick={() => setShowEstimateModal(false)}
                  className="selector-button"
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
              <h2 style={{ marginBottom: 24, textAlign: 'center' }}>
                保存方法を選択してください
              </h2>

              <div
                style={{
                  marginBottom: 24,
                  padding: 16,
                  backgroundColor: '#0f172a',
                  borderRadius: 8,
                }}
              >
                <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
                  既存の発注書を更新するか、新しい発注書として登録するか選択してください。
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  onClick={() => performSave('update')}
                  className="selector-button primary"
                  style={{
                    padding: '16px 24px',
                    fontSize: 18,
                    backgroundColor: '#16a34a',
                  }}
                >
                  既存発注書を更新する
                </button>

                <button
                  onClick={() => performSave('new')}
                  className="selector-button primary"
                  style={{
                    padding: '16px 24px',
                    fontSize: 18,
                  }}
                >
                  新しい発注書として登録する
                </button>

                <button
                  onClick={() => setShowSaveModal(false)}
                  className="selector-button"
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

        {/* 在庫商品詳細編集モーダル */}
        {showStockEditModal && editingStock && (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: 600 }}>
              <h2>商品情報の入力</h2>
            <div style={{ marginBottom: 16, color: '#94a3b8', fontSize: 14 }}>
              商品「{editingStock.product_name}」の規格・単位・原価を入力してください<br/>
              <span style={{ fontSize: 12, color: '#64748b' }}>※商品マスタは変更せず、この伝票の明細のみに反映されます</span>
            </div>

              <div style={{ padding: 16, backgroundColor: '#0f172a', borderRadius: 4, marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>規格</label>
                    <input
                      type="text"
                      value={editSpec}
                      onChange={(e) => setEditSpec(e.target.value)}
                      style={{ width: '100%', fontSize: 16, ...inputStyle }}
                      placeholder="例: 1000x2000"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>単位</label>
                    <input
                      type="text"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                      style={{ width: '100%', fontSize: 16, ...inputStyle }}
                      placeholder="例: 個、m、kg"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>原価</label>
                    <input
                      type="number"
                      value={editCostPrice}
                      onChange={(e) => setEditCostPrice(Number(e.target.value) || 0)}
                      style={{ width: '100%', fontSize: 16, ...inputStyle }}
                      placeholder="0"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      在庫数量: {editingStock.stock_qty}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowStockEditModal(false)
                    setEditingStock(null)
                  }}
                  className="selector-button"
                >
                  キャンセル
                </button>
                <button
                  onClick={async () => {
                    // 入力不足でも追加を許容
                    const newRow: Row = {
                      product_id: editingStock.product_id,
                      item_name: editingStock.product_name,
                      spec: editSpec || '',
                      unit: editUnit || '',
                      quantity: 1,
                      unit_price: null,
                      amount: 0,
                      cost_price: Number(editCostPrice) || 0,
                      section_id: null,
                      max_stock_qty: editingStock.stock_qty,
                    }
                    setRows((prev) => [...prev, newRow])

                    setShowStockEditModal(false)
                    setShowProductModal(false)
                    setEditingStock(null)
                  }}
                  className="selector-button primary"
                  style={{ backgroundColor: '#16a34a' }}
                >
                  ✅ 追加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 印刷コンポーネント - 非表示だが react-to-print で利用 */}
      <div style={{ display: 'none', position: 'absolute', left: '-9999px' }}>
        {titleMode === 'warehouse-move' ? (
          <PrintWarehouseMove
            ref={printRef}
            printRef={printRef}
            orderNo={orderNo}
            orderDate={orderDate}
            department={department}
            purchaserName={purchaserName}
            subject={subject}
            rows={rows}
            warehouseId={supplierId}
            warehouseName={supplierName}
            destinationWarehouse={destinationWarehouseName}
            staffStampUrl={staffStampUrl || undefined}
          />
        ) : (
          <PrintPurchaseOrder
            ref={printRef}
            printRef={printRef}
            supplierName={supplierName || ''}
            orderNo={orderNo}
            orderDate={orderDate}
            department={department}
            purchaserName={purchaserName}
            subject={subject}
            rows={rows}
            sections={sections}
            discount={discount}
            taxRate={0.1}
            subtotal={subtotal}
            subtotalAfterDiscount={subtotalAfterDiscount}
            taxAmount={taxAmount}
            totalAmount={totalAmount}
            layoutType={layoutType}
            MAX_ROWS_PER_PAGE={15}
            approvalStamps={approvalStamps}
            stampUrls={{
              staff: approvalStamps.staff ? '/stamps/staff.png' : null,
              manager: approvalStamps.manager ? '/stamps/manager.png' : null,
              director: approvalStamps.director ? '/stamps/director.png' : null,
              president: approvalStamps.president ? '/stamps/president.png' : null,
            }}
          />
        )}
      </div>
    </>
  )
}

function PurchaseOrderPageWithSuspense() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <PurchaseOrderPageContent />
    </Suspense>
  )
}

export default PurchaseOrderPageWithSuspense
