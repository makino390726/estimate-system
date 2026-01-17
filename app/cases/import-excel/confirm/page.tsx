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

export default function ConfirmImportPage() {
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
  
  // 修正可能なフィールド
  const [editCustomerName, setEditCustomerName] = useState<string>('')
  const [editSubject, setEditSubject] = useState<string>('')
  const [editDeliveryPlace, setEditDeliveryPlace] = useState<string>('')
  const [editDeliveryDeadline, setEditDeliveryDeadline] = useState<string>('')
  const [editDeliveryTerms, setEditDeliveryTerms] = useState<string>('')
  const [editValidityText, setEditValidityText] = useState<string>('')
  const [editPaymentTerms, setEditPaymentTerms] = useState<string>('')
  const pageSize = 20

  // 明細数変化時に補助状態を同期、および初回ロード時に商品名を検索欄にセット
  useEffect(() => {
    setSearchQueries((prev) => {
      const next = Array(details.length).fill('')
      for (let i = 0; i < details.length; i++) {
        // 既に検索欄に値があればそれを保持、なければ商品名（item_name）をセット
        next[i] = prev[i] || details[i].item_name || ''
      }
      return next
    })
    setFilteredOptions((prev) => {
      const base = productList || []
      const next: Product[][] = Array(details.length)
      for (let i = 0; i < details.length; i++) next[i] = prev?.[i] && prev[i].length > 0 ? prev[i] : base
      return next
    })
    setDropdownOpen((prev) => {
      const next = Array(details.length).fill(false)
      for (let i = 0; i < Math.min(prev.length, details.length); i++) next[i] = prev[i]
      return next
    })
    setPageIndex((prev) => {
      const next = Array(details.length).fill(0)
      for (let i = 0; i < Math.min(prev.length, details.length); i++) next[i] = prev[i]
      return next
    })
    setIsSearching((prev) => {
      const next = Array(details.length).fill(false)
      for (let i = 0; i < Math.min(prev.length, details.length); i++) next[i] = prev[i]
      return next
    })
  }, [details.length, productList])

  // 出精値引きと消費税率に基づいて消費税と合計を計算
  useEffect(() => {
    if (!importData) return

    // 明細変更にも追従するよう、明細合計を優先
    const subtotal = details.length > 0
      ? details.reduce((sum, d) => sum + d.amount, 0)
      : importData.subtotal || 0

    const discountedSubtotal = Math.max(0, subtotal - specialDiscount)
    const taxAmount = Math.round(discountedSubtotal * taxRate)
    const totalAmount = discountedSubtotal + taxAmount
    
    setCalculatedTaxAmount(taxAmount)
    setCalculatedTotalAmount(totalAmount)
  }, [importData, details, specialDiscount, taxRate])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // sessionStorageから解析データ取得
      const dataStr = sessionStorage.getItem('excel_import_data')
      if (!dataStr) {
        alert('データが見つかりません。最初からやり直してください。')
        router.push('/cases/import-excel')
        return
      }

      const data = JSON.parse(dataStr)
      
      setImportData(data)
      
      // 修正可能なフィールドの初期値設定
      setEditCustomerName(data.customerName || '')
      setEditSubject(data.subject || '')
      setEditDeliveryPlace(data.deliveryPlace || '')
      setEditDeliveryDeadline(data.deliveryDeadline || '')
      setEditDeliveryTerms(data.deliveryTerms || '')
      setEditValidityText(data.validityText || '')
      setEditPaymentTerms(data.paymentTerms || '')
      
      console.log('[ConfirmPage] Imported data:', {
        subtotal: data.subtotal,
        specialDiscount: data.specialDiscount,
        taxAmount: data.taxAmount,
        totalAmount: data.totalAmount,
        sections: data.sections,
        details: data.details?.slice(0, 3) // 最初の3件を表示
      })
      setSpecialDiscount(Number(data.specialDiscount) || 0)
      // Excel側の消費税から税率を推定して初期反映
      const baseForTax = (data.subtotal || 0) - (data.specialDiscount || 0)
      if (baseForTax > 0 && data.taxAmount != null) {
        const inferredRate = data.taxAmount / baseForTax
        if (Number.isFinite(inferredRate)) setTaxRate(inferredRate)
      }
      setStampImage(data.stampImage || null)
      
      // ★API側で複数セル値が連結されている場合、それを反映
      setEditEstimateNo(data.estimateNo || '')
      
      // 日付のサニタイズとバリデーション
      debugDateValue('[loadData] data.estimateDate', data.estimateDate)
      const sanitizedDate = sanitizeDateString(data.estimateDate)
      setEditEstimateDate(sanitizedDate || '')
      
      // セクション定義を設定
      if (data.sections) {
        setSections(data.sections)
        console.log('[ConfirmPage] Sections:', data.sections)
      }
      
      // 明細に product_id フィールドを追加
      setDetails(data.details.map((d: any) => ({ ...d, product_id: null })))
      setSearchQueries(Array(data.details.length).fill(''))
      setDropdownOpen(Array(data.details.length).fill(false))
      setPageIndex(Array(data.details.length).fill(0))
      setIsSearching(Array(data.details.length).fill(false))

      // 担当者リスト
      const { data: staffs } = await supabase.from('staffs').select('*').order('name')
      setStaffList(staffs || [])

      // 商品マスタ
      const { data: products, error: prodErr } = await supabase.from('products').select('*').order('name')
      if (prodErr) {
        console.error('Product fetch error:', prodErr)
        alert('商品マスタの取得に失敗しました')
      }
      const productMaster = products || []
      setProductList(productMaster)
      setFilteredOptions(Array(data.details.length).fill(productMaster))
      if ((productMaster?.length || 0) === 0) {
        console.warn('商品マスタ件数0件')
      }
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

  const updateFilter = (index: number, keyword: string) => {
    // サーバー側検索を非同期で実行
    performSearch(index, keyword)
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
    // Enter キー以外は自動検索しない
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
      // 数値IDに正規化（staffs.id が数値のため）
      const staffIdNum = Number(selectedStaffId)
      if (!Number.isFinite(staffIdNum)) {
        throw new Error('担当者IDの形式が不正です')
      }

      // 金額系をフロントで確定計算（ケースに書き込む）
      const subtotal = details.reduce((sum, d) => sum + d.amount, 0)
      const discountedSubtotal = Math.max(0, subtotal - specialDiscount)
      const taxAmount = Math.round(discountedSubtotal * taxRate)
      const totalAmount = discountedSubtotal + taxAmount
      const grossProfitTotal = details.reduce((sum, d) => sum + (d.amount - (d.cost_amount || 0)), 0)
      const grossMargin = totalAmount > 0 ? grossProfitTotal / totalAmount : null
      // ★★★ 商品マスタ検索は各明細行の「商品マスタ」欄で手動実施 ★★★

      // ★★★ 顧客を確保（新規 or 既存） ★★★
      let customerId = importData.customerId
      
      if (!customerId) {
        // 新規顧客を作成
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({ name: editCustomerName || importData.customerName })
          .select('id')
          .single()
        
        if (custErr) throw custErr
        customerId = newCustomer.id
      }

      // ★★★ case_id生成 ★★★
      const generateCaseId = () => {
        const ts = Date.now().toString(16)
        const rnd = Math.random().toString(16).slice(2, 10)
        return (ts + rnd).slice(0, 16)
      }
      
      const case_id = generateCaseId()
      const todayStr = getTodayDateString()
      
      // 日付のサニタイズ（複数候補から最初の有効な値を使用）
      debugDateValue('[handleSave] editEstimateDate', editEstimateDate)
      debugDateValue('[handleSave] importData.estimateDate', importData.estimateDate)
      
      const created_date = getFirstValidDate(editEstimateDate, importData.estimateDate) || todayStr
      
      console.log('[handleSave] created_date resolved to:', created_date)

      // ★★★ cases テーブルに登録 ★★★
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
        // 取扱状況を新規作成と同様に「商談中」で登録
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

      // ★★★ case_details テーブルに登録 ★★★
      const detailRows = details.map((d) => {
        // 商品名を規格に含める（商品名 + 規格の形式）
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

      // sessionStorageクリア
      sessionStorage.removeItem('excel_import_data')

      alert(`✅ 確定しました！\n案件ID: ${case_id}`)
      router.push('/cases/list')
    } catch (err: any) {
      console.error('Save error:', err)
      alert('❌ エラー: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

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
      backgroundColor: '#ffffff',
      minHeight: '100vh'
    }}>
      <button
        onClick={() => router.push('/selectors')}
        style={{
          marginBottom: '20px',
          padding: '10px 16px',
          fontSize: '14px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        ← メニューに戻る
      </button>

      <h1 style={{ color: '#1a1a1a', marginBottom: '8px' }}>📋 Excel取込 - 確認・編集</h1>
      <p style={{ color: '#e65100', fontSize: '14px', fontWeight: 'bold', margin: '0 0 24px 0' }}>
        ⚠️ 以下の内容を確認し、担当者と商品を選択してから「確定」してください。確定するとDBに登録されます。
      </p>

      {/* 案件情報 */}
      <div style={{ 
        marginTop: '20px', 
        padding: '20px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '8px',
        border: '2px solid #2196f3'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#0d47a1', fontSize: '18px' }}>📄 案件情報</h3>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', width: '150px', color: '#1565c0' }}>顧客名:</td>
              <td style={{ padding: '10px', fontSize: '16px' }}>
                <input
                  type="text"
                  value={editCustomerName}
                  onChange={(e) => setEditCustomerName(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '8px',
                    border: '2px solid #1976d2',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    boxSizing: 'border-box'
                  }}
                />
                {importData.customerStatus === 'new' && (
                  <div style={{ 
                    marginTop: '8px',
                    color: '#ffffff',
                    backgroundColor: '#ff6f00',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    width: 'fit-content'
                  }}>
                    ⚠️ 新規顧客（確定時に作成）
                  </div>
                )}
                {importData.customerStatus === 'existing' && (
                  <div style={{ 
                    marginTop: '8px',
                    color: '#ffffff',
                    backgroundColor: '#2e7d32',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    width: 'fit-content'
                  }}>
                    ✓ 既存顧客
                  </div>
                )}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>件名:</td>
              <td style={{ padding: '10px' }}>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '8px',
                    border: '2px solid #1976d2',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="件名を入力"
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>見積番号:</td>
              <td style={{ padding: '10px', color: '#424242' }}>
                <input
                  type="text"
                  value={editEstimateNo}
                  onChange={(e) => setEditEstimateNo(e.target.value)}
                  placeholder="例: 第 R8-SO 001 号"
                  style={{ padding: '8px', border: '2px solid #1976d2', borderRadius: 4, width: '260px', fontWeight: 'bold' }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>見積日:</td>
              <td style={{ padding: '10px', color: '#424242' }}>
                <input
                  type="date"
                  value={editEstimateDate || ''}
                  onChange={(e) => setEditEstimateDate(e.target.value)}
                  style={{ padding: '8px', border: '2px solid #1976d2', borderRadius: 4, fontWeight: 'bold' }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>納入場所:</td>
              <td style={{ padding: '10px' }}>
                <input
                  type="text"
                  value={editDeliveryPlace}
                  onChange={(e) => setEditDeliveryPlace(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '8px',
                    border: '2px solid #1976d2',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="納入場所を入力"
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>納期:</td>
              <td style={{ padding: '10px' }}>
                <input
                  type="text"
                  value={editDeliveryDeadline}
                  onChange={(e) => setEditDeliveryDeadline(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '8px',
                    border: '2px solid #1976d2',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="納期を入力"
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>有効期限:</td>
              <td style={{ padding: '10px' }}>
                <input
                  type="text"
                  value={editValidityText}
                  onChange={(e) => setEditValidityText(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '8px',
                    border: '2px solid #1976d2',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="有効期限を入力"
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>支払条件:</td>
              <td style={{ padding: '10px' }}>
                <input
                  type="text"
                  value={editPaymentTerms}
                  onChange={(e) => setEditPaymentTerms(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '8px',
                    border: '2px solid #1976d2',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="支払条件を入力"
                />
              </td>
            </tr>
            <tr style={{ backgroundColor: '#e3f2fd' }}>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>小計:</td>
              <td style={{ padding: '10px', color: '#424242', fontSize: '15px' }}>
                ¥{(importData.subtotal || 0).toLocaleString('ja-JP')}
              </td>
            </tr>
            <tr style={{ backgroundColor: '#fff3e0' }}>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#e65100' }}>出精値引き:</td>
              <td style={{ padding: '10px', fontSize: '15px' }}>
                <input
                  type="number"
                  value={specialDiscount}
                  onChange={(e) => setSpecialDiscount(Math.max(0, Number(e.target.value) || 0))}
                  style={{
                    padding: '8px',
                    fontSize: '15px',
                    border: '2px solid #e65100',
                    borderRadius: '4px',
                    width: '150px',
                    textAlign: 'right',
                    fontWeight: 'bold',
                    color: '#e65100'
                  }}
                />
                <span style={{ marginLeft: '10px', color: '#e65100', fontWeight: 'bold' }}>円</span>
              </td>
            </tr>
            <tr style={{ backgroundColor: '#f3e5f5' }}>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#7b1fa2' }}>値引後小計:</td>
              <td style={{ padding: '10px', color: '#7b1fa2', fontSize: '15px', fontWeight: 'bold' }}>
                ¥{((importData.subtotal || 0) - specialDiscount).toLocaleString('ja-JP')}
              </td>
            </tr>
            <tr style={{ backgroundColor: '#e3f2fd' }}>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>消費税率:</td>
              <td style={{ padding: '10px', fontSize: '15px' }}>
                <input
                  type="number"
                  value={taxRate * 100}
                  onChange={(e) => setTaxRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)}
                  style={{
                    padding: '8px',
                    fontSize: '15px',
                    border: '2px solid #1565c0',
                    borderRadius: '4px',
                    width: '80px',
                    textAlign: 'right',
                    fontWeight: 'bold',
                    color: '#1565c0'
                  }}
                  step="0.1"
                  min="0"
                  max="100"
                />
                <span style={{ marginLeft: '10px', color: '#1565c0', fontWeight: 'bold' }}>%</span>
              </td>
            </tr>
            <tr style={{ backgroundColor: '#e3f2fd' }}>
              <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>消費税 ({(taxRate * 100).toFixed(1)}%):</td>
              <td style={{ padding: '10px', color: '#424242', fontSize: '15px', fontWeight: 'bold' }}>
                ¥{calculatedTaxAmount.toLocaleString('ja-JP')}
              </td>
            </tr>
            <tr style={{ backgroundColor: '#bbdefb' }}>
              <td style={{ padding: '12px', fontWeight: 'bold', color: '#0d47a1', fontSize: '16px' }}>合計金額:</td>
              <td style={{ padding: '12px', fontSize: '24px', fontWeight: 'bold', color: '#d32f2f' }}>
                ¥{calculatedTotalAmount.toLocaleString('ja-JP')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* セクション一覧表示 */}
      {sections.length > 0 && (
        <div style={{ 
          marginTop: '30px', 
          padding: '20px', 
          border: '2px solid #1976d2',
          borderRadius: '8px',
          backgroundColor: '#e3f2fd'
        }}>
          <h3 style={{ color: '#0d47a1', marginBottom: '15px', fontSize: '16px', fontWeight: 'bold' }}>
            📋 セクション一覧（{sections.length}件）
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#1976d2', color: '#fff' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: 'bold', width: '60px' }}>順番</th>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: 'bold' }}>セクション名</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', width: '150px' }}>金額</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', width: '150px' }}>卸価格</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <tr key={sec.order} style={{ borderBottom: '1px solid #90caf9', backgroundColor: '#f5f5f5' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0' }}>{sec.order}</td>
                  <td style={{ padding: '10px', color: '#424242' }}>{sec.name}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#1565c0', fontWeight: 'bold' }}>
                    ¥{sec.amount.toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#388e3c', fontWeight: 'bold' }}>
                    {sec.wholesaleAmount ? `¥${sec.wholesaleAmount.toLocaleString('ja-JP')}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 担当者選択 */}
      <div style={{ 
        marginTop: '24px', 
        padding: '20px', 
        backgroundColor: '#fff3e0', 
        borderRadius: '8px',
        border: '3px solid #ff6f00',
        display: 'flex',
        gap: '20px',
        alignItems: 'flex-start'
      }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#e65100', fontSize: '18px' }}>
            👤 担当者選択 <span style={{ color: '#d32f2f', fontSize: '16px' }}>*必須</span>
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
              color: '#212121',
              fontWeight: 'bold',
              cursor: 'pointer'
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
        {stampImage && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <label style={{ fontSize: '14px', color: '#e65100', fontWeight: 'bold' }}>印章プレビュー</label>
            <img
              src={stampImage}
              alt="取込Excel印章"
              style={{
                maxWidth: '120px',
                maxHeight: '120px',
                border: '2px solid #ff6f00',
                borderRadius: '6px',
                padding: '4px',
                backgroundColor: '#ffffff'
              }}
            />
          </div>
        )}
      </div>

      {/* 明細一覧 */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ color: '#1a1a1a', fontSize: '20px' }}>📦 明細一覧（{details.length}件）</h3>
        <p style={{ fontSize: '14px', color: '#d84315', fontWeight: 'bold', margin: '8px 0 16px 0' }}>
          ⚠️ 商品マスタと照合して、該当する商品を選択してください。未登録の場合は「未登録」のままにしてください。
        </p>
        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              border: '2px solid #1976d2',
              backgroundColor: '#ffffff'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#1976d2', borderBottom: '3px solid #0d47a1' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ffffff', fontWeight: 'bold', width: '50px' }}>No.</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ffffff', fontWeight: 'bold', width: '120px' }}>セクション</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ffffff', fontWeight: 'bold', width: '180px' }}>Excel品名</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ffffff', fontWeight: 'bold', width: '140px' }}>規格</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ffffff', fontWeight: 'bold', width: '320px' }}>商品マスタ</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold', width: '70px' }}>数量</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ffffff', fontWeight: 'bold', width: '70px' }}>単位</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold', width: '90px' }}>単価</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold', width: '100px' }}>金額</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold', backgroundColor: '#388e3c', width: '100px' }}>原価単価</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold', backgroundColor: '#388e3c', width: '110px' }}>原価額</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ffffff', fontWeight: 'bold', backgroundColor: '#388e3c', width: '90px' }}>粗利率</th>
                <th style={{ padding: '12px', textAlign: 'center', color: '#ffffff', fontWeight: 'bold', width: '70px' }}>削除</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, idx) => (
                <tr key={idx} style={{ 
                  borderBottom: '1px solid #e0e0e0',
                  backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f5f5f5'
                }}>
                  <td style={{ padding: '10px', color: '#424242', fontWeight: 'bold', width: '50px' }}>{idx + 1}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#e65100', width: '120px', backgroundColor: '#fff3e0' }}>
                    {detail.section_name || '-'}
                  </td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#1565c0', width: '180px' }}>{detail.item_name}</td>
                  <td style={{ padding: '10px', fontSize: '13px', color: '#616161', width: '140px' }}>{detail.spec || '-'}</td>
                  <td style={{ padding: '10px', minWidth: '320px', width: '320px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={searchQueries[idx] || ''}
                          onChange={(e) => handleQueryChange(idx, e.target.value)}
                          placeholder="商品名で検索"
                          style={{
                            flex: 1,
                            padding: '10px',
                            border: '2px solid #0d47a1',
                            borderRadius: '4px',
                            fontSize: '13px',
                            backgroundColor: '#e3f2fd',
                            color: '#0d47a1',
                            fontWeight: 'bold'
                          }}
                          onFocus={() => toggleDropdown(idx, true)}
                        />
                        <button
                          type="button"
                          onClick={() => handleSearchClick(idx)}
                          disabled={isSearching[idx]}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: isSearching[idx] ? '#90caf9' : '#1976d2',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isSearching[idx] ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            fontWeight: 'bold'
                          }}
                        >
                          {isSearching[idx] ? '検索中...' : '検索'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleDropdown(idx, !dropdownOpen[idx])}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: dropdownOpen[idx] ? '#1565c0' : '#9e9e9e',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 'bold'
                          }}
                        >
                          {dropdownOpen[idx] ? '閉じる' : '表示'}
                        </button>
                      </div>

                      <div style={{ fontSize: '12px', color: '#0d47a1', fontWeight: 'bold' }}>
                        {isSearching[idx] ? '検索中...' : `候補: ${(filteredOptions[idx] || []).length}件`}
                      </div>

                      {dropdownOpen[idx] && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100px',
                            left: 0,
                            right: 0,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            border: '2px solid #0d47a1',
                            borderRadius: '6px',
                            backgroundColor: '#0d47a1',
                            zIndex: 10,
                            boxShadow: '0 6px 12px rgba(0,0,0,0.2)'
                          }}
                        >
                          <div
                            onClick={() => {
                              handleProductChange(idx, '')
                              toggleDropdown(idx, false)
                            }}
                            style={{
                              padding: '10px',
                              cursor: 'pointer',
                              color: '#fff',
                              fontWeight: 'bold',
                              borderBottom: '1px solid rgba(255,255,255,0.2)',
                              backgroundColor: !detail.product_id ? 'rgba(255,255,255,0.15)' : 'transparent'
                            }}
                          >
                            未登録（クリア）
                          </div>
                          {(filteredOptions[idx] || []).length > 0 ? (
                            (filteredOptions[idx] || []).map((p) => (
                              <div
                                key={p.id}
                                onClick={() => {
                                  handleProductChange(idx, p.id)
                                  toggleDropdown(idx, false)
                                }}
                                style={{
                                  padding: '10px',
                                  cursor: 'pointer',
                                  color: '#e3f2fd',
                                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                                  backgroundColor: detail.product_id === p.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                                  transition: 'background-color 0.2s'
                                }}
                              >
                                <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                                <div style={{ fontSize: '12px', opacity: 0.85 }}>{p.spec || '規格なし'}</div>
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: '10px', color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>
                              {isSearching[idx] ? '検索中...' : '検索結果なし'}
                            </div>
                          )}
                        </div>
                      )}

                      <input
                        type="text"
                        value={detail.product_id || '未登録'}
                        readOnly
                        style={{
                          padding: '8px',
                          border: '2px solid #1976d2',
                          borderRadius: '4px',
                          fontSize: '13px',
                          backgroundColor: '#ffffff',
                          color: '#212121',
                          fontWeight: 'bold'
                        }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#212121', fontWeight: 'bold', width: '70px' }}>{detail.quantity}</td>
                  <td style={{ padding: '10px', color: '#424242', width: '70px' }}>{detail.unit || '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#1565c0', fontWeight: 'bold', width: '90px' }}>
                    ¥{detail.unit_price.toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#c62828', fontSize: '15px', width: '100px' }}>
                    ¥{detail.amount.toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#2e7d32', fontWeight: 'bold', backgroundColor: '#e8f5e9', width: '100px' }}>
                    {detail.cost_price != null ? `¥${detail.cost_price.toLocaleString('ja-JP')}` : '-'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#2e7d32', fontWeight: 'bold', backgroundColor: '#e8f5e9', width: '110px' }}>
                    {detail.cost_amount != null ? `¥${detail.cost_amount.toLocaleString('ja-JP')}` : '-'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#2e7d32', fontWeight: 'bold', backgroundColor: '#e8f5e9', width: '90px' }}>
                    {detail.gross_margin != null ? `${(detail.gross_margin * 100).toFixed(1)}%` : '-'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', width: '70px' }}>
                    <button
                      onClick={() => handleDeleteRow(idx)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        backgroundColor: '#d32f2f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                      title="この行を削除"
                    >
                      🗑️ 削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#1976d2', fontWeight: 'bold', borderTop: '3px solid #0d47a1' }}>
                <td colSpan={8} style={{ padding: '14px', textAlign: 'right', color: '#ffffff', fontSize: '16px', fontWeight: 'bold' }}>
                  合計:
                </td>
                <td style={{ padding: '14px', textAlign: 'right', fontSize: '18px', fontWeight: 'bold', color: '#ffeb3b' }}>
                  ¥{details.reduce((sum, d) => sum + d.amount, 0).toLocaleString('ja-JP')}
                                </td>
                                <td colSpan={2} style={{ padding: '14px', textAlign: 'right', backgroundColor: '#2e7d32', color: '#ffffff', fontSize: '14px' }}>
                                  原価計: ¥{details.reduce((sum, d) => sum + (d.cost_amount || 0), 0).toLocaleString('ja-JP')}
                                </td>
                                <td style={{ padding: '14px', textAlign: 'right', backgroundColor: '#2e7d32', color: '#ffeb3b', fontSize: '16px', fontWeight: 'bold' }}>
                                  粗利: ¥{(details.reduce((sum, d) => sum + d.amount, 0) - details.reduce((sum, d) => sum + (d.cost_amount || 0), 0)).toLocaleString('ja-JP')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
            marginRight: '16px',
            boxShadow: saving || !selectedStaffId ? 'none' : '0 4px 8px rgba(46,125,50,0.3)'
          }}
        >
          {saving ? '🔄 登録中...' : '✅ 確定してDBに登録'}
        </button>
        <button
          onClick={() => router.back()}
          style={{
            padding: '16px 48px',
            fontSize: '20px',
            fontWeight: 'bold',
            backgroundColor: '#757575',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 8px rgba(117,117,117,0.3)'
          }}
        >
          ⬅️ キャンセル
        </button>
      </div>
    </div>
  )
}
