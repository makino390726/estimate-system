'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type CaseRow = {
  case_id: string
  case_no: string | number | null
  subject: string
  created_date: string
  status: string
  customer_id: string | null
  staff_id: string | null
}

type StaffRow = { id: string; name: string }
type CustomerRow = { id: string; name: string }

type CaseView = CaseRow & {
  customer_name: string
  staff_name: string
}

export default function ApprovalRequestListPage() {
  const [cases, setCases] = useState<CaseView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    void fetchCases()
  }, [])

  const fetchCases = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: casesData, error: casesError } = await supabase
        .from('cases')
        .select('case_id, case_no, subject, created_date, status, customer_id, staff_id')
        .order('created_date', { ascending: false })

      if (casesError) throw casesError

      const staffIds = (casesData || []).map(c => c.staff_id).filter(Boolean) as string[]
      const customerIds = (casesData || []).map(c => c.customer_id).filter(Boolean) as string[]

      let staffMap: Record<string, string> = {}
      let customerMap: Record<string, string> = {}

      if (staffIds.length > 0) {
        const { data: staffData, error: staffError } = await supabase
          .from('staffs')
          .select('id, name')
          .in('id', staffIds)

        if (staffError) throw staffError
        ;(staffData || []).forEach((s: StaffRow) => {
          staffMap[s.id] = s.name
        })
      }

      if (customerIds.length > 0) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', customerIds)

        if (customerError) throw customerError
        ;(customerData || []).forEach((c: CustomerRow) => {
          customerMap[c.id] = c.name
        })
      }

      const viewRows: CaseView[] = (casesData || []).map(c => ({
        ...c,
        staff_name: c.staff_id ? (staffMap[c.staff_id] || '') : '',
        customer_name: c.customer_id ? (customerMap[c.customer_id] || '') : '',
      }))

      setCases(viewRows)
    } catch (err: any) {
      console.error('承認依頼一覧取得エラー:', err)
      setError(err?.message || '承認依頼一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const filtered = cases.filter(c => {
    if (!keyword) return true
    const k = keyword.toLowerCase()
    return (
      (c.case_no ?? '').toString().toLowerCase().includes(k) ||
      (c.subject ?? '').toLowerCase().includes(k) ||
      (c.customer_name ?? '').toLowerCase().includes(k) ||
      (c.staff_name ?? '').toLowerCase().includes(k)
    )
  })

  const containerStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    minHeight: '100vh',
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '20px',
    border: '1px solid #334155',
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#cbd5e1',
    fontSize: 12,
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid #334155',
    fontSize: 13,
    color: '#e2e8f0',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '6px 10px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'none',
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#93c5fd' }}>承認依頼一覧</h1>
        <button
          onClick={() => (window.location.href = '/selectors')}
          style={{ padding: '8px 14px', borderRadius: 6, background: '#475569', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          メニューへ戻る
        </button>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="案件番号・件名・顧客・担当者で検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#e2e8f0',
            }}
          />
          <button
            onClick={fetchCases}
            style={{ padding: '10px 14px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            再読み込み
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        {error && (
          <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '10px 12px', borderRadius: 6, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 20 }}>読み込み中...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>案件No</th>
                  <th style={thStyle}>件名</th>
                  <th style={thStyle}>顧客名</th>
                  <th style={thStyle}>担当者</th>
                  <th style={thStyle}>作成日</th>
                  <th style={thStyle}>ステータス</th>
                  <th style={thStyle}>承認</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.case_id}>
                    <td style={tdStyle}>{c.case_no ?? '-'}</td>
                    <td style={tdStyle}>{c.subject || '-'}</td>
                    <td style={tdStyle}>{c.customer_name || '-'}</td>
                    <td style={tdStyle}>{c.staff_name || '-'}</td>
                    <td style={tdStyle}>{c.created_date || '-'}</td>
                    <td style={tdStyle}>{c.status || '-'}</td>
                    <td style={tdStyle}>
                      <Link href={`/cases/approval/${c.case_id}`} style={buttonStyle}>
                        承認画面へ
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td style={{ ...tdStyle, textAlign: 'center' }} colSpan={7}>
                      該当する案件がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
