'use client'

import { useState, useEffect, Suspense, useRef } from 'react' // ★ useRef 追加
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'

type Customer = {
  id: string
  name: string
  furigana?: string | null
  postal_code?: string | null
  address1?: string | null
  address2?: string | null
  tel?: string | null
  fax?: string | null
  email?: string | null
  note?: string | null
}

const emptyForm: Customer = {
  id: '',
  name: '',
  furigana: '',
  postal_code: '',
  address1: '',
  address2: '',
  tel: '',
  fax: '',
  email: '',
  note: '',
}

function CustomerSelectContent() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const [formData, setFormData] = useState<Customer>(emptyForm)
  const [isEdit, setIsEdit] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const formRef = useRef<HTMLDivElement | null>(null) // ★ 追加
  const pageSize = 1000

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async (page: number = 0) => {
    const start = page * pageSize
    const end = start + pageSize - 1

    const { data, error, count } = await supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('name')
      .range(start, end)

    if (error) {
      console.error('顧客取得エラー:', error)
    } else {
      setCustomers((data || []) as Customer[])
      setTotalCount(count || 0)
    }
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert('顧客名を入力してください')
      return
    }

    if (isEdit && formData.id) {
      // 更新
      const { error } = await supabase
        .from('customers')
        .update({
          name: formData.name.trim(),
          furigana: formData.furigana || null,
          postal_code: formData.postal_code || null,
          address1: formData.address1 || null,
          address2: formData.address2 || null,
          tel: formData.tel || null,
          fax: formData.fax || null,
          email: formData.email || null,
          note: formData.note || null,
        })
        .eq('id', formData.id)

      if (error) {
        console.error('顧客更新エラー:', error)
        alert('顧客の更新に失敗しました')
        return
      }

      alert('顧客を更新しました')
    } else {
      // 新規登録
      const newId = crypto.randomUUID()
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          id: newId,
          name: formData.name.trim(),
          furigana: formData.furigana || null,
          postal_code: formData.postal_code || null,
          address1: formData.address1 || null,
          address2: formData.address2 || null,
          tel: formData.tel || null,
          fax: formData.fax || null,
          email: formData.email || null,
          note: formData.note || null,
        }])
        .select()
        .single()

      if (error) {
        console.error('顧客登録エラー:', error)
        alert('顧客の登録に失敗しました')
        return
      }

      // returnTo がある場合は案件画面へ戻る
      if (returnTo && data) {
        router.push(`${returnTo}?customerId=${data.id}&customerName=${encodeURIComponent(data.name)}`)
        return
      }

      alert('顧客を登録しました')
    }

    // リセット
    setFormData(emptyForm)
    setIsEdit(false)
    setShowForm(false)
    fetchCustomers(currentPage)  // ★ 現在のページを再取得
  }

  const startNew = () => {
    setFormData(emptyForm)
    setIsEdit(false)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 0) // ★ 追加
  }

  const startEdit = (c: Customer) => {
    setFormData({
      id: c.id,
      name: c.name || '',
      furigana: c.furigana || '',
      postal_code: c.postal_code || '',
      address1: c.address1 || '',
      address2: c.address2 || '',
      tel: c.tel || '',
      fax: c.fax || '',
      email: c.email || '',
      note: c.note || '',
    })
    setIsEdit(true)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 0) // ★ 追加
  }

  const handleDelete = async (c: Customer) => {
    if (!confirm(`「${c.name}」を削除しますか？`)) return
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) {
      console.error('顧客削除エラー:', error)
      alert('顧客の削除に失敗しました')
    } else {
      alert('顧客を削除しました')
      fetchCustomers(currentPage)  // ★ 現在のページを再取得
    }
  }

  const filteredCustomers = customers.filter((c) =>
    (c.name || '').toLowerCase().includes(keyword.toLowerCase()) // ★ null セーフ
  )

  const handleSelect = (c: Customer) => {
    if (returnTo) {
      router.push(`${returnTo}?customerId=${c.id}&customerName=${encodeURIComponent(c.name)}`)
    } else {
      router.push(`/customers/${c.id}`)
    }
  }

  // ページネーション
  const totalPages = Math.ceil((totalCount || 0) / pageSize)

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, color: '#fff' }}>顧客マスタ検索</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={startNew}
            className="btn-3d"
            style={{ backgroundColor: '#28a745', color: '#fff', padding: '8px 16px' }}
          >
            + 新規登録 / 編集
          </button>
          <Link href={returnTo || "/selectors"}>
            <button className="btn-3d btn-reset" style={{ padding: '8px 16px', color: '#fff', backgroundColor: '#16a34a', border: '1px solid #15803d' }}>
              ← {returnTo ? '戻る' : 'メニューに戻る'}
            </button>
          </Link>
        </div>
      </div>

      {/* フォーム（新規/編集兼用） */}
      {showForm && (
        <div
          ref={formRef} // ★ 追加
          style={{ marginBottom: 16, padding: 16, border: '1px solid #334155', borderRadius: 12, backgroundColor: '#1e293b', color: '#e2e8f0' }}
        >
          <h3 style={{ marginTop: 0, color: '#93c5fd' }}>{isEdit ? '顧客編集' : '新規顧客登録'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ color: '#cbd5e1' }}>顧客名
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ color: '#cbd5e1' }}>フリガナ
              <input
                type="text"
                value={formData.furigana || ''}
                onChange={(e) => setFormData({ ...formData, furigana: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ color: '#cbd5e1' }}>郵便番号
              <input
                type="text"
                value={formData.postal_code || ''}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ color: '#cbd5e1' }}>住所1
              <input
                type="text"
                value={formData.address1 || ''}
                onChange={(e) => setFormData({ ...formData, address1: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ color: '#cbd5e1' }}>住所2
              <input
                type="text"
                value={formData.address2 || ''}
                onChange={(e) => setFormData({ ...formData, address2: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ color: '#cbd5e1' }}>電話
              <input
                type="text"
                value={formData.tel || ''}
                onChange={(e) => setFormData({ ...formData, tel: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ color: '#cbd5e1' }}>FAX
              <input
                type="text"
                value={formData.fax || ''}
                onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ color: '#cbd5e1' }}>メール
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-inset"
              />
            </label>
            <label style={{ gridColumn: '1 / -1', color: '#cbd5e1' }}>備考
              <textarea
                value={formData.note || ''}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="input-inset"
                rows={2}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button" // ★ 追加
              onClick={handleSubmit}
              className="btn-3d"
              style={{ backgroundColor: '#28a745', color: '#fff' }}
            >
              {isEdit ? '更新' : '登録'}
            </button>
            <button
              type="button" // ★ 追加
              onClick={() => { setShowForm(false); setIsEdit(false); setFormData(emptyForm); }}
              className="btn-3d btn-reset"
              style={{ color: '#fff' }}
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button" // ★ 追加
                    onClick={() => handleSelect(c)}
                    className="btn-3d btn-search"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    選択
                  </button>
                  <button
                    type="button" // ★ 追加
                    onClick={() => startEdit(c)}
                    className="btn-3d"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    編集
                  </button>
                  <button
                    type="button" // ★ 追加
                    onClick={() => handleDelete(c)}
                    className="btn-3d"
                    style={{ fontSize: 11, padding: '4px 10px', backgroundColor: '#dc3545', color: '#fff' }}
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredCustomers.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 24, color: '#94a3b8' }}>
          <p>該当する顧客がいません</p>
          <button
            onClick={startNew}
            className="btn-3d"
            style={{ backgroundColor: '#28a745', color: '#fff' }}
          >
            新規顧客を登録
          </button>
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', color: '#cbd5e1' }}>
          <button
            disabled={currentPage === 0}
            onClick={() => { setCurrentPage(0); fetchCustomers(0); }}
            className="btn-3d"
            style={{ padding: '6px 10px', color: '#fff', opacity: currentPage === 0 ? 0.5 : 1 }}
          >
            最初
          </button>
          <button
            disabled={currentPage === 0}
            onClick={() => { setCurrentPage(currentPage - 1); fetchCustomers(currentPage - 1); }}
            className="btn-3d"
            style={{ padding: '6px 10px', color: '#fff', opacity: currentPage === 0 ? 0.5 : 1 }}
          >
            ← 前へ
          </button>
          <span>{currentPage + 1} / {totalPages}</span>
          <button
            disabled={currentPage === totalPages - 1}
            onClick={() => { setCurrentPage(currentPage + 1); fetchCustomers(currentPage + 1); }}
            className="btn-3d"
            style={{ padding: '6px 10px', color: '#fff', opacity: currentPage === totalPages - 1 ? 0.5 : 1 }}
          >
            次へ →
          </button>
          <button
            disabled={currentPage === totalPages - 1}
            onClick={() => { setCurrentPage(totalPages - 1); fetchCustomers(totalPages - 1); }}
            className="btn-3d"
            style={{ padding: '6px 10px', color: '#fff', opacity: currentPage === totalPages - 1 ? 0.5 : 1 }}
          >
            最後
          </button>
        </div>
      )}
    </div>
  )
}

// Suspense でラップ
export default function CustomerSelectPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中...</div>}>
      <CustomerSelectContent />
    </Suspense>
  )
}

const thStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '8px 12px',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '8px 12px',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
}
