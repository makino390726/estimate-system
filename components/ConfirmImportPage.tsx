'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { sanitizeDateString, getFirstValidDate, getTodayDateString, debugDateValue } from '@/lib/dateValidator'

type Detail = {
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  product_id: string | null
  cost_price?: number | null
  cost_amount?: number | null
  gross_margin?: number | null
  section_name?: string
  wholesale_price?: number | null
}

type Staff = {
  id: string
  name: string
  email: string
}

type Product = {
  id: string
  name: string
  spec: string | null
  unit: string | null
  unit_price: number
  cost_price: number | null
}

type SectionDef = {
  order: number
  name: string
  amount: number
  wholesaleAmount?: number
}

export default function ConfirmImportPageComponent({ data, onBack }: { data: any; onBack: () => void }) {
  console.log('[ConfirmImportPage Component] Rendered with data:', !!data)
  console.log('[ConfirmImportPage Component] Data keys:', data ? Object.keys(data) : 'undefined')
  if (data) {
    console.log('[ConfirmImportPage Component] Data sample:', {
      estimateNo: data.estimateNo,
      estimateDate: data.estimateDate,
      customerName: data.customerName,
      subject: data.subject,
      deliveryDeadline: data.deliveryDeadline,
      deliveryTerms: data.deliveryTerms,
      validityText: data.validityText,
      paymentTerms: data.paymentTerms,
      detailsCount: data.details?.length
    })
  }
  
  const router = useRouter()
  
  const [importData, setImportData] = useState<any>(null)
  const [details, setDetails] = useState<Detail[]>([])
  const [sections, setSections] = useState<SectionDef[]>([])
  const [editEstimateNo, setEditEstimateNo] = useState<string>('')
  const [editEstimateDate, setEditEstimateDate] = useState<string>('')
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [productList, setProductList] = useState<Product[]>([])
  const [searchQueries, setSearchQueries] = useState<string[]>([])
  const [filteredOptions, setFilteredOptions] = useState<Product[][]>([])
  const [dropdownOpen, setDropdownOpen] = useState<boolean[]>([])
  const [pageIndex, setPageIndex] = useState<number[]>([])
  const [isSearching, setIsSearching] = useState<boolean[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [stampImage, setStampImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [specialDiscount, setSpecialDiscount] = useState<number>(0)
  const [taxRate, setTaxRate] = useState<number>(0.1)
  const [calculatedTaxAmount, setCalculatedTaxAmount] = useState<number>(0)
  const [calculatedTotalAmount, setCalculatedTotalAmount] = useState<number>(0)
  
  const [editCustomerName, setEditCustomerName] = useState<string>('')
  const [editSubject, setEditSubject] = useState<string>('')
  const [editDeliveryPlace, setEditDeliveryPlace] = useState<string>('')
  const [editDeliveryDeadline, setEditDeliveryDeadline] = useState<string>('')
  const [editDeliveryTerms, setEditDeliveryTerms] = useState<string>('')
  const [editValidityText, setEditValidityText] = useState<string>('')
  const [editPaymentTerms, setEditPaymentTerms] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [data])

  const loadData = async () => {
    console.log('[ConfirmImportPage] loadData START, data exists:', !!data)
    try {
      if (!data) {
        console.log('[ConfirmImportPage] No data provided, exiting loadData')
        return
      }

      console.log('[ConfirmImportPage] Full data:', JSON.stringify(data, null, 2))

      setImportData(data)
      setEditCustomerName(data.customerName || '')
      setEditSubject(data.subject || '')
      setEditDeliveryPlace(data.deliveryPlace || '')
      setEditDeliveryDeadline(data.deliveryDeadline || '')
      setEditDeliveryTerms(data.deliveryTerms || '')
      setEditValidityText(data.validityText || '')
      setEditPaymentTerms(data.paymentTerms || '')

      console.log('[ConfirmImportPage] Edit states set:', {
        customerName: data.customerName,
        subject: data.subject,
        deliveryPlace: data.deliveryPlace,
        deliveryDeadline: data.deliveryDeadline,
        deliveryTerms: data.deliveryTerms,
        validityText: data.validityText,
        paymentTerms: data.paymentTerms
      })

      setSpecialDiscount(Number(data.specialDiscount) || 0)
      const baseForTax = (data.subtotal || 0) - (data.specialDiscount || 0)
      if (baseForTax > 0 && data.taxAmount != null) {
        const inferredRate = data.taxAmount / baseForTax
        if (Number.isFinite(inferredRate)) setTaxRate(inferredRate)
      }
      setStampImage(data.stampImage || null)
      setEditEstimateNo(data.estimateNo || '')
      
      debugDateValue('[loadData] data.estimateDate', data.estimateDate)
      const sanitizedDate = sanitizeDateString(data.estimateDate)
      setEditEstimateDate(sanitizedDate || '')
      
      console.log('[ConfirmImportPage] EstimateNo and Date set:', {
        estimateNo: data.estimateNo,
        estimateDate: sanitizedDate
      })
      
      if (data.sections) {
        setSections(data.sections)
      }
      
      setDetails(data.details.map((d: any) => ({ ...d, product_id: null })))
      setSearchQueries(Array(data.details.length).fill(''))
      setDropdownOpen(Array(data.details.length).fill(false))
      setPageIndex(Array(data.details.length).fill(0))
      setIsSearching(Array(data.details.length).fill(false))

      console.log('[ConfirmImportPage] Details set, count:', data.details.length)

      const { data: staffs } = await supabase.from('staffs').select('*').order('name')
      setStaffList(staffs || [])

      const { data: products, error: prodErr } = await supabase.from('products').select('*').order('name')
      if (prodErr) {
        console.error('Product fetch error:', prodErr)
      }
      const productMaster = products || []
      setProductList(productMaster)
      setFilteredOptions(Array(data.details.length).fill(productMaster))
    } catch (err) {
      console.error('Load error:', err)
      alert('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleProductChange = (index: number, productId: string) => {
    setDetails((prev) =>
      prev.map((d, idx) => {
        if (idx === index) {
          const product = productList.find((p) => p.id === productId)
          return {
            ...d,
            product_id: productId || null,
            spec: product?.spec || d.spec,
            unit: product?.unit || d.unit,
            unit_price: product?.unit_price || d.unit_price,
            amount: d.quantity * (product?.unit_price || d.unit_price)
          }
        }
        return d
      })
    )
  }

  const performSearch = async (index: number, keyword: string) => {
    setIsSearching((prev) => prev.map((v, i) => (i === index ? true : v)))
    try {
      let query = supabase.from('products').select('*').order('name').limit(500)
      if (keyword.trim()) {
        query = query.ilike('name', `%${keyword.trim()}%`)
      }
      const { data, error } = await query
      if (error) {
        console.error('Search error:', error)
        return
      }
      setFilteredOptions((prev) => {
        const next = [...(prev || [])]
        next[index] = data || []
        return next
      })
      setPageIndex((prev) => prev.map((p, i) => (i === index ? 0 : p)))
    } catch (err) {
      console.error('Search exception:', err)
    } finally {
      setIsSearching((prev) => prev.map((v, i) => (i === index ? false : v)))
    }
  }

  const handleQueryChange = (index: number, value: string) => {
    setSearchQueries((prev) => prev.map((q, i) => (i === index ? value : q)))
  }

  const handleSearchClick = (index: number) => {
    const keyword = searchQueries[index] || ''
    performSearch(index, keyword)
  }

  const toggleDropdown = (index: number, open: boolean) => {
    setDropdownOpen((prev) => prev.map((v, i) => (i === index ? open : v)))
    if (open) {
      setPageIndex((prev) => prev.map((p, i) => (i === index ? 0 : p)))
    }
  }

  const handleDeleteRow = (index: number) => {
    if (confirm(`${index + 1}行目「${details[index].item_name}」を削除しますか？`)) {
      setDetails((prev) => prev.filter((_, idx) => idx !== index))
      setSearchQueries((prev) => prev.filter((_, idx) => idx !== index))
      setFilteredOptions((prev) => prev.filter((_, idx) => idx !== index))
      setDropdownOpen((prev) => prev.filter((_, idx) => idx !== index))
      setPageIndex((prev) => prev.filter((_, idx) => idx !== index))
      setIsSearching((prev) => prev.filter((_, idx) => idx !== index))
    }
  }

  const handleSave = async () => {
    if (!selectedStaffId) {
      alert('担当者を選択してください')
      return
    }

    setSaving(true)
    try {
      const staffIdNum = Number(selectedStaffId)
      if (!Number.isFinite(staffIdNum)) {
        throw new Error('担当者IDの形式が不正です')
      }

      const subtotal = details.reduce((sum, d) => sum + d.amount, 0)
      const discountedSubtotal = Math.max(0, subtotal - specialDiscount)
      const taxAmount = Math.round(discountedSubtotal * taxRate)
      const totalAmount = discountedSubtotal + taxAmount
      const grossProfitTotal = details.reduce((sum, d) => sum + (d.amount - (d.cost_amount || 0)), 0)
      const grossMargin = totalAmount > 0 ? grossProfitTotal / totalAmount : null

      let customerId = importData.customerId
      
      if (!customerId) {
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({ name: editCustomerName || importData.customerName })
          .select('id')
          .single()
        
        if (custErr) throw custErr
        customerId = newCustomer.id
      }

      const generateCaseId = () => {
        const ts = Date.now().toString(16)
        const rnd = Math.random().toString(16).slice(2, 10)
        return (ts + rnd).slice(0, 16)
      }
      
      const case_id = generateCaseId()
      const todayStr = getTodayDateString()
      const created_date = getFirstValidDate(editEstimateDate, importData.estimateDate) || todayStr
      
      const { error: caseErr } = await supabase.from('cases').insert({
        case_id,
        staff_id: staffIdNum,
        case_no: (editEstimateNo || importData.estimateNo) || null,
        created_date,
        customer_id: customerId,
        subject: editSubject || importData.subject || null,
        special_discount: specialDiscount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        gross_profit: grossProfitTotal,
        gross_margin: grossMargin,
        status: '商談中',
        note: `Excel取込: ${importData.fileName}${(editEstimateNo || importData.estimateNo) ? ` / 見積番号: ${editEstimateNo || importData.estimateNo}` : ''}`,
        delivery_place: editDeliveryPlace || importData.deliveryPlace || null,
        delivery_deadline: editDeliveryDeadline || importData.deliveryDeadline || null,
        delivery_terms: editDeliveryTerms || importData.deliveryTerms || null,
        validity_text: editValidityText || importData.validityText || null,
        payment_terms: editPaymentTerms || importData.paymentTerms || null,
        layout_type: 'vertical',
        coreplus_no: null
      })

      if (caseErr) throw caseErr

      const detailRows = details.map((d) => {
        const combinedSpec = d.spec ? `${d.item_name}\n${d.spec}` : d.item_name
        
        return {
          case_id,
          staff_id: staffIdNum,
          product_id: d.product_id,
          unregistered_product: d.item_name,
          spec: combinedSpec,
          unit: d.unit || null,
          quantity: d.quantity,
          unit_price: d.unit_price,
          amount: d.amount,
          cost_unit_price: d.cost_price || null,
          cost_amount: d.cost_amount || null,
          gross_profit: d.cost_amount ? d.amount - d.cost_amount : null,
          temp_case_id: null,
          section: null,
          section_id: null,
          remarks: null,
          coreplus_no: null
        }
      })

      const { error: detailErr } = await supabase.from('case_details').insert(detailRows)
      if (detailErr) throw detailErr

      alert(`✅ 確定しました！\n案件ID: ${case_id}`)
      router.push('/cases/list')
    } catch (err: any) {
      console.error('Save error:', err)
      alert('❌ エラー: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    document.documentElement.style.colorScheme = 'dark'
    return () => {
      document.documentElement.style.colorScheme = ''
    }
  }, [])

  useEffect(() => {
    if (!importData) return
    const subtotal = details.length > 0
      ? details.reduce((sum, d) => sum + d.amount, 0)
      : importData.subtotal || 0
    const discountedSubtotal = Math.max(0, subtotal - specialDiscount)
    const taxAmount = Math.round(discountedSubtotal * taxRate)
    const totalAmount = discountedSubtotal + taxAmount
    setCalculatedTaxAmount(taxAmount)
    setCalculatedTotalAmount(totalAmount)
  }, [importData, details, specialDiscount, taxRate])

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>
  }

  if (!importData) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>データが見つかりません</div>
  }

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '20px auto', 
      padding: '20px', 
      fontFamily: 'system-ui',
      minHeight: '100vh'
    }}>
      <button
        onClick={onBack}
        style={{
          marginBottom: '20px',
          padding: '10px 16px',
          fontSize: '14px',
          backgroundColor: '#6c757d',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        ← 戻る
      </button>

      <h1 style={{ color: '#1a1a1a', marginBottom: '8px' }}>📋 Excel取込 - 確認・編集</h1>
      <p style={{ color: '#e65100', fontSize: '14px', fontWeight: 'bold', margin: '0 0 24px 0' }}>
        ⚠️ 以下の内容を確認し、担当者と商品を選択してから「確定」してください。
      </p>

      {/* 案件情報（全フィールド） */}
      <div style={{ 
        marginTop: '20px', 
        padding: '20px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '8px',
        border: '2px solid #2196f3'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#0d47a1', fontSize: '18px' }}>📄 案件情報</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>顧客名:</label>
            <input
              type="text"
              value={editCustomerName}
              onChange={(e) => setEditCustomerName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>件名:</label>
            <input
              type="text"
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>見積番号:</label>
            <input
              type="text"
              value={editEstimateNo}
              onChange={(e) => setEditEstimateNo(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>見積日:</label>
            <input
              type="date"
              value={editEstimateDate}
              onChange={(e) => setEditEstimateDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>受渡場所:</label>
            <input
              type="text"
              value={editDeliveryPlace}
              onChange={(e) => setEditDeliveryPlace(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>受渡期限:</label>
            <input
              type="text"
              value={editDeliveryDeadline}
              onChange={(e) => setEditDeliveryDeadline(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>受渡条件:</label>
            <input
              type="text"
              value={editDeliveryTerms}
              onChange={(e) => setEditDeliveryTerms(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>有効期限:</label>
            <input
              type="text"
              value={editValidityText}
              onChange={(e) => setEditValidityText(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: '#1565c0' }}>御支払条件:</label>
            <input
              type="text"
              value={editPaymentTerms}
              onChange={(e) => setEditPaymentTerms(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #1976d2',
                borderRadius: '4px',
                marginTop: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* 金額計算セクション */}
        <div style={{ 
          marginTop: '20px', 
          padding: '16px', 
          backgroundColor: '#fff9e6', 
          borderRadius: '6px',
          border: '2px solid #ffc107'
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#f57c00', fontSize: '16px' }}>💰 金額計算</h4>
          
          <div style={{ display: 'grid', gap: '12px' }}>
            {/* 小計（明細計） */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
              <span style={{ fontWeight: 'bold', color: '#424242' }}>小計（明細計）:</span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>
                ¥{details.reduce((sum, d) => sum + d.amount, 0).toLocaleString('ja-JP')}
              </span>
            </div>

            {/* 出精値引 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
              <label style={{ fontWeight: 'bold', color: '#424242' }}>出精値引:</label>
              <input
                type="number"
                value={specialDiscount}
                onChange={(e) => setSpecialDiscount(Number(e.target.value))}
                style={{
                  width: '200px',
                  padding: '6px',
                  border: '2px solid #ff9800',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  textAlign: 'right',
                  color: '#d32f2f'
                }}
              />
            </div>

            {/* 値引後小計 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
              <span style={{ fontWeight: 'bold', color: '#1565c0' }}>値引後小計:</span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>
                ¥{Math.max(0, details.reduce((sum, d) => sum + d.amount, 0) - specialDiscount).toLocaleString('ja-JP')}
              </span>
            </div>

            {/* 消費税率 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
              <label style={{ fontWeight: 'bold', color: '#424242' }}>消費税率:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  step="0.01"
                  value={taxRate * 100}
                  onChange={(e) => setTaxRate(Number(e.target.value) / 100)}
                  style={{
                    width: '80px',
                    padding: '6px',
                    border: '2px solid #4caf50',
                    borderRadius: '4px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    textAlign: 'right'
                  }}
                />
                <span style={{ fontWeight: 'bold' }}>%</span>
              </div>
            </div>

            {/* 消費税額 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
              <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>消費税:</span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#388e3c' }}>
                ¥{calculatedTaxAmount.toLocaleString('ja-JP')}
              </span>
            </div>

            {/* 合計 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#ffebee', borderRadius: '4px', border: '2px solid #f44336' }}>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#c62828' }}>合計:</span>
              <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#d32f2f' }}>
                ¥{calculatedTotalAmount.toLocaleString('ja-JP')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 明細テーブル */}
      <div style={{ 
        marginTop: '24px', 
        padding: '20px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '8px',
        border: '2px solid #757575'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#424242', fontSize: '18px' }}>📦 明細一覧</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'white' }}>
            <thead>
              <tr style={{ backgroundColor: '#424242', color: 'white' }}>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '40px' }}>No</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '140px' }}>品名</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '200px' }}>商品検索</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '120px' }}>規格</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '45px' }}>数量</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '55px' }}>単位</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '90px' }}>単価</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '100px' }}>金額</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '90px', backgroundColor: '#4caf50' }}>原価単価</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '100px', backgroundColor: '#81c784' }}>原価額</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '70px', backgroundColor: '#ffb74d' }}>粗利率</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', width: '60px' }}>削除</th>
              </tr>
            </thead>
            <tbody>
              {details.map((d, idx) => (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : '#ffffff' }}>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', color: '#000' }}>{idx + 1}</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', color: '#000' }}>
                    <input
                      type="text"
                      value={d.item_name}
                      onChange={(e) => {
                        const newDetails = [...details]
                        newDetails[idx].item_name = e.target.value
                        setDetails(newDetails)
                      }}
                      style={{ width: '100%', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', position: 'relative' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="text"
                        value={searchQueries[idx] || ''}
                        onChange={(e) => handleQueryChange(idx, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSearchClick(idx)
                          }
                        }}
                        placeholder="商品名で検索..."
                        style={{ flex: 1, padding: '4px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '11px' }}
                      />
                      <button
                        onClick={() => handleSearchClick(idx)}
                        disabled={isSearching[idx]}
                        style={{
                          padding: '4px 6px',
                          fontSize: '11px',
                          backgroundColor: isSearching[idx] ? '#ccc' : '#2196f3',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: isSearching[idx] ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isSearching[idx] ? '中' : '検索'}
                      </button>
                      {dropdownOpen[idx] && filteredOptions[idx]?.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: '8px',
                          right: '8px',
                          backgroundColor: 'white',
                          border: '2px solid #2196f3',
                          borderRadius: '4px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 1000,
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }}>
                          {filteredOptions[idx].slice(pageIndex[idx] * 50, (pageIndex[idx] + 1) * 50).map((prod) => (
                            <div
                              key={prod.id}
                              onClick={() => {
                                handleProductChange(idx, prod.id)
                                toggleDropdown(idx, false)
                              }}
                              style={{
                                padding: '6px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #eee',
                                fontSize: '11px',
                                color: '#000'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                              <div style={{ fontWeight: 'bold' }}>{prod.name}</div>
                              <div style={{ fontSize: '10px', color: '#666' }}>
                                規格: {prod.spec || 'なし'} | 単位: {prod.unit || 'なし'} | 単価: ¥{(prod.unit_price || 0).toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {filteredOptions[idx]?.length > 0 && (
                      <button
                        onClick={() => toggleDropdown(idx, !dropdownOpen[idx])}
                        style={{
                          marginTop: '4px',
                          padding: '2px 6px',
                          fontSize: '10px',
                          backgroundColor: dropdownOpen[idx] ? '#1976d2' : '#9e9e9e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          width: '100%'
                        }}
                      >
                        {dropdownOpen[idx] ? '閉じる' : `候補: ${filteredOptions[idx].length}件`}
                      </button>
                    )}
                    {d.product_id && (
                      <div style={{
                        marginTop: '4px',
                        padding: '4px',
                        backgroundColor: '#e8f5e9',
                        borderRadius: '3px',
                        fontSize: '10px',
                        color: '#2e7d32',
                        fontWeight: 'bold',
                        border: '1px solid #4caf50'
                      }}>
                        ✓ 適用: {productList.find(p => p.id === d.product_id)?.name || d.product_id}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', color: '#000' }}>
                    <input
                      type="text"
                      value={d.spec || ''}
                      onChange={(e) => {
                        const newDetails = [...details]
                        newDetails[idx].spec = e.target.value
                        setDetails(newDetails)
                      }}
                      style={{ width: '100%', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', color: '#000' }}>
                    <input
                      type="number"
                      value={d.quantity}
                      onChange={(e) => {
                        const newDetails = [...details]
                        const qty = Number(e.target.value)
                        newDetails[idx].quantity = qty
                        newDetails[idx].amount = qty * newDetails[idx].unit_price
                        setDetails(newDetails)
                      }}
                      style={{ width: '100%', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', color: '#000' }}>
                    <input
                      type="text"
                      value={d.unit || ''}
                      onChange={(e) => {
                        const newDetails = [...details]
                        newDetails[idx].unit = e.target.value
                        setDetails(newDetails)
                      }}
                      style={{ width: '100%', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right', color: '#000' }}>
                    <input
                      type="number"
                      value={d.unit_price}
                      onChange={(e) => {
                        const newDetails = [...details]
                        const price = Number(e.target.value)
                        newDetails[idx].unit_price = price
                        newDetails[idx].amount = newDetails[idx].quantity * price
                        setDetails(newDetails)
                      }}
                      style={{ width: '100px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold', color: '#000' }}>
                    ¥{d.amount.toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', backgroundColor: '#e8f5e9' }}>
                    <input
                      type="number"
                      value={d.cost_price || 0}
                      onChange={(e) => {
                        const newDetails = [...details]
                        newDetails[idx].cost_price = Number(e.target.value)
                        setDetails(newDetails)
                      }}
                      style={{ width: '100px', padding: '4px', border: '1px solid #4caf50', borderRadius: '3px', textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right', backgroundColor: '#c8e6c9', color: '#000' }}>
                    ¥{((d.cost_price || 0) * d.quantity).toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right', backgroundColor: '#ffe0b2', fontWeight: 'bold', color: '#000' }}>
                    {(() => {
                      const costAmount = (d.cost_price || 0) * d.quantity
                      if (costAmount === 0) return '-'
                      const grossProfitRate = Math.floor(((d.amount - costAmount) / d.amount) * 100)
                      return `${grossProfitRate}%`
                    })()}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                    <button
                      onClick={() => handleDeleteRow(idx)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '12px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold', color: '#1976d2' }}>
          小計: ¥{details.reduce((sum, d) => sum + d.amount, 0).toLocaleString('ja-JP')}
        </div>
      </div>

      {/* 担当者選択 */}
      <div style={{ 
        marginTop: '24px', 
        padding: '20px', 
        backgroundColor: '#fff3e0', 
        borderRadius: '8px',
        border: '3px solid #ff6f00'
      }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#e65100', fontSize: '18px' }}>
          👤 担当者選択 <span style={{ color: '#d32f2f' }}>*必須</span>
        </h3>
        <select
          value={selectedStaffId}
          onChange={(e) => setSelectedStaffId(e.target.value)}
          style={{
            padding: '12px',
            fontSize: '16px',
            borderRadius: '6px',
            border: '2px solid #ff6f00',
            width: '100%',
            maxWidth: '350px',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontWeight: 'bold'
          }}
        >
          <option value="">-- 担当者を選択 --</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* 確定ボタン */}
      <div style={{ marginTop: '40px', textAlign: 'center', paddingBottom: '40px' }}>
        <button
          onClick={handleSave}
          disabled={saving || !selectedStaffId}
          style={{
            padding: '16px 48px',
            fontSize: '20px',
            fontWeight: 'bold',
            backgroundColor: saving || !selectedStaffId ? '#bdbdbd' : '#2e7d32',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: saving || !selectedStaffId ? 'not-allowed' : 'pointer',
            marginRight: '16px'
          }}
        >
          {saving ? '🔄 登録中...' : '✅ 確定してDBに登録'}
        </button>
        <button
          onClick={onBack}
          style={{
            padding: '16px 48px',
            fontSize: '20px',
            fontWeight: 'bold',
            backgroundColor: '#757575',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          ⬅️ キャンセル
        </button>
      </div>
    </div>
  )
}
