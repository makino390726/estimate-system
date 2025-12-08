'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'

type Product = {
  id: string
  name: string
  unit: string | null
  cost_price: number | null
}

type FormData = {
  id: string
  name: string
  unit: string
  cost_price: string
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    id: '',
    name: '',
    unit: '',
    cost_price: '',
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    // ★ より安全な全件取得方法
    try {
      let allProducts: Product[] = []
      let page = 0
      const pageSize = 1000

      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name')
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (error) {
          throw error
        }

        if (!data || data.length === 0) {
          break
        }

        allProducts.push(...(data as Product[]))

        if (data.length < pageSize) {
          break
        }

        page++
      }

      console.log(`取得完了: 全${allProducts.length}件`)
      setProducts(allProducts)
    } catch (error) {
      console.error('商品取得エラー:', error)
      alert('商品取得エラーが発生しました')
    }
  }

  // ★ 改善された曖昧検索（全角・半角対応、複数文字対応）
  const filteredProducts = products.filter((p) => {
    const productName = p.name.toLowerCase()
    const searchKeyword = keyword.toLowerCase()
    
    // 空白削除版でも検索
    const productNameNoSpace = productName.replace(/\s+/g, '')
    const searchKeywordNoSpace = searchKeyword.replace(/\s+/g, '')
    
    return productName.includes(searchKeyword) || productNameNoSpace.includes(searchKeywordNoSpace)
  })

  const handleNew = () => {
    setEditingId(null)
    setFormData({
      id: '',
      name: '',
      unit: '',
      cost_price: '',
    })
    setShowForm(true)
  }

  const handleEdit = (product: Product) => {
    setEditingId(product.id)
    setFormData({
      id: product.id,
      name: product.name,
      unit: product.unit || '',
      cost_price: product.cost_price?.toString() || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData({
      id: '',
      name: '',
      unit: '',
      cost_price: '',
    })
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('商品名を入力してください')
      return
    }

    const costPrice = formData.cost_price ? parseInt(formData.cost_price) : null

    try {
      if (editingId) {
        // 更新
        const { error } = await supabase
          .from('products')
          .update({
            name: formData.name,
            unit: formData.unit || null,
            cost_price: costPrice,
          })
          .eq('id', editingId)

        if (error) {
          throw error
        }
        alert('商品を更新しました')
      } else {
        // 新規登録
        if (!formData.id.trim()) {
          alert('商品IDを入力してください')
          return
        }

        const { error } = await supabase
          .from('products')
          .insert({
            id: formData.id,
            name: formData.name,
            unit: formData.unit || null,
            cost_price: costPrice,
          })

        if (error) {
          throw error
        }
        alert('商品を登録しました')
      }

      setShowForm(false)
      setEditingId(null)
      setKeyword('')
      fetchProducts()
    } catch (error: any) {
      console.error('保存エラー:', error)
      alert(`保存エラー: ${error.message}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この商品を削除してもよろしいですか？')) {
      return
    }

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) {
        throw error
      }
      alert('商品を削除しました')
      fetchProducts()
    } catch (error: any) {
      console.error('削除エラー:', error)
      alert(`削除エラー: ${error.message}`)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>商品マスタ</h1>
        <Link href="/selectors">
          <button className="btn-3d btn-reset" style={{ padding: '8px 16px' }}>
            ← メニューに戻る
          </button>
        </Link>
      </div>

      {!showForm && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="商品名で検索（全件対象・曖昧検索）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
              style={{ flex: 1, maxWidth: 400 }}
              className="input-inset"
            />
            <button onClick={handleNew} className="btn-3d btn-primary">
              ➕ 新規登録
            </button>
          </div>

          {keyword && (
            <div style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>
              「<strong>{keyword}</strong>」で検索：<strong>{filteredProducts.length}</strong>件
              {filteredProducts.length === 0 && (
                <span style={{ marginLeft: 16, color: '#d32f2f' }}>
                  ヒント: 登録されている商品名を確認してください
                </span>
              )}
            </div>
          )}

          {filteredProducts.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>商品名</th>
                  <th style={thStyle}>単位</th>
                  <th style={thStyle}>原価</th>
                  <th style={{ ...thStyle, width: 120, textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id}>
                    <td style={tdStyle}>{p.id}</td>
                    <td style={tdStyle}>
                      {keyword ? (
                        <>
                          {(() => {
                            const idx = p.name.toLowerCase().indexOf(keyword.toLowerCase())
                            return (
                              <>
                                {p.name.substring(0, idx)}
                                <mark style={{ backgroundColor: '#ffff99' }}>
                                  {p.name.substring(idx, idx + keyword.length)}
                                </mark>
                                {p.name.substring(idx + keyword.length)}
                              </>
                            )
                          })()}
                        </>
                      ) : (
                        p.name
                      )}
                    </td>
                    <td style={tdStyle}>{p.unit || '-'}</td>
                    <td style={tdStyle}>
                      {p.cost_price != null ? p.cost_price.toLocaleString() : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => handleEdit(p)}
                        className="btn-3d"
                        style={{ padding: '4px 8px', marginRight: 4, fontSize: 12 }}
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="btn-3d btn-reset"
                        style={{ padding: '4px 8px', fontSize: 12 }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : keyword ? (
            <p style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>
              「<strong>{keyword}</strong>」に該当する商品がありません
            </p>
          ) : (
            <p style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>
              全<strong>{products.length}</strong>件の商品があります
            </p>
          )}
        </>
      )}

      {showForm && (
        <div style={{ backgroundColor: '#f9f9f9', padding: 20, borderRadius: 8, maxWidth: 600 }}>
          <h2 style={{ marginTop: 0 }}>{editingId ? '商品編集' : '商品新規登録'}</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              商品ID {!editingId && <span style={{ color: 'red' }}>*</span>}
            </label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              disabled={!!editingId}
              className="input-inset"
              style={{ width: '100%', opacity: editingId ? 0.6 : 1 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              商品名 <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-inset"
              style={{ width: '100%' }}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>単位</label>
            <input
              type="text"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="例：本、枚、組など"
              className="input-inset"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>原価</label>
            <input
              type="number"
              value={formData.cost_price}
              onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
              placeholder="0"
              className="input-inset"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={handleCancel} className="btn-3d btn-reset">
              キャンセル
            </button>
            <button onClick={handleSave} className="btn-3d btn-primary">
              {editingId ? '更新' : '登録'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '8px 12px',
  backgroundColor: '#f5f5f5',
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '8px 12px',
}

