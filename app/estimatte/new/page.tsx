// app/estimates/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';

// ★ ユニークIDを生成する関数を追加
function generateCaseId(): string {
  const timestamp = Date.now().toString(16);
  const randomPart = Math.random().toString(16).substring(2, 10);
  return `${timestamp}${randomPart}`.substring(0, 16);
}

type Product = {
  id: string
  name: string
  spec: string
  unit: string
  unit_price: number
  cost_unit_price: number
}

type Customer = {
  id: string
  name: string
  address: string
  tel: string
}

type Staff = {
  id: number
  name: string
  department: string
}

type Section = {
  id: number
  name: string
}

type Row = {
  product_id: string
  product_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  cost_unit_price: number
  amount: number
  cost_amount: number
  gross_profit: number
  section_id: number | null  // ★ セクションIDに変更
}

export default function EstimateNewPage() {
  const router = useRouter()

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const [subject, setSubject] = useState('')
  const [rows, setRows] = useState<Row[]>([])

  // ★ 様式とセクション
  const [layoutType, setLayoutType] = useState<'vertical' | 'horizontal'>('vertical')
  const [sections, setSections] = useState<Section[]>([])
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')

  // 商品選択モーダル
  const [showProductModal, setShowProductModal] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [productSearchName, setProductSearchName] = useState('')
  const [productSearchSpec, setProductSearchSpec] = useState('')

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name')

    if (error) {
      console.error('商品取得エラー:', error)
    } else {
      setProducts(data || [])
    }
  }

  const handleProductSearch = async () => {
    let query = supabase.from('products').select('*')

    if (productSearchName) {
      query = query.ilike('name', `%${productSearchName}%`)
    }
    if (productSearchSpec) {
      query = query.ilike('spec', `%${productSearchSpec}%`)
    }

    const { data, error } = await query.order('name')

    if (error) {
      console.error('商品検索エラー:', error)
    } else {
      setProducts(data || [])
    }
  }

  const handleSelectProduct = (product: Product) => {
    const newRow: Row = {
      product_id: product.id,
      product_name: product.name,
      spec: product.spec,
      unit: product.unit,
      quantity: 1,
      unit_price: product.unit_price,
      cost_unit_price: product.cost_unit_price,
      amount: product.unit_price,
      cost_amount: product.cost_unit_price,
      gross_profit: product.unit_price - product.cost_unit_price,
      section_id: null,  // ★ 初期値はnull
    }
    setRows([...rows, newRow])
    setShowProductModal(false)
  }

  const handleQuantityChange = (index: number, quantity: number) => {
    const newRows = [...rows]
    newRows[index].quantity = quantity
    newRows[index].amount = quantity * newRows[index].unit_price
    newRows[index].cost_amount = quantity * newRows[index].cost_unit_price
    newRows[index].gross_profit = newRows[index].amount - newRows[index].cost_amount
    setRows(newRows)
  }

  const handleUnitPriceChange = (index: number, unitPrice: number) => {
    const newRows = [...rows]
    newRows[index].unit_price = unitPrice
    newRows[index].amount = newRows[index].quantity * unitPrice
    newRows[index].gross_profit = newRows[index].amount - newRows[index].cost_amount
    setRows(newRows)
  }

  const handleDeleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index))
  }

  // ★ セクション追加
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

  // ★ セクション削除
  const handleDeleteSection = (id: number) => {
    // このセクションを使用している明細があるかチェック
    const usedInRows = rows.some(row => row.section_id === id)
    
    if (usedInRows) {
      alert('このセクションは明細で使用されているため削除できません')
      return
    }

    setSections(sections.filter(s => s.id !== id))
  }

  const handleSave = async () => {
    if (!selectedCustomer || !selectedStaff) {
      alert('顧客と担当者を選択してください')
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

    // ★ 横様式の場合、全ての明細にセクションが設定されているかチェック
    if (layoutType === 'horizontal') {
      const noSectionRows = rows.filter(row => row.section_id === null)
      if (noSectionRows.length > 0) {
        alert('横様式の場合、全ての明細にセクションを設定してください')
        return
      }
    }

    try {
      const newCaseId = generateCaseId()
      console.log('生成されたcase_id:', newCaseId)

      // ★ casesテーブルに挿入（layout_typeを追加）
      const { data: insertedCase, error: caseError } = await supabase
        .from('cases')
        .insert({
          case_id: newCaseId,
          case_no: null,
          subject: subject,
          created_date: new Date().toISOString().split('T')[0],
          customer_id: selectedCustomer.id,
          staff_id: selectedStaff.id,
          status: 'draft',
          layout_type: layoutType,  // ★ 様式を保存
          approve_staff: null,
          approve_manager: null,
          approve_director: null,
          approve_president: null,
        })
        .select()
        .single()

      if (caseError) {
        console.error('案件登録エラー:', caseError)
        throw new Error(`案件登録エラー: ${caseError.message}`)
      }

      console.log('登録された案件:', insertedCase)

      // ★ 横様式の場合、セクション情報も保存
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
          console.error('セクション登録エラー:', sectionError)
          await supabase.from('cases').delete().eq('case_id', newCaseId)
          throw new Error(`セクション登録エラー: ${sectionError.message}`)
        }
      }

      // ★ case_detailsテーブルに明細を挿入（section_idを追加）
      const detailsToInsert = rows.map((row) => ({
        case_id: newCaseId,
        product_id: row.product_id,
        product_name: row.product_name,
        spec: row.spec,
        unit: row.unit,
        quantity: row.quantity,
        unit_price: row.unit_price,
        cost_unit_price: row.cost_unit_price,
        amount: row.amount,
        cost_amount: row.cost_amount,
        gross_profit: row.gross_profit,
        section_id: row.section_id,  // ★ セクションIDを保存
      }))

      const { error: detailsError } = await supabase
        .from('case_details')
        .insert(detailsToInsert)

      if (detailsError) {
        console.error('明細登録エラー:', detailsError)
        await supabase.from('cases').delete().eq('case_id', newCaseId)
        if (layoutType === 'horizontal') {
          await supabase.from('case_sections').delete().eq('case_id', newCaseId)
        }
        throw new Error(`明細登録エラー: ${detailsError.message}`)
      }

      console.log('明細登録成功:', detailsToInsert.length, '件')

      alert('見積書を保存しました')
      router.push(`/cases/approval/${newCaseId}`)

    } catch (error) {
      console.error('保存エラー:', error)
      alert(`保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
  }

  const subtotal = rows.reduce((sum, r) => sum + r.amount, 0)
  const totalCostAmount = rows.reduce((sum, r) => sum + r.cost_amount, 0)
  const totalGrossProfit = rows.reduce((sum, r) => sum + r.gross_profit, 0)
  const grossProfitRate = subtotal > 0 ? (totalGrossProfit / subtotal) * 100 : 0

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <h1>見積書作成</h1>

      {/* ★ 様式選択 */}
      <div style={{ marginBottom: 16, padding: 16, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#f8f9fa' }}>
        <label style={{ fontWeight: 'bold', marginBottom: 8, display: 'block' }}>様式選択:</label>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              name="layoutType"
              value="vertical"
              checked={layoutType === 'vertical'}
              onChange={() => {
                setLayoutType('vertical')
                setSections([])  // セクションをクリア
              }}
            />
            縦様式（セクションなし）
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              name="layoutType"
              value="horizontal"
              checked={layoutType === 'horizontal'}
              onChange={() => {
                setLayoutType('horizontal')
                setShowSectionModal(true)  // セクション設定モーダルを開く
              }}
            />
            横様式（セクションあり）
          </label>
          
          {layoutType === 'horizontal' && (
            <button
              onClick={() => setShowSectionModal(true)}
              className="btn-3d"
              style={{ fontSize: 11, backgroundColor: '#6c757d', color: '#fff' }}
            >
              セクション設定
            </button>
          )}
        </div>

        {/* ★ 現在のセクション一覧表示 */}
        {layoutType === 'horizontal' && sections.length > 0 && (
          <div style={{ marginTop: 12, padding: 8, backgroundColor: '#fff', borderRadius: 4 }}>
            <strong>登録済みセクション:</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {sections.map((section) => (
                <span
                  key={section.id}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#e9ecef',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                >
                  {section.id}. {section.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 顧客・担当者選択 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label>顧客:</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              type="text"
              value={selectedCustomer?.name || ''}
              readOnly
              className="input-inset"
              style={{ flex: 1 }}
              placeholder="顧客を選択してください"
            />
            <Link href="/customers/select">
              <button className="btn-3d btn-search">顧客選択</button>
            </Link>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <label>担当者:</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              type="text"
              value={selectedStaff?.name || ''}
              readOnly
              className="input-inset"
              style={{ flex: 1 }}
              placeholder="担当者を選択してください"
            />
            <Link href="/staffs">
              <button className="btn-3d btn-search">担当者選択</button>
            </Link>
          </div>
        </div>
      </div>

      {/* 件名 */}
      <div style={{ marginBottom: 16 }}>
        <label>件名:</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="input-inset"
          style={{ width: '100%', marginTop: 4 }}
          placeholder="例: ○○工事見積"
        />
      </div>

      {/* 明細テーブル */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>明細</h2>
          <button
            onClick={() => setShowProductModal(true)}
            className="btn-3d btn-primary"
          >
            + 商品追加
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {layoutType === 'horizontal' && <th style={thStyle}>セクション</th>}
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
            {rows.map((row, index) => (
              <tr key={index}>
                {layoutType === 'horizontal' && (
                  <td style={tdStyle}>
                    {/* ★ セクション選択（セレクトボックス） */}
                    <select
                      value={row.section_id || ''}
                      onChange={(e) => {
                        const newRows = [...rows]
                        newRows[index].section_id = e.target.value ? Number(e.target.value) : null
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
                <td style={tdStyle}>{row.product_name}</td>
                <td style={tdStyle}>{row.spec}</td>
                <td style={tdStyle}>{row.unit}</td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => handleQuantityChange(index, Number(e.target.value))}
                    className="input-inset"
                    style={{ width: 80 }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={row.unit_price}
                    onChange={(e) => handleUnitPriceChange(index, Number(e.target.value))}
                    className="input-inset"
                    style={{ width: 100 }}
                  />
                </td>
                <td style={tdStyle}>{row.amount.toLocaleString()}</td>
                <td style={tdStyle}>{row.cost_amount.toLocaleString()}</td>
                <td style={tdStyle}>{row.gross_profit.toLocaleString()}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleDeleteRow(index)}
                    className="btn-3d"
                    style={{ backgroundColor: '#dc3545', color: '#fff', fontSize: 11 }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 合計 */}
      <div style={{ marginLeft: 'auto', maxWidth: 360, marginBottom: 24 }}>
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
      </div>

      {/* 保存ボタン */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
        <Link href="/selectors">
          <button className="btn-3d btn-reset">キャンセル</button>
        </Link>
        <button onClick={handleSave} className="btn-3d btn-primary">
          保存
        </button>
      </div>

      {/* ★ セクション設定モーダル */}
      {showSectionModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2>セクション設定</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label>セクション名:</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddSection()}
                  className="input-inset"
                  style={{ flex: 1 }}
                  placeholder="例: 仮設工事"
                />
                <button onClick={handleAddSection} className="btn-3d btn-primary">
                  追加
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <strong>登録済みセクション:</strong>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
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
                          style={{ backgroundColor: '#dc3545', color: '#fff', fontSize: 11 }}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sections.length === 0 && (
                <p style={{ color: '#999', textAlign: 'center', marginTop: 16 }}>
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

      {/* 商品選択モーダル */}
      {showProductModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2>商品選択</h2>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                placeholder="商品名で検索"
                value={productSearchName}
                onChange={(e) => setProductSearchName(e.target.value)}
                className="input-inset"
                style={{ flex: 1 }}
              />
              <input
                type="text"
                placeholder="規格で検索"
                value={productSearchSpec}
                onChange={(e) => setProductSearchSpec(e.target.value)}
                className="input-inset"
                style={{ flex: 1 }}
              />
              <button onClick={handleProductSearch} className="btn-3d btn-search">
                検索
              </button>
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
                      <td style={tdStyle}>{product.spec}</td>
                      <td style={tdStyle}>{product.unit}</td>
                      <td style={tdStyle}>{product.unit_price.toLocaleString()}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleSelectProduct(product)}
                          className="btn-3d btn-primary"
                          style={{ fontSize: 11 }}
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
                onClick={() => setShowProductModal(false)}
                className="btn-3d btn-reset"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// スタイル
const thStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '8px 12px',
  backgroundColor: '#f5f5f5',
  textAlign: 'left',
  fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '8px 12px',
  fontSize: 12,
};

const sumRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 8px',
  borderBottom: '1px solid #eee',
  fontSize: 12,
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  padding: 24,
  borderRadius: 8,
  maxWidth: 800,
  width: '90%',
  maxHeight: '80vh',
  overflow: 'auto',
};
