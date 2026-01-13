'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'

type CaseWithDetails = {
  case_id: string
  case_no: number | null
  subject: string
  created_date: string
  status: string
  customer_name: string
  staff_name: string
  approve_staff: string | null
  approve_manager: string | null
  approve_director: string | null
  approve_president: string | null
  approvalStatus: string
}

export default function CaseListPage() {
  const [cases, setCases] = useState<CaseWithDetails[]>([])
  const [originalCases, setOriginalCases] = useState<CaseWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [staffFilter, setStaffFilter] = useState('')
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([])
  const router = useRouter()

  useEffect(() => {
    fetchCases()
    fetchStaffOptions()
  }, [])

  const fetchStaffOptions = async () => {
    const { data, error } = await supabase
      .from('staffs')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      console.error('担当者一覧取得エラー:', error)
      return
    }

    setStaffOptions(data || [])
  }

  const fetchCases = async () => {
    setLoading(true)
    const startTime = performance.now()

    try {
      // 案件データを取得
      const { data: casesData, error: casesError } = await supabase
        .from('cases')
        .select('*')
        .order('created_date', { ascending: false })

      if (casesError) {
        console.error('案件取得エラー:', casesError)
        setLoading(false)
        return
      }

      // ★ 担当者IDのリストを取得
      const staffIds = casesData
        ?.map((c: any) => c.staff_id)
        .filter((id: any) => id) || []

      console.log('担当者ID一覧:', staffIds)

      // ★ 顧客IDのリストを取得
      const customerIds = casesData
        ?.map((c: any) => c.customer_id)
        .filter((id: any) => id) || []

      console.log('顧客ID一覧:', customerIds)

      // ★ 担当者マスタ（staffsテーブル）から名前を取得
      let staffMap: { [key: string]: string } = {}

      if (staffIds.length > 0) {
        const { data: staffData, error: staffError } = await supabase
          .from('staffs')  // ★ users → staffs に変更
          .select('id, name')
          .in('id', staffIds)

        console.log('取得した担当者データ:', staffData)
        console.log('担当者取得エラー:', staffError)

        if (!staffError && staffData) {
          staffData.forEach((staff: any) => {
            staffMap[staff.id] = staff.name
          })
        }
      }

      console.log('担当者マップ:', staffMap)

      // ★ 顧客マスタ（customersテーブル）から名前を取得
      let customerMap: { [key: string]: string } = {}

      if (customerIds.length > 0) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', customerIds)

        console.log('取得した顧客データ:', customerData)
        console.log('顧客取得エラー:', customerError)

        if (!customerError && customerData) {
          customerData.forEach((customer: any) => {
            customerMap[customer.id] = customer.name
          })
        }
      }

      console.log('顧客マップ:', customerMap)

      // データを整形
      const formattedCases: CaseWithDetails[] = casesData.map((c: any) => {
        let approvalStatus = 'pending'
        
        if (c.approve_president) {
          approvalStatus = 'approved'
        } else if (c.approve_director) {
          approvalStatus = 'director_approved'
        } else if (c.approve_manager) {
          approvalStatus = 'manager_approved'
        } else if (c.approve_staff) {
          approvalStatus = 'staff_approved'
        }

        return {
          case_id: c.case_id,
          case_no: c.case_no,
          subject: c.subject,
          created_date: c.created_date,
          status: c.status,
          customer_name: customerMap[c.customer_id] || c.customer_id || '不明',  // ★ 顧客名を表示
          staff_name: staffMap[c.staff_id] || c.staff_id || '不明',  // ★ 担当者名を表示
          approve_staff: c.approve_staff,
          approve_manager: c.approve_manager,
          approve_director: c.approve_director,
          approve_president: c.approve_president,
          approvalStatus,
        }
      })

      setCases(formattedCases)
      setOriginalCases(formattedCases)

      const endTime = performance.now()
      console.log(`✅ データ取得時間: ${(endTime - startTime).toFixed(2)}ms`)
    } catch (error) {
      console.error('予期しないエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // ★ ステータス変更機能（確認ダイアログ付き）
  const handleStatusChange = async (caseId: string, currentStatus: string, newStatus: string) => {
    // 同じステータスが選択された場合は何もしない
    if (currentStatus === newStatus) {
      return
    }

    // ★ 確認ダイアログを表示
    const confirmed = window.confirm(`ステータスを「${currentStatus}」から「${newStatus}」に変更しますか？`)
    
    if (!confirmed) {
      // No を選択した場合、元の値に戻す（再レンダリングで元に戻る）
      setCases([...cases])
      return
    }

    try {
      const { error } = await supabase
        .from('cases')
        .update({ status: newStatus })
        .eq('case_id', caseId)

      if (error) {
        console.error('ステータス更新エラー:', error)
        alert('ステータスの更新に失敗しました')
        // エラー時も元の値に戻す
        setCases([...cases])
        return
      }

      // ローカルの状態を更新（再取得せずに即座に反映）
      setCases(prevCases =>
        prevCases.map(c =>
          c.case_id === caseId ? { ...c, status: newStatus } : c
        )
      )

      console.log(`✅ ステータスを「${newStatus}」に更新しました`)
    } catch (error) {
      console.error('ステータス更新エラー:', error)
      alert('ステータスの更新に失敗しました')
      // エラー時も元の値に戻す
      setCases([...cases])
    }
  }

  // ★ ステータスごとの背景色とフォント色を取得
  const getStatusStyle = (status: string): React.CSSProperties => {
    const statusStyles: { [key: string]: React.CSSProperties } = {
      '商談中': { backgroundColor: '#007bff', color: '#000' },   // 青背景・黒文字
      '受注': { backgroundColor: '#dc3545', color: '#fff' },     // 赤背景・白文字
      '注文': { backgroundColor: '#6f42c1', color: '#fff' },     // 紫背景・白文字
      '納品': { backgroundColor: '#28a745', color: '#000' },     // 緑背景・黒文字
      '倉庫移動': { backgroundColor: '#f97316', color: '#000' }, // 倉庫移動も移動色で表示
      '完了': { backgroundColor: '#6c757d', color: '#fff' },     // グレー背景・白文字
    }

    return {
      ...statusStyles[status] || { backgroundColor: '#6c757d', color: '#fff' },
      fontSize: 11,
      padding: '4px 8px',
      width: '100%',
      minWidth: 100,
      fontWeight: 'bold',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
    }
  }

  const handleShowDetail = (caseId: string) => {
    router.push(`/cases/approval/${caseId}`)
  }

  const handleDelete = async (caseId: string) => {
    if (!confirm(`案件を削除してもよろしいですか？\n関連する承認履歴、明細データも削除されます。`)) {
      return
    }

    try {
      // 承認履歴を削除
      const { error: approvalError } = await supabase
        .from('approval_history')
        .delete()
        .eq('case_id', caseId)

      if (approvalError) {
        console.error('承認履歴削除エラー:', approvalError)
        alert('承認履歴の削除に失敗しました')
        return
      }

      // 明細を削除
      const { error: detailError } = await supabase
        .from('case_details')
        .delete()
        .eq('case_id', caseId)

      if (detailError) {
        console.error('明細削除エラー:', detailError)
        alert('明細データの削除に失敗しました')
        return
      }

      // 案件を削除
      const { error: caseError } = await supabase
        .from('cases')
        .delete()
        .eq('case_id', caseId)

      if (caseError) {
        console.error('案件削除エラー:', caseError)
        alert('案件の削除に失敗しました')
      } else {
        alert('削除しました')
        fetchCases()
      }
    } catch (err: any) {
      console.error('削除処理エラー:', err)
      alert('削除中にエラーが発生しました')
    }
  }

  const handleFilterByStaff = () => {
    if (!staffFilter) {
      setCases(originalCases)
      return
    }

    setCases(originalCases.filter((c) => c.staff_name === staffFilter))
  }

  const handleShowAll = () => {
    setStaffFilter('')
    fetchCases()
  }

  const getStatusBadge = (status: string) => {
    const styles: { [key: string]: React.CSSProperties } = {
      pending: { backgroundColor: '#ffc107', color: '#000' },
      staff_approved: { backgroundColor: '#17a2b8', color: '#fff' },
      manager_approved: { backgroundColor: '#6c757d', color: '#fff' },
      director_approved: { backgroundColor: '#007bff', color: '#fff' },
      approved: { backgroundColor: '#28a745', color: '#fff' },
    }

    const labels: { [key: string]: string } = {
      pending: '承認待ち',
      staff_approved: '申請済み',
      manager_approved: '所長承認済み',
      director_approved: '専務承認済み',
      approved: '社長承認済み',
    }

    return (
      <span
        style={{
          ...styles[status] || {},
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 'bold',
        }}
      >
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <p>読み込み中...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>案件一覧・承認</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="input-inset"
            style={{ minWidth: 200 }}
          >
            <option value="">担当者を選択</option>
            {staffOptions.map((staff) => (
              <option key={staff.id} value={staff.name}>
                {staff.name}
              </option>
            ))}
          </select>
          <button onClick={handleFilterByStaff} className="btn-3d btn-primary">
            担当者で絞込
          </button>
          <button onClick={handleShowAll} className="btn-3d btn-reset">
            全件表示
          </button>
          <Link href="/selectors">
            <button className="btn-3d btn-reset" style={{ padding: '8px 16px', backgroundColor: '#16a34a', border: '1px solid #15803d', color: '#fff' }}>
              ← メニューに戻る
            </button>
          </Link>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>案件ID</th>
            <th style={thStyle}>案件No</th>
            <th style={thStyle}>作成日</th>
            <th style={thStyle}>件名</th>
            <th style={thStyle}>顧客名</th>
            <th style={thStyle}>担当者</th>
            <th style={thStyle}>ステータス</th>
            <th style={thStyle}>承認状況</th>
            <th style={thStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.case_id}>
              <td style={tdStyle}>{c.case_id}</td>
              <td style={tdStyle}>{c.case_no ?? '-'}</td>
              <td style={tdStyle}>{c.created_date}</td>
              <td style={tdStyle}>{c.subject}</td>
              <td style={tdStyle}>{c.customer_name}</td>
              <td style={tdStyle}>{c.staff_name}</td>
              <td style={tdStyle}>
                {/* ★ ステータス変更用セレクトボックス（色付き） */}
                <select
                  value={c.status}
                  onChange={(e) => handleStatusChange(c.case_id, c.status, e.target.value)}
                  style={getStatusStyle(c.status)}
                >
                  <option value="商談中">商談中</option>
                  <option value="受注">受注</option>
                  <option value="注文">注文</option>
                  <option value="納品">納品</option>
                  <option value="倉庫移動">移動（倉庫移動）</option>
                  <option value="完了">完了</option>
                </select>
              </td>
              <td style={tdStyle}>{getStatusBadge(c.approvalStatus)}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleShowDetail(c.case_id)}
                    className="btn-3d btn-search"
                    style={{ fontSize: 11, padding: '4px 12px', backgroundColor: '#16a34a' }}
                  >
                    明細表示
                  </button>
                  <button
                    onClick={() => handleDelete(c.case_id)}
                    className="btn-3d"
                    style={{
                      fontSize: 11,
                      padding: '4px 12px',
                      backgroundColor: '#dc3545',
                      color: '#fff',
                    }}
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {cases.length === 0 && (
        <p style={{ textAlign: 'center', color: '#999', marginTop: 24 }}>
          案件がありません
        </p>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  border: '1px solid #334155',
  padding: '8px 12px',
  backgroundColor: '#0f172a',
  color: '#cbd5e1',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 'bold',
}

const tdStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '8px 12px',
  fontSize: 12,
}