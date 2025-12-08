'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'

type Customer = {
  id: string
  name: string
}

function CustomerSelectContent() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name')

    if (error) {
      console.error('顧客取得エラー:', error)
    } else {
      setCustomers((data || []) as Customer[])
    }
  }

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert('顧客名を入力してください')
      return
    }

    const newId = crypto.randomUUID()

    const { data, error } = await supabase
      .from('customers')
      .insert([{ 
        id: newId,
        name: newCustomerName.trim() 
      }])
      .select()
      .single()

    if (error) {
      console.error('顧客登録エラー:', error)
      alert('顧客の登録に失敗しました')
    } else {
      alert('顧客を登録しました')
      setNewCustomerName('')
      setShowNewCustomerForm(false)
      fetchCustomers()
      
      if (returnTo && data) {
        router.push(`${returnTo}?customerId=${data.id}&customerName=${encodeURIComponent(data.name)}`)
      }
    }
  }

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(keyword.toLowerCase())
  )

  const handleSelect = (c: Customer) => {
    if (returnTo) {
      router.push(`${returnTo}?customerId=${c.id}&customerName=${encodeURIComponent(c.name)}`)
    } else {
      router.push(`/customers/${c.id}`)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>顧客マスタ検索</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
            className="btn-3d"
            style={{ backgroundColor: '#28a745', color: '#fff', padding: '8px 16px' }}
          >
            + 新規登録
          </button>
          <Link href={returnTo || "/selectors"}>
            <button className="btn-3d btn-reset" style={{ padding: '8px 16px' }}>
              ← {returnTo ? '戻る' : 'メニューに戻る'}
            </button>
          </Link>
        </div>
      </div>

      {showNewCustomerForm && (
        <div style={{ marginBottom: 16, padding: 16, border: '2px solid #28a745', borderRadius: 8, backgroundColor: '#f0f9f4' }}>
          <h3 style={{ marginTop: 0 }}>新規顧客登録</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="顧客名を入力"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateCustomer()}
              className="input-inset"
              style={{ flex: 1 }}
            />
            <button
              onClick={handleCreateCustomer}
              className="btn-3d"
              style={{ backgroundColor: '#28a745', color: '#fff' }}
            >
              登録
            </button>
            <button
              onClick={() => {
                setShowNewCustomerForm(false)
                setNewCustomerName('')
              }}
              className="btn-3d btn-reset"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="顧客名で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: '100%', maxWidth: 400 }}
          className="input-inset"
        />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>ID</th>
            <th style={thStyle}>顧客名</th>
            <th style={thStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {filteredCustomers.map((c) => (
            <tr key={c.id}>
              <td style={tdStyle}>{c.id}</td>
              <td style={tdStyle}>{c.name}</td>
              <td style={tdStyle}>
                <button
                  onClick={() => handleSelect(c)}
                  className="btn-3d btn-search"
                  style={{ fontSize: 11, padding: '4px 12px' }}
                >
                  選択
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredCustomers.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <p style={{ color: '#999' }}>該当する顧客がいません</p>
          <button
            onClick={() => setShowNewCustomerForm(true)}
            className="btn-3d"
            style={{ backgroundColor: '#28a745', color: '#fff' }}
          >
            新規顧客を登録
          </button>
        </div>
      )}
    </div>
  )
}

// ★ Suspense でラップ
export default function CustomerSelectPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中...</div>}>
      <CustomerSelectContent />
    </Suspense>
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
