'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'
import {
  COLLECTION_CASE_STATUSES,
  calcCollectionDue,
  normalizeCustomerName,
  type CustomerCollectionTerms,
} from '@/lib/collectionSchedule'

type CaseRow = {
  case_id: string
  case_no: string | number | null
  subject: string
  created_date: string
  status: string
  customer_name: string
  staff_name: string
  amount: number
}

type ViewRow = CaseRow & {
  dueMonth: string
  dueMonthLabel: string
  dueDate: string
  termsLabel: string
  unmatched: boolean
}

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function fetchAllCustomersTerms(): Promise<CustomerCollectionTerms[]> {
  const pageSize = 1000
  const out: CustomerCollectionTerms[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('customers')
      .select('name, customer_code, close_day, collect_cycle, collect_cycle_name, collect_day, collect_term_name')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data || []) as CustomerCollectionTerms[]
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

export default function CaseCollectionsPage() {
  const [rows, setRows] = useState<ViewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(currentMonthKey)
  const [onlyMonth, setOnlyMonth] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: casesData, error: casesError } = await supabase
        .from('cases_with_names')
        .select('case_id, case_no, subject, created_date, status, customer_name, staff_name')
        .in('status', [...COLLECTION_CASE_STATUSES])
        .order('created_date', { ascending: false })
      if (casesError) throw casesError

      const caseIds = (casesData || []).map((c) => c.case_id)
      const amountMap = new Map<string, number>()
      for (let i = 0; i < caseIds.length; i += 200) {
        const chunk = caseIds.slice(i, i + 200)
        const { data: amounts, error: amountError } = await supabase
          .from('cases')
          .select('case_id, total_amount')
          .in('case_id', chunk)
        if (amountError) throw amountError
        for (const row of amounts || []) {
          amountMap.set(String(row.case_id), Number(row.total_amount || 0))
        }
      }

      const customers = await fetchAllCustomersTerms()
      const byName = new Map<string, CustomerCollectionTerms>()
      for (const c of customers) {
        const key = normalizeCustomerName(c.name)
        if (key) byName.set(key, c)
      }

      const next: ViewRow[] = (casesData || []).map((c) => {
        const name = String(c.customer_name || '')
        const terms = byName.get(normalizeCustomerName(name))
        const due = terms ? calcCollectionDue(c.created_date, terms) : null
        return {
          case_id: c.case_id,
          case_no: c.case_no,
          subject: c.subject,
          created_date: String(c.created_date || '').slice(0, 10),
          status: c.status,
          customer_name: name || '不明',
          staff_name: c.staff_name || '不明',
          amount: amountMap.get(String(c.case_id)) || 0,
          dueMonth: due?.dueMonth || '',
          dueMonthLabel: due?.dueMonthLabel || '未設定',
          dueDate: due?.dueDate || '',
          termsLabel: terms
            ? `締${terms.close_day ?? '—'} / ${terms.collect_cycle_name || `${terms.collect_cycle ?? '—'}ヶ月`} / 回収${terms.collect_day ?? '—'}${terms.collect_term_name ? ` / ${terms.collect_term_name}` : ''}`
            : '得意先マスタ未取込',
          unmatched: !due,
        }
      })
      setRows(next)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(
        /close_day|customer_code|schema cache|does not exist/i.test(message)
          ? '顧客マスタに回収条件列がありません。Supabase で add_customer_collection_terms.sql を実行し、顧客マスタから得意先マスタを取り込んでください。'
          : message,
      )
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const visible = useMemo(
    () => (onlyMonth ? rows.filter((r) => r.dueMonth === month) : rows),
    [rows, onlyMonth, month],
  )
  const monthTotal = visible.reduce((s, r) => s + r.amount, 0)
  const unmatchedCount = rows.filter((r) => r.unmatched).length

  return (
    <div style={{ padding: 24, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#fff' }}>入金予定（回収予定月・予定額）</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/customers/select">
            <button className="btn-3d" style={{ padding: '8px 14px', backgroundColor: '#2563eb', color: '#fff' }}>
              得意先マスタ取込
            </button>
          </Link>
          <Link href="/cases/list">
            <button className="btn-3d btn-search" style={{ padding: '8px 14px' }}>
              案件一覧
            </button>
          </Link>
          <Link href="/selectors">
            <button className="btn-3d" style={{ padding: '8px 14px', backgroundColor: '#16a34a', color: '#fff' }}>
              メニューへ戻る
            </button>
          </Link>
        </div>
      </div>

      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 0 }}>
        対象は成約（受注）と完了です。締日・回収サイクル・回収日は得意先マスタの予定日1を使います。99は月末です。成約日が無いため作成日を起算にします。
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label>
          回収予定月{' '}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input-inset"
            style={{ padding: '6px 10px' }}
          />
        </label>
        <label style={{ color: '#cbd5e1' }}>
          <input type="checkbox" checked={onlyMonth} onChange={(e) => setOnlyMonth(e.target.checked)} /> この月だけ
        </label>
        <strong>
          {visible.length} 件 / {monthTotal.toLocaleString('ja-JP')} 円
        </strong>
        {unmatchedCount > 0 && (
          <span style={{ color: '#fbbf24' }}>回収条件なし {unmatchedCount} 件</span>
        )}
      </div>

      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
      {loading && <p style={{ color: '#94a3b8' }}>読み込み中…</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['回収予定月', '回収予定日', '回収予定額', '作成日', '顧客名', '件名', 'ステータス', '担当', '回収条件'].map((h) => (
              <th key={h} style={thStyle}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.case_id}>
              <td style={tdStyle}>{r.dueMonthLabel}</td>
              <td style={tdStyle}>{r.dueDate || '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{r.amount.toLocaleString('ja-JP')}</td>
              <td style={tdStyle}>{r.created_date}</td>
              <td style={tdStyle}>{r.customer_name}</td>
              <td style={tdStyle}>{r.subject}</td>
              <td style={tdStyle}>{r.status}</td>
              <td style={tdStyle}>{r.staff_name}</td>
              <td style={{ ...tdStyle, color: r.unmatched ? '#fbbf24' : '#cbd5e1', fontSize: 12 }}>{r.termsLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && visible.length === 0 && (
        <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: 24 }}>該当する入金予定がありません</p>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '8px 10px',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '8px 10px',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
}
