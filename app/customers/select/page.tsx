'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'

type Customer = {
  id: string
  name: string
}

export default function CustomerSelectPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const router = useRouter()

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

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(keyword.toLowerCase())
  )

  const handleSelect = (c: Customer) => {
    router.push(`/customers/${c.id}`)
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>顧客マスタ検索</h1>
        <Link href="/selectors">
          <button className="btn-3d btn-reset" style={{ padding: '8px 16px' }}>
            ← メニューに戻る
          </button>
        </Link>
      </div>

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
        <p style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>
          該当する顧客がいません
        </p>
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
