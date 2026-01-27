'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Detail = {
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  product_id: string | null
  comment?: string  // コメント機能
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

export default function ConfirmImportPage() {
  const router = useRouter()
  const [importData, setImportData] = useState<any>(null)
  const [details, setDetails] = useState<Detail[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [productList, setProductList] = useState<Product[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [commentRowIndex, setCommentRowIndex] = useState<number | null>(null)
  const [commentText, setCommentText] = useState<string>('')

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

      // 明細に product_id と comment フィールドを追加
      setDetails(data.details.map((d: any) => ({ ...d, product_id: null, comment: '' })))

      // 担当者リスト
      const { data: staffs } = await supabase.from('staffs').select('*').order('name')
      setStaffList(staffs || [])

      // 商品マスタ
      const { data: products } = await supabase.from('products').select('*').order('name')
      setProductList(products || [])
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

  const handleOpenCommentModal = (index: number) => {
    setCommentRowIndex(index)
    setCommentText(details[index].comment || '')
    setShowCommentModal(true)
  }

  const handleSaveComment = () => {
    if (commentRowIndex === null) return
    const newDetails = [...details]
    newDetails[commentRowIndex].comment = commentText
    setDetails(newDetails)
    setShowCommentModal(false)
    setCommentRowIndex(null)
    setCommentText('')
  }

  const handleDeleteComment = () => {
    if (commentRowIndex === null) return
    const newDetails = [...details]
    newDetails[commentRowIndex].comment = ''
    setDetails(newDetails)
    setShowCommentModal(false)
    setCommentRowIndex(null)
    setCommentText('')
  }

  const handleSave = async () => {
    if (!selectedStaffId) {
      alert('担当者を選択してください')
      return
    }

    setSaving(true)
    try {
      // ★★★ 顧客を確保（新規 or 既存） ★★★
      let customerId = importData.customerId

      if (!customerId) {
        // 新規顧客を作成
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({ name: importData.customerName })
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
      const now = new Date()
      const created_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`

      // ★★★ cases テーブルに登録 ★★★
      const { error: caseErr } = await supabase.from('cases').insert({
        case_id,
        staff_id: selectedStaffId,
        case_no: null,
        created_date,
        customer_id: customerId,
        subject: importData.subject || null,
        special_discount: 0,
        tax_amount: importData.taxAmount,
        total_amount: importData.totalAmount,
        gross_profit: null,
        gross_margin: null,
        status: '商談中',
        note: `Excel取込: ${importData.fileName}`,
        delivery_place: importData.deliveryPlace || null,
        delivery_deadline: importData.deliveryDeadline || null,
        delivery_terms: importData.deliveryTerms || null,
        validity_text: importData.validityText || null,
        payment_terms: importData.paymentTerms || null,
        layout_type: 'vertical',
        coreplus_no: null
      })

      if (caseErr) throw caseErr

      // ★★★ case_details テーブルに登録 ★★★
      const detailRows = details.map((d) => ({
        case_id,
        staff_id: selectedStaffId,
        product_id: d.product_id,
        unregistered_product: d.item_name,
        spec: d.spec || null,
        unit: d.unit || null,
        quantity: d.quantity,
        unit_price: d.unit_price,
        amount: d.amount,
        cost_unit_price: null,
        cost_amount: null,
        gross_profit: null,
        temp_case_id: null,
        section: null,
        section_id: null,
        remarks: null,
        coreplus_no: null,
        comment: d.comment || null  // コメントフィールドを追加
      }))

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
    <div style={{ maxWidth: '1200px', margin: '20px auto', padding: '20px', fontFamily: 'system-ui' }}>
      <h1>📋 Excel取込 - 確認・編集</h1>
      <p style={{ color: '#666', fontSize: '14px' }}>
        ⚠️ 以下の内容を確認し、担当者と商品を選択してから「確定」してください。確定するとDBに登録されます。
      </p>

      {/* 案件情報 */}
      <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 12px 0' }}>📄 案件情報</h3>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px', fontWeight: 'bold', width: '150px' }}>顧客名:</td>
              <td style={{ padding: '8px' }}>
                {importData.customerName}
                {importData.customerStatus === 'new' && (
                  <span style={{ marginLeft: '8px', color: 'orange', fontSize: '12px' }}>
                    ⚠️ 新規顧客（確定時に作成）
                  </span>
                )}
                {importData.customerStatus === 'existing' && (
                  <span style={{ marginLeft: '8px', color: 'green', fontSize: '12px' }}>
                    ✓ 既存顧客
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>件名:</td>
              <td style={{ padding: '8px' }}>{importData.subject || '（未設定）'}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>納入場所:</td>
              <td style={{ padding: '8px' }}>{importData.deliveryPlace || '-'}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>納期:</td>
              <td style={{ padding: '8px' }}>{importData.deliveryDeadline || '-'}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>有効期限:</td>
              <td style={{ padding: '8px' }}>{importData.validityText || '-'}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>支払条件:</td>
              <td style={{ padding: '8px' }}>{importData.paymentTerms || '-'}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>合計金額:</td>
              <td style={{ padding: '8px', fontSize: '18px', fontWeight: 'bold', color: '#0070f3' }}>
                ¥{(importData.totalAmount || 0).toLocaleString('ja-JP')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 担当者選択 */}
      <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#fffaeb', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 12px 0' }}>👤 担当者選択 <span style={{ color: 'red' }}>*必須</span></h3>
        <select
          value={selectedStaffId}
          onChange={(e) => setSelectedStaffId(e.target.value)}
          style={{
            padding: '10px',
            fontSize: '16px',
            borderRadius: '4px',
            border: '2px solid #ffa000',
            width: '300px'
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

      {/* 明細一覧 */}
      <div style={{ marginTop: '20px' }}>
        <h3>📦 明細一覧（{details.length}件）</h3>
        <p style={{ fontSize: '14px', color: '#666' }}>
          ⚠️ 商品マスタと照合して、該当する商品を選択してください。未登録の場合は「未登録」のままにしてください。
        </p>
        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              border: '1px solid #ddd'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #ccc' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>No.</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Excel品名</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>規格</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>商品マスタ</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>数量</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>単位</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>単価</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>金額</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>コメント</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{idx + 1}</td>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{detail.item_name}</td>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#666' }}>{detail.spec || '-'}</td>
                  <td style={{ padding: '8px' }}>
                    <select
                      value={detail.product_id || ''}
                      onChange={(e) => handleProductChange(idx, e.target.value)}
                      style={{
                        padding: '6px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        width: '100%',
                        maxWidth: '250px'
                      }}
                    >
                      <option value="">-- 未登録 --</option>
                      {productList
                        .filter((p) =>
                          p.name.toLowerCase().includes(detail.item_name.toLowerCase()) ||
                          detail.item_name.toLowerCase().includes(p.name.toLowerCase())
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.spec ? `(${p.spec})` : ''}
                          </option>
                        ))}
                      <optgroup label="全商品">
                        {productList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.spec ? `(${p.spec})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{detail.quantity}</td>
                  <td style={{ padding: '8px' }}>{detail.unit || '-'}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    ¥{detail.unit_price.toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                    ¥{detail.amount.toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleOpenCommentModal(idx)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        backgroundColor: detail.comment ? '#4CAF50' : '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {detail.comment ? '💬 編集' : '💬 追加'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f9f9f9', fontWeight: 'bold', borderTop: '2px solid #333' }}>
                <td colSpan={8} style={{ padding: '12px', textAlign: 'right' }}>
                  合計:
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '16px' }}>
                  ¥{details.reduce((sum, d) => sum + d.amount, 0).toLocaleString('ja-JP')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 確定ボタン */}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving || !selectedStaffId}
          style={{
            padding: '14px 40px',
            fontSize: '18px',
            fontWeight: 'bold',
            backgroundColor: saving || !selectedStaffId ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: saving || !selectedStaffId ? 'not-allowed' : 'pointer',
            marginRight: '12px'
          }}
        >
          {saving ? '登録中...' : '✅ 確定してDBに登録'}
        </button>
        <button
          onClick={() => router.back()}
          style={{
            padding: '14px 40px',
            fontSize: '18px',
            fontWeight: 'bold',
            backgroundColor: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          キャンセル
        </button>
      </div>

      {/* コメント入力モーダル */}
      {showCommentModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
          onClick={() => {
            setShowCommentModal(false)
            setCommentRowIndex(null)
            setCommentText('')
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>💬 コメント入力</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="コメントを入力してください..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                fontSize: '14px',
                border: '2px solid #ddd',
                borderRadius: '4px',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <div>
                <button
                  onClick={handleDeleteComment}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  🗑️ 削除
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    setShowCommentModal(false)
                    setCommentRowIndex(null)
                    setCommentText('')
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    backgroundColor: '#666',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveComment}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  ✅ 保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
