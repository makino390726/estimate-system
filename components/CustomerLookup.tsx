// components/CustomerLookup.tsx
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Customer } from '@/types/customer'

type Props = {
  onSelect?: (customer: Customer) => void
  onNew?: () => void
  onEdit?: (customer: Customer) => void
  onDelete?: (id: Customer['id']) => Promise<void> | void
}

export default function CustomerLookup({ onSelect, onNew, onEdit, onDelete }: Props) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<Customer | null>(null)

  // 編集用フォーム状態（selected と同期）
  const [form, setForm] = useState<Partial<Customer>>({})

  const handleSearch = async () => {
    const k = keyword.trim()
    if (!k) {
      setMessage('検索キーワードを入力してください')
      setResults([])
      return
    }

    setLoading(true)
    setMessage('検索中...')

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .ilike('name', `%${k}%`)
      .order('name', { ascending: true })
      .limit(200)

    if (error) {
      setMessage('Supabase エラー: ' + error.message)
      setResults([])
    } else {
      if (!data || data.length === 0) {
        setMessage('該当する顧客がありません（0件）')
      } else {
        setMessage(`${data.length} 件ヒットしました`)
      }
      setResults(data as Customer[])
    }

    setLoading(false)
  }

  const handleSelect = (customer: Customer) => {
    setSelected(customer)
    // フルカラムをフォームにセット（note 等も含める）
    setForm({
      id: customer.id,
      name: customer.name,
      tel: customer.tel ?? '',
      email: (customer as any).email ?? '',
      postal_code: (customer as any).postal_code ?? '',
      address1: (customer as any).address1 ?? '',
      address2: (customer as any).address2 ?? '',
      note: (customer as any).note ?? '',
    })
    if (onSelect) onSelect(customer)
    // スクロールして編集領域へ
    setTimeout(() => {
      const el = document.getElementById('customer-detail')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleEdit = (customer: Customer) => {
    if (onEdit) onEdit(customer)
    else handleSelect(customer)
  }

  const handleDelete = async (id: Customer['id']) => {
    const ok = confirm('本当に削除しますか？')
    if (!ok) return

    if (onDelete) {
      await onDelete(id)
      setResults((prev) => prev.filter((r) => r.id !== id))
      if (selected?.id === id) {
        setSelected(null)
        setForm({})
      }
      return
    }

    try {
      setLoading(true)
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) {
        alert('削除エラー: ' + error.message)
      } else {
        setResults((prev) => prev.filter((r) => r.id !== id))
        if (selected?.id === id) {
          setSelected(null)
          setForm({})
        }
      }
    } catch (e) {
      console.error(e)
      alert('削除に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleNewClick = () => {
    setSelected(null)
    setForm({
      name: '',
      tel: '',
      email: '',
      postal_code: '',
      address1: '',
      address2: '',
      note: '',
    })
    if (onNew) onNew()
    setTimeout(() => {
      const el = document.getElementById('customer-detail')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleInputChange = (k: keyof Customer | string, v: any) => {
    setForm((s) => ({ ...s, [k]: v }))
  }

  const handleSaveNew = async () => {
    if (!form.name || !String(form.name).trim()) {
      alert('顧客名を入力してください')
      return
    }

    try {
      setLoading(true)
      const payload = {
        name: String(form.name).trim(),
        tel: form.tel ?? null,
        email: form.email ?? null,
        postal_code: form.postal_code ?? null,
        address1: form.address1 ?? null,
        address2: form.address2 ?? null,
        note: form.note ?? null,
      }
      const { data, error } = await supabase.from('customers').insert(payload).select().single()
      if (error) {
        alert('登録エラー: ' + error.message)
      } else {
        const created = data as Customer
        setResults((prev) => [created, ...prev])
        setSelected(created)
        setForm({
          id: created.id,
          name: created.name,
          tel: created.tel ?? '',
          email: (created as any).email ?? '',
          postal_code: (created as any).postal_code ?? '',
          address1: (created as any).address1 ?? '',
          address2: (created as any).address2 ?? '',
          note: (created as any).note ?? '',
        })
        setMessage(`新規登録完了 - ID: ${created.id} が自動採番されました`)
      }
    } catch (e) {
      console.error(e)
      alert('登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveUpdate = async () => {
    if (!selected || !selected.id) {
      alert('更新対象が選択されていません')
      return
    }
    if (!form.name || !String(form.name).trim()) {
      alert('顧客名を入力してください')
      return
    }

    try {
      setLoading(true)
      const payload = {
        name: String(form.name).trim(),
        tel: form.tel ?? null,
        email: form.email ?? null,
        postal_code: form.postal_code ?? null,
        address1: form.address1 ?? null,
        address2: form.address2 ?? null,
        note: form.note ?? null,
      }
      const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', selected.id)
        .select()
        .single()
      if (error) {
        alert('更新エラー: ' + error.message)
      } else {
        const updated = data as Customer
        setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
        setSelected(updated)
        setForm({
          id: updated.id,
          name: updated.name,
          tel: updated.tel ?? '',
          email: (updated as any).email ?? '',
          postal_code: (updated as any).postal_code ?? '',
          address1: (updated as any).address1 ?? '',
          address2: (updated as any).address2 ?? '',
          note: (updated as any).note ?? '',
        })
        if (onEdit) onEdit(updated)
        setMessage('更新しました')
      }
    } catch (e) {
      console.error(e)
      alert('更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteFromDetail = async () => {
    if (!selected?.id) {
      alert('削除対象が選択されていません')
      return
    }
    await handleDelete(selected.id)
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div
      style={{
        border: '1px solid #ccc',
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <h2 style={{ marginTop: 0 }}>顧客検索（name あいまい検索）</h2>

      {/* 上部操作：検索のみ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="text"
          placeholder="顧客名の一部を入力（例：鹿児島、たばこ 等）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="input-inset"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="btn-3d btn-search"
        >
          {loading ? '検索中...' : '検索'}
        </button>
      </div>

      {message && (
        <p style={{ fontSize: 12, margin: '4px 0', color: '#555' }}>
          {message}
        </p>
      )}

      {/* 検索結果一覧 */}
      <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
        <table className="inset-table" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: '8%' }}>ID</th>
              <th style={{ width: '32%' }}>顧客名</th>
              <th style={{ width: '15%' }}>TEL</th>
              <th style={{ width: '35%' }}>住所</th>
              <th style={{ width: '10%' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {results.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="inset-cell" style={{ textAlign: 'left' }}>
                    {c.id}
                  </div>
                </td>
                <td>
                  <div className="inset-cell">{c.name}</div>
                </td>
                <td>
                  <div className="inset-cell">{c.tel ?? '-'}</div>
                </td>
                <td>
                  <div className="inset-cell">
                    {[ (c as any).postal_code, (c as any).address1, (c as any).address2 ].filter(Boolean).join(' ')}
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c)}
                    className="btn-3d btn-search"
                    style={{ marginRight: 6 }}
                    title="選択"
                  >
                    選択
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(c)}
                    className="btn-3d btn-edit"
                    style={{ marginRight: 6 }}
                    title="修正"
                  >
                    修正
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="btn-3d btn-delete"
                    title="削除"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
            {results.length === 0 && !loading && (
              <tr>
                <td colSpan={5}>
                  <div className="inset-cell" style={{ textAlign: 'center' }}>
                    検索結果がここに表示されます
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 詳細 / 編集パネル */}
      <div id="customer-detail" style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>{selected ? '顧客編集' : '新規顧客登録'}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 13 }}>ID</label>
          <div style={{ fontSize: 13, fontWeight: 'bold' }}>{selected?.id ?? '（新規登録時に自動採番）'}</div>

          <label style={{ fontSize: 13 }}>顧客名</label>
          <input
            className="input-inset"
            value={form.name ?? ''}
            onChange={(e) => handleInputChange('name', e.target.value)}
          />

          <label style={{ fontSize: 13 }}>TEL</label>
          <input
            className="input-inset"
            value={form.tel ?? ''}
            onChange={(e) => handleInputChange('tel', e.target.value)}
          />

          <label style={{ fontSize: 13 }}>Email</label>
          <input
            className="input-inset"
            value={(form as any).email ?? ''}
            onChange={(e) => handleInputChange('email', e.target.value)}
          />

          <label style={{ fontSize: 13 }}>郵便番号</label>
          <input
            className="input-inset"
            value={(form as any).postal_code ?? ''}
            onChange={(e) => handleInputChange('postal_code', e.target.value)}
          />

          <label style={{ fontSize: 13 }}>住所1</label>
          <input
            className="input-inset"
            value={(form as any).address1 ?? ''}
            onChange={(e) => handleInputChange('address1', e.target.value)}
          />

          <label style={{ fontSize: 13 }}>住所2</label>
          <input
            className="input-inset"
            value={(form as any).address2 ?? ''}
            onChange={(e) => handleInputChange('address2', e.target.value)}
          />

          <label style={{ fontSize: 13, alignSelf: 'start' }}>備考 (note)</label>
          <textarea
            className="input-inset"
            value={(form as any).note ?? ''}
            onChange={(e) => handleInputChange('note', e.target.value)}
            style={{ minHeight: 80, resize: 'vertical' }}
          />
        </div>

        {/* ボタン並び：新規登録 / 更新 / 削除 / クリア */}
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleNewClick}
            disabled={loading}
            className="btn-3d btn-reset"
          >
            新規登録
          </button>

          {!selected && (
            <button
              type="button"
              onClick={handleSaveNew}
              disabled={loading}
              className="btn-3d btn-search"
            >
              登録
            </button>
          )}

          {selected && (
            <>
              <button
                type="button"
                onClick={handleSaveUpdate}
                disabled={loading}
                className="btn-3d btn-edit"
              >
                更新
              </button>
              <button
                type="button"
                onClick={handleDeleteFromDetail}
                disabled={loading}
                className="btn-3d btn-delete"
              >
                削除
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setForm({})
            }}
            className="btn-3d btn-reset"
          >
            クリア
          </button>
        </div>
      </div>
    </div>
  )
}
