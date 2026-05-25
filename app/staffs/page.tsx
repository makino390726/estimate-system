'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { DEPARTMENTS } from '@/lib/departments'
import { BRANCH_OTHER_ID, LIFF_REPAIR_BRANCH_OPTIONS } from '@/lib/branches'

type Staff = {
  id: string
  name: string
  furigana: string | null
  email: string | null
  phone: string | null
  department: string | null
  note: string | null
  stamp_path: string | null
  approver_section_head_id: string | null
  approver_senmu_id: string | null
  approver_shacho_id: string | null
  is_repair_office_notify?: boolean
  created_at?: string
  updated_at?: string
}

export default function StaffsPage() {
  const [staffs, setStaffs] = useState<Staff[]>([])
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [stampFile, setStampFile] = useState<File | null>(null)
  const [isRepairOfficeNotify, setIsRepairOfficeNotify] = useState(false)
  const [officeBranchIds, setOfficeBranchIds] = useState<string[]>([])
  const [branchOtherHolder, setBranchOtherHolder] = useState<{ staffId: string; staffName: string } | null>(
    null,
  )

  // フォーム用ステート
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    furigana: '',
    email: '',
    phone: '',
    department: '',
    note: '',
    stamp_path: '',
    approver_section_head_id: null,
    approver_senmu_id: null,
    approver_shacho_id: null,
  })

  useEffect(() => {
    fetchStaffs()
  }, [])

  const loadBranchOtherHolder = async (staffList: Staff[]) => {
    const { data, error } = await supabase
      .from('staff_office_notify_branches')
      .select('staff_id')
      .eq('branch_id', BRANCH_OTHER_ID)
      .maybeSingle()

    if (error) {
      console.warn('branch_other 担当取得:', error.message)
      setBranchOtherHolder(null)
      return
    }
    if (!data?.staff_id) {
      setBranchOtherHolder(null)
      return
    }
    const sid = String(data.staff_id)
    const match = staffList.find((s) => s.id === sid)
    setBranchOtherHolder({
      staffId: sid,
      staffName: match?.name || sid,
    })
  }

  const loadOfficeBranchesForStaff = async (staffId: string) => {
    const { data, error } = await supabase
      .from('staff_office_notify_branches')
      .select('branch_id')
      .eq('staff_id', staffId)

    if (error) {
      console.warn('担当事業所取得:', error.message)
      setOfficeBranchIds([])
      return
    }
    setOfficeBranchIds((data || []).map((r) => String(r.branch_id)))
  }

  const resetOfficeNotifyForm = () => {
    setIsRepairOfficeNotify(false)
    setOfficeBranchIds([])
  }

  const syncOfficeNotifyBranches = async (
    staffId: string,
    enabled: boolean,
    branchIds: string[],
  ): Promise<string | null> => {
    const { error: delErr } = await supabase
      .from('staff_office_notify_branches')
      .delete()
      .eq('staff_id', staffId)
    if (delErr) return `担当事業所の更新に失敗: ${delErr.message}`

    if (!enabled || branchIds.length === 0) return null

    if (branchIds.includes(BRANCH_OTHER_ID)) {
      const { error: otherDelErr } = await supabase
        .from('staff_office_notify_branches')
        .delete()
        .eq('branch_id', BRANCH_OTHER_ID)
      if (otherDelErr) return `「その他」担当の入れ替えに失敗: ${otherDelErr.message}`
    }

    const rows = branchIds.map((branch_id) => ({ staff_id: staffId, branch_id }))
    const { error: insErr } = await supabase.from('staff_office_notify_branches').insert(rows)
    if (insErr) return `担当事業所の登録に失敗: ${insErr.message}`
    return null
  }

  const fetchStaffs = async () => {
    const { data, error } = await supabase
      .from('staffs')
      .select('*')
      .order('name')

    if (error) {
      console.error('担当者取得エラー:', error)
    } else {
      const normalized = (data || []).map((s: any) => ({
        ...s,
        id: String(s.id ?? ''),
        approver_section_head_id: s.approver_section_head_id ? String(s.approver_section_head_id) : null,
        approver_senmu_id: s.approver_senmu_id ? String(s.approver_senmu_id) : null,
        approver_shacho_id: s.approver_shacho_id ? String(s.approver_shacho_id) : null,
      }))
      setStaffs(normalized as Staff[])
      await loadBranchOtherHolder(normalized as Staff[])
    }
  }

  const handleSelectStaff = async (staff: Staff) => {
    setSelectedStaff(staff)
    setFormData({
      name: staff.name,
      furigana: staff.furigana,
      email: staff.email,
      phone: staff.phone,
      department: staff.department || '',
      note: staff.note,
      stamp_path: staff.stamp_path,
      approver_section_head_id: staff.approver_section_head_id,
      approver_senmu_id: staff.approver_senmu_id,
      approver_shacho_id: staff.approver_shacho_id,
    })
    setStampFile(null)
    setIsRepairOfficeNotify(Boolean(staff.is_repair_office_notify))
    await loadOfficeBranchesForStaff(staff.id)
    setIsEditing(true)
  }

  const handleNewStaff = () => {
    setSelectedStaff(null)
    resetOfficeNotifyForm()
    setFormData({
      name: '',
      furigana: '',
      email: '',
      phone: '',
      department: '',
      note: '',
      stamp_path: '',
      approver_section_head_id: null,
      approver_senmu_id: null,
      approver_shacho_id: null,
    })
    setStampFile(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setSelectedStaff(null)
    resetOfficeNotifyForm()
    setFormData({
      name: '',
      furigana: '',
      email: '',
      phone: '',
      department: '',
      note: '',
      stamp_path: '',
      approver_section_head_id: null,
      approver_senmu_id: null,
      approver_shacho_id: null,
    })
    setStampFile(null)
    setMsg(null)
  }

  // ファイル選択
  const handleStampFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (!file) {
      setStampFile(null)
      return
    }
    if (file.type !== 'image/png') {
      setMsg('PNGファイルのみアップロード可能です')
      setStampFile(null)
      return
    }
    setStampFile(file)
    setMsg(null)
  }

  // 画像アップロード
  const uploadStampImage = async (staffId: string, file: File) => {
    const filePath = `${staffId}/stamp.png`

    const { error: uploadError } = await supabase.storage
      .from('stamps')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      console.error('アップロードエラー:', uploadError)
      setMsg(`画像のアップロードに失敗しました: ${uploadError.message}`)
      return null
    }

    // 公開URLを取得
    const { data: publicUrlData } = supabase.storage
      .from('stamps')
      .getPublicUrl(filePath)

    return publicUrlData?.publicUrl || filePath
  }

  const normalizeId = (v?: string | null) => (v && v.trim() !== '' ? v.trim() : null)

  const toggleOfficeBranch = (branchId: string) => {
    setOfficeBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId],
    )
  }

  const handleSave = async () => {
    if (!formData.name) {
      setMsg('氏名は必須です')
      return
    }

    if (isRepairOfficeNotify && officeBranchIds.length === 0) {
      setMsg('事務処理担当を ON にする場合は、担当事業所を1つ以上選択してください')
      return
    }

    const staffIdForOtherCheck = selectedStaff?.id
    if (
      isRepairOfficeNotify &&
      officeBranchIds.includes(BRANCH_OTHER_ID) &&
      branchOtherHolder &&
      staffIdForOtherCheck &&
      branchOtherHolder.staffId !== staffIdForOtherCheck
    ) {
      const ok = confirm(
        `「その他」は現在 ${branchOtherHolder.staffName} が担当です。\n${formData.name} に変更しますか？`,
      )
      if (!ok) return
    }

    if (selectedStaff) {
      // 更新
      let stampPath = formData.stamp_path

      // スタンプファイルが選択されていればアップロード
      if (stampFile) {
        const uploadedPath = await uploadStampImage(selectedStaff.id, stampFile)
        if (uploadedPath) {
          stampPath = uploadedPath
        } else {
          return // アップロード失敗
        }
      }

      const updateData = {
        name: formData.name,
        furigana: formData.furigana || null,
        email: formData.email || null,
        phone: formData.phone || null,
        department: formData.department?.trim() || null,
        note: formData.note || null,
        stamp_path: stampPath || null,
        approver_section_head_id: normalizeId(formData.approver_section_head_id),
        approver_senmu_id: normalizeId(formData.approver_senmu_id),
        approver_shacho_id: normalizeId(formData.approver_shacho_id),
        is_repair_office_notify: isRepairOfficeNotify,
      }

      const { data, error } = await supabase
        .from('staffs')
        .update(updateData)
        .eq('id', selectedStaff.id)
        .select()

      if (error) {
        setMsg(`更新に失敗しました: ${error.message || '詳細はコンソールを確認'}`)
        console.error('更新エラー:', error)
      } else {
        const branchErr = await syncOfficeNotifyBranches(
          selectedStaff.id,
          isRepairOfficeNotify,
          officeBranchIds,
        )
        if (branchErr) {
          setMsg(`担当者は更新しましたが、${branchErr}`)
          fetchStaffs()
          return
        }
        setMsg('更新しました')
        fetchStaffs()
        handleCancel()
      }
    } else {
      // 新規登録
      const newStaff = {
        name: formData.name,
        furigana: formData.furigana || null,
        email: formData.email || null,
        phone: formData.phone || null,
        department: formData.department?.trim() || null,
        note: formData.note || null,
        stamp_path: null, // 先にレコードを作成
        approver_section_head_id: normalizeId(formData.approver_section_head_id),
        approver_senmu_id: normalizeId(formData.approver_senmu_id),
        approver_shacho_id: normalizeId(formData.approver_shacho_id),
        is_repair_office_notify: isRepairOfficeNotify,
      }

      const { data, error } = await supabase
        .from('staffs')
        .insert([newStaff])
        .select()

      if (error) {
        setMsg(`登録に失敗しました: ${error.message || '詳細はコンソールを確認'}`)
        console.error('登録エラー:', error)
        return
      }

      // 登録成功後、IDを取得してスタンプをアップロード
      const createdStaff = Array.isArray(data) && data.length > 0 ? data[0] : null
      if (createdStaff) {
        const createdId = String(createdStaff.id)
        const branchErr = await syncOfficeNotifyBranches(
          createdId,
          isRepairOfficeNotify,
          officeBranchIds,
        )
        if (branchErr) {
          setMsg(`登録しましたが、${branchErr}`)
          fetchStaffs()
          return
        }
        if (stampFile) {
          const uploadedPath = await uploadStampImage(createdId, stampFile)
          if (uploadedPath) {
            await supabase
              .from('staffs')
              .update({ stamp_path: uploadedPath })
              .eq('id', createdId)
          }
        }
      }

      setMsg('登録しました')
      fetchStaffs()
      handleCancel()
    }
  }

  const handleDelete = async () => {
    if (!selectedStaff) return
    if (!confirm(`${selectedStaff.name} を削除しますか？`)) return

    // スタンプ画像も削除
    if (selectedStaff.stamp_path) {
      const filePath = `${selectedStaff.id}/stamp.png`
      await supabase.storage.from('stamps').remove([filePath])
    }

    const { error } = await supabase
      .from('staffs')
      .delete()
      .eq('id', selectedStaff.id)

    if (error) {
      console.error('削除エラー:', error)
      setMsg('削除に失敗しました')
    } else {
      setMsg('削除しました')
      fetchStaffs()
      handleCancel()
    }
  }

  const filteredStaffs = staffs.filter((s) =>
    s.name.toLowerCase().includes(keyword.toLowerCase())
  )

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, color: '#fff' }}>担当者マスタ</h1>
        <Link href="/selectors">
          <button className="btn-3d btn-reset" style={{ padding: '8px 16px', color: '#fff', backgroundColor: '#16a34a', border: '1px solid #15803d' }}>
            ← メニューに戻る
          </button>
        </Link>
      </div>

      {msg && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: msg.includes('失敗') ? '#7f1d1d' : '#14532d',
            color: '#fff',
            border: `1px solid ${msg.includes('失敗') ? '#ef4444' : '#22c55e'}`,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        {/* 左側：担当者一覧 */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={handleNewStaff}
              className="btn-3d btn-primary"
              style={{ width: '100%', padding: '10px' }}
            >
              ✚ 新規担当者登録
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="担当者名で検索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="input-inset"
              style={{ width: '100%' }}
            />
          </div>

          <div
            style={{
              border: '1px solid #334155',
              borderRadius: 8,
              maxHeight: 'calc(100vh - 280px)',
              overflowY: 'auto',
              backgroundColor: '#0f172a',
            }}
          >
            {filteredStaffs.map((staff) => (
              <div
                key={staff.id}
                onClick={() => handleSelectStaff(staff)}
                style={{
                  padding: '12px',
                  borderBottom: '1px solid #1f2937',
                  cursor: 'pointer',
                  backgroundColor: selectedStaff?.id === staff.id ? '#1e293b' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {/* 印章画像のサムネイル */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f5f5f5',
                    overflow: 'hidden',
                  }}
                >
                  {staff.stamp_path ? (
                    <img
                      src={staff.stamp_path}
                      alt={`${staff.name}の印章`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                      onError={(e) => {
                        // 画像読み込みエラー時は代替アイコンを表示
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.innerHTML = '📋'
                        }
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 20 }}>👤</span>
                  )}
                </div>

                {/* 担当者情報 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', fontSize: 14, color: '#e2e8f0' }}>{staff.name}</div>
                  <div style={{ fontSize: 12, color: '#cbd5e1' }}>{staff.furigana}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {staff.department || '部署未設定'}
                    {staff.is_repair_office_notify ? (
                      <span style={{ marginLeft: 6, color: '#fbbf24' }}>事務</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {staff.email}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredStaffs.length === 0 && (
            <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: 24 }}>
              該当する担当者がいません
            </p>
          )}
        </div>

        {/* 右側：編集フォーム */}
        <div>
          {isEditing ? (
            <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 24, backgroundColor: '#1e293b', color: '#e2e8f0' }}>
              <h2 style={{ marginTop: 0, color: '#93c5fd' }}>
                {selectedStaff ? '担当者情報編集' : '新規担当者登録'}
              </h2>

              <div style={{ display: 'grid', gap: 16 }}>
                {/* 基本情報 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                      氏名 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-inset"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                      フリガナ
                    </label>
                    <input
                      type="text"
                      value={formData.furigana || ''}
                      onChange={(e) => setFormData({ ...formData, furigana: e.target.value })}
                      className="input-inset"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                      メールアドレス
                    </label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input-inset"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                      電話番号
                    </label>
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="input-inset"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                    部署
                  </label>
                  <select
                    value={formData.department || ''}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="input-inset"
                    style={{ width: '100%', maxWidth: 400 }}
                  >
                    <option value="">-- 未設定 --</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    {formData.department &&
                      !(DEPARTMENTS as readonly string[]).includes(formData.department) && (
                      <option value={formData.department}>{formData.department}（既存）</option>
                    )}
                  </select>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0 0' }}>
                    メールと部署（営業所・出張所など）を設定すると、修理案件の管轄営業所と一致する担当者に通知メールが届きます。
                  </p>
                </div>

                <div
                  style={{
                    borderTop: '1px solid #334155',
                    paddingTop: 16,
                    marginTop: 4,
                  }}
                >
                  <h3 style={{ marginTop: 0, fontSize: 16, color: '#cbd5e1' }}>
                    修理完了・事務処理（LINE WORKS）
                  </h3>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      marginBottom: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isRepairOfficeNotify}
                      onChange={(e) => {
                        const on = e.target.checked
                        setIsRepairOfficeNotify(on)
                        if (!on) setOfficeBranchIds([])
                      }}
                    />
                    <span style={{ fontWeight: 'bold', color: '#e2e8f0' }}>事務処理担当</span>
                  </label>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 12px 0' }}>
                    ON にすると、完了報告時に担当事業所の案件について LINE WORKS で通知します（
                    <code style={{ color: '#cbd5e1' }}>/lineworks-staff-notify</code>{' '}
                    で LINE WORKS 連携が必要）。未割当の案件は「その他」担当へ送られます。
                  </p>
                  {isRepairOfficeNotify && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: 8,
                      }}
                    >
                      {LIFF_REPAIR_BRANCH_OPTIONS.map((b) => {
                        const isOther = b.id === BRANCH_OTHER_ID
                        const heldByOther =
                          isOther &&
                          branchOtherHolder &&
                          selectedStaff?.id !== branchOtherHolder.staffId
                        return (
                          <label
                            key={b.id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              padding: '8px 10px',
                              border: '1px solid #475569',
                              borderRadius: 6,
                              backgroundColor: officeBranchIds.includes(b.id)
                                ? '#1e3a5f'
                                : '#0f172a',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={officeBranchIds.includes(b.id)}
                              onChange={() => toggleOfficeBranch(b.id)}
                            />
                            <span style={{ fontSize: 13, color: '#e2e8f0' }}>
                              {b.name}
                              {isOther ? (
                                <span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>
                                  全社1名・営業所以外
                                  {heldByOther
                                    ? `（現在: ${branchOtherHolder.staffName}）`
                                    : null}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                    備考
                  </label>
                  <textarea
                    value={formData.note || ''}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="input-inset"
                    style={{ width: '100%', minHeight: 80 }}
                  />
                </div>

                {/* 印章画像アップロード */}
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                    印章画像（PNG）
                  </label>
                  <input
                    type="file"
                    accept="image/png"
                    onChange={handleStampFileChange}
                    style={{ marginBottom: 8 }}
                  />
                  {stampFile && (
                    <p style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>
                      選択: {stampFile.name}
                    </p>
                  )}
                  {formData.stamp_path && (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>現在の画像:</p>
                      <img 
                        src={formData.stamp_path} 
                        alt="印章" 
                        style={{ maxWidth: 100, maxHeight: 100, border: '1px solid #ddd' }}
                      />
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                    保存時に「stamps/{'{社員ID}'}/stamp.png」でアップロードされます
                  </p>
                </div>

                {/* 承認経路設定 */}
                <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 8 }}>
                  <h3 style={{ marginTop: 0, fontSize: 16, color: '#cbd5e1' }}>承認経路設定</h3>

                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                        所長承認者
                      </label>
                      <select
                        value={formData.approver_section_head_id || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, approver_section_head_id: e.target.value === '' ? null : e.target.value })
                        }
                        className="input-inset"
                        style={{ width: '100%' }}
                      >
                        <option value="">-- 選択なし --</option>
                        {staffs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                        専務承認者
                      </label>
                      <select
                        value={formData.approver_senmu_id || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, approver_senmu_id: e.target.value === '' ? null : e.target.value })
                        }
                        className="input-inset"
                        style={{ width: '100%' }}
                      >
                        <option value="">-- 選択なし --</option>
                        {staffs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', color: '#cbd5e1' }}>
                        社長承認者
                      </label>
                      <select
                        value={formData.approver_shacho_id || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, approver_shacho_id: e.target.value === '' ? null : e.target.value })
                        }
                        className="input-inset"
                        style={{ width: '100%' }}
                      >
                        <option value="">-- 選択なし --</option>
                        {staffs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* ボタン */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button onClick={handleSave} className="btn-3d btn-primary" style={{ flex: 1 }}>
                  💾 保存
                </button>
                <button onClick={handleCancel} className="btn-3d btn-reset" style={{ flex: 1, color: '#fff' }}>
                  ✕ キャンセル
                </button>
                {selectedStaff && (
                  <button
                    onClick={handleDelete}
                    className="btn-3d"
                    style={{ backgroundColor: '#dc3545', color: '#fff' }}
                  >
                    🗑️ 削除
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 48,
                textAlign: 'center',
                color: '#94a3b8',
                backgroundColor: '#0f172a',
              }}
            >
              <p>左側から担当者を選択するか、新規登録ボタンをクリックしてください</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
