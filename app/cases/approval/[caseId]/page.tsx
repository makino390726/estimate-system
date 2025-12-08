'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabaseClient'
import { useReactToPrint } from 'react-to-print'
import PrintEstimate from '../../new/PrintEstimate'

type CaseDetail = {
  id: string  // bigint
  case_id: string
  staff_id: number
  product_id: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  cost_unit_price: number
  amount: number
  cost_amount: number
  gross_profit: number
  temp_case_id: number
  section: string
  section_id: number
  // ★ 動的に追加されるプロパティ
  product_name?: string
}

type StaffInfo = {
  id: string
  name: string
  email: string | null
  stamp_path: string | null
}

export default function CaseApprovalPage() {
  const params = useParams()
  const router = useRouter()
  
  const caseId = typeof params.caseId === 'string' ? params.caseId : (Array.isArray(params.caseId) ? params.caseId[0] : '')

  const [caseData, setCaseData] = useState<any>(null)
  const [detailsData, setDetailsData] = useState<any[]>([])
  const [sectionsData, setSectionsData] = useState<any[]>([])  // ★ セクションステートを追加
  const [staffName, setStaffName] = useState<string>('担当者不明')
  const [customerName, setCustomerName] = useState<string>('')
  
  // ★ approversステートを追加
  const [approvers, setApprovers] = useState<{
    applicant: StaffInfo | null
    sectionHead: StaffInfo | null
    senmu: StaffInfo | null
    shacho: StaffInfo | null
  }>({
    applicant: null,
    sectionHead: null,
    senmu: null,
    shacho: null,
  })
  
  const [approvalFlow, setApprovalFlow] = useState<{
    applicant: string
    sectionHead: string | null
    senmu: string | null
    shacho: string | null
  }>({
    applicant: '',
    sectionHead: null,
    senmu: null,
    shacho: null,
  })

  const [currentUser, setCurrentUser] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [managerEmail, setManagerEmail] = useState('smata2696@gmail.com')
  const [directorEmail, setDirectorEmail] = useState('smata2696@gmail.com')
  const [presidentEmail, setPresidentEmail] = useState('smata2696@gmail.com')

  const [rejectEmailManager, setRejectEmailManager] = useState('')
  const [rejectEmailDirector, setRejectEmailDirector] = useState('')
  const [rejectEmailPresident, setRejectEmailPresident] = useState('')

  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [previewApprovalLevel, setPreviewApprovalLevel] = useState<'staff' | 'manager' | 'director' | 'president'>('staff')
  // ★ 印刷用ref
  const printRef = useRef<HTMLDivElement>(null)

  // ★ react-to-print設定
  const handlePrint = useReactToPrint({
    contentRef: printRef,  // content → contentRef に変更
  })

  const openPrintPreview = (level: 'staff' | 'manager' | 'director' | 'president') => {
    setPreviewApprovalLevel(level)
    setShowPrintPreview(true)
  }

  useEffect(() => {
    if (caseId) {
      console.log('案件ID:', caseId)
      fetchCaseData()
    }
    setCurrentUser({ id: 1, name: '仮ユーザー', role: 'staff' })
  }, [caseId])

  // ★ approversが更新されたらメールアドレスを自動入力
  useEffect(() => {
    if (approvers.sectionHead?.email) {
      setManagerEmail(approvers.sectionHead.email)
    }
    if (approvers.senmu?.email) {
      setDirectorEmail(approvers.senmu.email)
    }
    if (approvers.shacho?.email) {
      setPresidentEmail(approvers.shacho.email)
    }
  }, [approvers])

  const fetchCaseData = async () => {
    if (!caseId) {
      console.error('無効な案件ID:', caseId)
      return
    }

    const { data: caseDataResult, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('case_id', caseId)
      .single()

    if (caseError) {
      console.error('案件取得エラー:', caseError)
      return
    }

    if (caseDataResult) {
      setCaseData(caseDataResult)
      setCustomerName(caseDataResult.customer_id || caseDataResult.customer_name || '-')

      // ★ セクションデータ取得を追加
      const { data: caseSections, error: sectionsError } = await supabase
        .from('case_sections')
        .select('section_id, section_name')
        .eq('case_id', caseId)

      if (!sectionsError && caseSections) {
        setSectionsData(caseSections.map(s => ({
          id: s.section_id,
          name: s.section_name,
        })))
      }

      // 明細取得
      const { data: details, error: detailsError } = await supabase
        .from('case_details')
        .select('*')
        .eq('case_id', caseId)

      if (!detailsError && details) {
        const productIds = [...new Set(details.map(d => d.product_id ? String(d.product_id) : '').filter(Boolean))]
        console.log('productIds:', productIds)

        if (productIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from('products')
            .select('id, name, unit, cost_price')
            .in('id', productIds)

          if (productsError) {
            console.error('products取得エラー:', productsError)
          }
          console.log('productsData:', productsData)

          const byId: Record<string, { id: any; name: string; unit: string | null; cost_price: number | null }> = {}
          for (const p of (productsData || [])) {
            byId[String(p.id)] = p
          }

          const enrichedDetails = details.map(detail => {
            const pid = detail.product_id ? String(detail.product_id) : ''
            const product = pid ? byId[pid] : null

            let displayName = product?.name || '-'
            const specText = (detail.spec || '').trim()
            if (displayName !== '-' && specText) {
              displayName = `${displayName} ${specText}`
            }

            return {
              ...detail,
              product_name: displayName,
              unit: product?.unit || detail.unit || '-',
              cost_price: detail.cost_unit_price ?? product?.cost_price ?? 0,
            }
          })

          console.log('enrichedDetails:', enrichedDetails)
          setDetailsData(enrichedDetails)
        } else {
          console.warn('product_idが空のため、商品名は設定できません。')
          setDetailsData(details.map(d => ({
            ...d,
            product_name: '-',
          })))
        }
      } else {
        setDetailsData([])
      }

      // 担当者と承認者の詳細取得
      let applicant: StaffInfo | null = null
      let sectionHead: StaffInfo | null = null
      let senmu: StaffInfo | null = null
      let shacho: StaffInfo | null = null

      if (caseDataResult.staff_id) {
        const { data: staffData } = await supabase
          .from('staffs')
          .select('id,name,email,stamp_path,approver_section_head_id,approver_senmu_id,approver_shacho_id')
          .eq('id', caseDataResult.staff_id)
          .single()

        if (staffData) {
          applicant = {
            id: staffData.id,
            name: staffData.name,
            email: staffData.email,
            stamp_path: staffData.stamp_path,
          }

          const ids: string[] = [
            staffData.approver_section_head_id,
            staffData.approver_senmu_id,
            staffData.approver_shacho_id,
          ].filter(Boolean) as string[]

          if (ids.length > 0) {
            const { data: approverRows } = await supabase
              .from('staffs')
              .select('id,name,email,stamp_path')
              .in('id', ids)

            const findById = (id?: string | null) =>
              (approverRows || []).find(r => r.id === id) || null

            const sec = findById(staffData.approver_section_head_id)
            const sen = findById(staffData.approver_senmu_id)
            const sha = findById(staffData.approver_shacho_id)

            sectionHead = sec ? { id: sec.id, name: sec.name, email: sec.email, stamp_path: sec.stamp_path } : null
            senmu = sen ? { id: sen.id, name: sen.name, email: sen.email, stamp_path: sen.stamp_path } : null
            shacho = sha ? { id: sha.id, name: sha.name, email: sha.email, stamp_path: sha.stamp_path } : null
          }
        }
      }

      setApprovers({ applicant, sectionHead, senmu, shacho })
      setStaffName(applicant?.name || '担当者不明')

      setApprovalFlow({
        applicant: applicant?.name || '担当者不明',
        sectionHead: sectionHead?.name || null,
        senmu: senmu?.name || null,
        shacho: shacho?.name || null,
      })
    }
  }

  const handleApprove = async (role: string) => {
    if (!currentUser) {
      alert('ログインしてください')
      return
    }

    const now = new Date().toISOString()
    let updateData: any = {}
    let nextApproverEmail = ''

    switch (role) {
      case 'staff':
        if (!managerEmail) {
          alert('所長のメールアドレスを入力してください')
          return
        }
        updateData = { approve_staff: now }
        nextApproverEmail = managerEmail
        break

      case 'manager':
        if (!caseData?.approve_staff) {
          alert('申請者の承認が必要です')
          return
        }
        if (!directorEmail) {
          alert('専務のメールアドレスを入力してください')
          return
        }
        updateData = { approve_manager: now }
        nextApproverEmail = directorEmail
        break

      case 'director':
        if (!caseData?.approve_manager) {
          alert('所長の承認が必要です')
          return
        }
        if (!presidentEmail) {
          alert('社長のメールアドレスを入力してください')
          return
        }
        updateData = { approve_director: now }
        nextApproverEmail = presidentEmail
        break

      case 'president':
        if (!caseData?.approve_director) {
          alert('専務の承認が必要です')
          return
        }
        updateData = { approve_president: now }
        break
    }

    const { error } = await supabase
      .from('cases')
      .update(updateData)
      .eq('case_id', caseId)

    if (error) {
      console.error('承認エラー:', error)
      alert('承認に失敗しました')
    } else {
      setMsg('承認しました')
      fetchCaseData()

      if (nextApproverEmail) {
        await sendApprovalEmail(nextApproverEmail, caseId)
      }

      setTimeout(() => setMsg(null), 2000)
    }
  }

  const handleReject = async (role: string, rejectEmail: string) => {
    if (!rejectEmail) {
      alert('差し戻し先のメールアドレスを入力してください')
      return
    }

    const roleNames: { [key: string]: string } = {
      manager: '所長承認',
      director: '専務承認',
      president: '社長承認',
    }

    if (!confirm('本当に差し戻しますか？\n承認がクリアされ、差し戻しメールが送信されます。')) {
      return
    }

    let updateData: any = {}

    switch (role) {
      case 'manager':
        updateData = { approve_staff: null }
        break
      case 'director':
        updateData = { approve_manager: null }
        break
      case 'president':
        updateData = { approve_director: null }
        break
      default:
        return
    }

    const { error } = await supabase
      .from('cases')
      .update(updateData)
      .eq('case_id', caseId)

    if (error) {
      setMsg('差し戻しに失敗しました')
    } else {
      await sendRejectEmail(rejectEmail, caseId, roleNames[role])
      setMsg('差し戻しました。差し戻しメールを送信しました。')
      fetchCaseData()
    }
    
    setTimeout(() => setMsg(null), 3000)
  }

  const handleResendEmail = async (role: string) => {
    let email = ''
    
    switch (role) {
      case 'manager':
        email = managerEmail
        break
      case 'director':
        email = directorEmail
        break
      case 'president':
        email = presidentEmail
        break
    }

    if (!email) {
      alert('メールアドレスを入力してください')
      return
    }

    await sendApprovalEmail(email, caseId, true)
  }

  const sendApprovalEmail = async (email: string, caseId: string, isResend: boolean = false) => {
    try {
      const response = await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          caseId,
          subject: caseData?.subject || '件名不明',
          approvedBy: currentUser?.name || '担当者',
          nextApprover: '承認者',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        alert('メール送信に失敗しました')
      } else {
        const message = isResend ? '承認依頼メールを再送信しました' : '承認依頼メールを送信しました'
        setMsg(`${message}: ${email}`)
        setTimeout(() => setMsg(null), 3000)
      }
    } catch (error) {
      alert('メール送信中にエラーが発生しました')
    }
  }

  const sendRejectEmail = async (email: string, caseId: string, rejectedBy: string) => {
    try {
      await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          caseId,
          subject: `【差し戻し】${caseData?.subject || '件名不明'}`,
          approvedBy: `${rejectedBy}により差し戻し`,
          nextApprover: '担当者',
          isReject: true,
          rejectMessage: '承認依頼の案件について、差戻されました。',
        }),
      })
    } catch (error) {
      console.error('差し戻しメール送信失敗:', error)
    }
  }

  const subtotal = detailsData.reduce((sum, r) => sum + r.amount, 0)
  const totalCostAmount = detailsData.reduce((sum, r) => sum + ((r.cost_price || 0) * r.quantity), 0)
  const totalGrossProfit = subtotal - totalCostAmount
  const grossProfitRate = subtotal > 0 ? (totalGrossProfit / subtotal) * 100 : 0
  
  const discount = caseData?.discount || 0
  const taxRate = caseData?.tax_rate || 0.1
  const subtotalAfterDiscount = subtotal - discount
  const taxAmount = Math.floor(subtotalAfterDiscount * taxRate)
  const totalAmount = subtotalAfterDiscount + taxAmount

  // ★ 縦様式用のページ分割（PrintEstimateに渡すrowsを使用）
  const printRows = detailsData.map(d => ({
    product_id: d.product_id,
    item_name: d.product_name || '-',
    spec: d.spec,
    unit: d.unit,
    quantity: d.quantity,
    unit_price: d.unit_price,
    amount: d.amount,
    cost_price: d.cost_unit_price || 0,
    section_id: d.section_id,
  }))

  // セクションをPrintEstimate用に整形
  const sections = sectionsData.map(s => ({
    id: s.id,
    name: s.name,
  }))

  const MAX_ROWS_PER_PAGE = 20 // ★ 追加: 見積PDFの1ページあたり行数

  const getApprovalStamps = () => ({
    staff: !!caseData?.approve_staff,
    manager: !!caseData?.approve_manager,
    director: !!caseData?.approve_director,
    president: !!caseData?.approve_president,
  });

  const getApprovalStampUrls = () => ({
    staff: approvers.applicant?.stamp_path || null,
    manager: approvers.sectionHead?.stamp_path || null,
    director: approvers.senmu?.stamp_path || null,
    president: approvers.shacho?.stamp_path || null,
  });

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'draft':
        return '下書き'
      case 'pending':
        return '申請中'
      case 'approved':
        return '承認済'
      case 'rejected':
        return '差戻し'
      default:
        return status || '-'
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>案件詳細・承認 (ID: {caseId})</h1>
        <Link href="/cases/list">
          <button className="btn-3d btn-reset" style={{ padding: '8px 16px' }}>
            ← 案件一覧に戻る
          </button>
        </Link>
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', borderRadius: 4, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* ★ caseData がない場合の読み込み中表示 */}
      {!caseData && (
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          読み込み中...
        </div>
      )}

      {/* ★ caseData がある場合のみ表示 */}
      {caseData && (
        <>
          {/* 印刷プレビューモーダル */}
          {showPrintPreview && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPrintPreview(false)}>
              <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, maxWidth: '95vw', maxHeight: '95vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2>印刷プレビュー</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handlePrint} className="btn-3d btn-primary">🖨️ 印刷</button>
                    <button onClick={() => setShowPrintPreview(false)} className="btn-3d btn-reset">✕ 閉じる</button>
                  </div>
                </div>
                <PrintEstimate
                  ref={printRef}
                  printRef={printRef}
                  layoutType={caseData?.layout_type || 'vertical'}
                  estimateNo={caseData?.case_no || ''}
                  estimateDate={caseData?.created_date || ''}
                  customerName={caseData?.customer?.name || ''}
                  subject={caseData?.subject || ''}
                  deliveryDeadline={caseData?.delivery_deadline || ''}
                  deliveryPlace={caseData?.delivery_place || ''}
                  deliveryTerms={caseData?.delivery_terms || ''}
                  paymentTerms={caseData?.payment_terms || ''}
                  validityText={caseData?.validity_text || ''}
                  discount={caseData?.special_discount || 0}
                  taxRate={0.1}
                  subtotal={subtotal}
                  subtotalAfterDiscount={subtotal - (caseData?.special_discount || 0)}
                  taxAmount={caseData?.tax_amount || 0}
                  totalAmount={caseData?.total_amount || 0}
                  MAX_ROWS_PER_PAGE={MAX_ROWS_PER_PAGE}
                  rows={printRows}
                  sections={sections}
                  approvalStamps={getApprovalStamps()}
                  stampUrls={getApprovalStampUrls()}
                />
              </div>
            </div>
          )}

          {/* 案件情報 */}
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#f9f9f9' }}>
            <h2 style={{ marginTop: 0 }}>案件情報</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><strong>見積番号:</strong> {caseData.case_no}</div>
              <div><strong>作成日:</strong> {caseData.created_date}</div>
              <div><strong>得意先名:</strong> {customerName || caseData.customer_name || '-'}</div>
              <div><strong>担当者:</strong> {staffName}</div>
              <div><strong>件名:</strong> {caseData.subject}</div>
              <div><strong>ステータス:</strong> {getStatusText(caseData.status)}</div>
              <div><strong>納入場所:</strong> {caseData.delivery_place || '-'}</div>
              <div><strong>納期:</strong> {caseData.delivery_deadline || '-'}</div>
              <div><strong>納入条件:</strong> {caseData.delivery_terms || '-'}</div>
              <div><strong>有効期限:</strong> {caseData.validity_text || '-'}</div>
              <div><strong>支払条件:</strong> {caseData.payment_terms || '-'}</div>
              <div><strong>レイアウト:</strong> {caseData.layout_type === 'horizontal' ? '横様式' : '縦様式'}</div>
            </div>
          </div>

          {/* 明細テーブル */}
          <h2>明細</h2>
          {detailsData.length === 0 ? (
            <p style={{ color: '#999', fontStyle: 'italic' }}>明細データがありません</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr>
                  <th style={thStyle}>商品名</th>
                  {/* ★ 規格列を削除 */}
                  <th style={thStyle}>単位</th>
                  <th style={thStyle}>数量</th>
                  <th style={thStyle}>単価</th>
                  <th style={thStyle}>金額</th>
                  <th style={thStyle}>原価単価</th>
                  <th style={thStyle}>原価額</th>
                  <th style={thStyle}>粗利額</th>
                  <th style={thStyle}>備考</th>
                </tr>
              </thead>
              <tbody>
                {detailsData.map((row, index) => {
                  const costPrice = row.cost_unit_price || 0
                  const costAmount = costPrice * row.quantity
                  const grossProfit = row.amount - costAmount
                  
                  return (
                    <tr key={row.id || `row-${index}`}>
                      <td style={tdStyle}>{row.product_name || '-'}</td>
                      <td style={tdStyle}>{row.unit}</td>
                      <td style={tdStyle}>{row.quantity}</td>
                      <td style={tdStyle}>{row.unit_price.toLocaleString()}</td>
                      <td style={tdStyle}>{row.amount.toLocaleString()}</td>
                      <td style={tdStyle}>{costPrice.toLocaleString()}</td>
                      <td style={tdStyle}>{costAmount.toLocaleString()}</td>
                      <td style={tdStyle}>{grossProfit.toLocaleString()}</td>
                      <td style={tdStyle}>{row.section || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* 合計テーブル */}
          <div style={{ marginLeft: 'auto', maxWidth: 400, marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>小計</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{subtotal.toLocaleString()} 円</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>総原価額</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{totalCostAmount.toLocaleString()} 円</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>粗利額</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{totalGrossProfit.toLocaleString()} 円</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>粗利率</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#28a745', fontWeight: 'bold' }}>{grossProfitRate.toFixed(1)} %</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>出精値引き</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#dc3545' }}>-{discount.toLocaleString()} 円</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>値引後小計</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{subtotalAfterDiscount.toLocaleString()} 円</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>消費税 ({(taxRate * 100).toFixed(0)}%)</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{taxAmount.toLocaleString()} 円</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', fontSize: 14, backgroundColor: '#f8f9fa' }}>合計金額</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', fontSize: 16, color: '#dc3545', backgroundColor: '#f8f9fa' }}>{totalAmount.toLocaleString()} 円</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 承認フロー */}
          <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#f0f8ff', borderRadius: 8 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>承認フロー</h3>
            {/* 承認フローの表示（存在チェックを追加） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ padding: '12px 20px', backgroundColor: '#fff', border: '2px solid #007bff', borderRadius: 8, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: '#666' }}>申請者</div>
                <div style={{ fontWeight: 'bold', fontSize: 16 }}>{approvers.applicant?.name ?? '-'}</div>
                <div style={{ fontSize: 11, color: '#555' }}>{approvers.applicant?.email ?? '-'}</div>
              </div>

              {approvers.sectionHead && (
                <>
                  <span style={{ fontSize: 24, color: '#999' }}>→</span>
                  <div style={{ padding: '12px 20px', backgroundColor: caseData?.approve_manager ? '#d4edda' : '#fff', border: `2px solid ${caseData?.approve_manager ? '#28a745' : '#ddd'}`, borderRadius: 8, minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: '#666' }}>所長</div>
                    <div style={{ fontWeight: 'bold', fontSize: 16 }}>{approvers.sectionHead.name}</div>
                    <div style={{ fontSize: 11, color: '#555' }}>{approvers.sectionHead.email ?? '-'}</div>
                    {caseData?.approve_manager && <div style={{ fontSize: 11, color: '#28a745' }}>✓ 承認済</div>}
                  </div>
                </>
              )}

              {approvers.senmu && (
                <>
                  <span style={{ fontSize: 24, color: '#999' }}>→</span>
                  <div style={{ padding: '12px 20px', backgroundColor: caseData?.approve_director ? '#d4edda' : '#fff', border: `2px solid ${caseData?.approve_director ? '#28a745' : '#ddd'}`, borderRadius: 8, minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: '#666' }}>専務</div>
                    <div style={{ fontWeight: 'bold', fontSize: 16 }}>{approvers.senmu.name}</div>
                    <div style={{ fontSize: 11, color: '#555' }}>{approvers.senmu.email ?? '-'}</div>
                    {caseData?.approve_director && <div style={{ fontSize: 11, color: '#28a745' }}>✓ 承認済</div>}
                  </div>
                </>
              )}

              {approvers.shacho && (
                <>
                  <span style={{ fontSize: 24, color: '#999' }}>→</span>
                  <div style={{ padding: '12px 20px', backgroundColor: caseData?.approve_president ? '#d4edda' : '#fff', border: `2px solid ${caseData?.approve_president ? '#28a745' : '#ddd'}`, borderRadius: 8, minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: '#666' }}>社長</div>
                    <div style={{ fontWeight: 'bold', fontSize: 16 }}>{approvers.shacho.name}</div>
                    <div style={{ fontSize: 11, color: '#555' }}>{approvers.shacho.email ?? '-'}</div>
                    {caseData?.approve_president && <div style={{ fontSize: 11, color: '#28a745' }}>✓ 承認済</div>}
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: 16, fontSize: 13 }}>
              <strong>現在の状態:</strong>{' '}
              {!caseData?.approval_section_head && approvalFlow.sectionHead && `${approvalFlow.sectionHead}の承認待ち`}
              {caseData?.approval_section_head && !caseData?.approval_senmu && approvalFlow.senmu && `${approvalFlow.senmu}の承認待ち`}
              {caseData?.approval_senmu && !caseData?.approval_shacho && approvalFlow.shacho && `${approvalFlow.shacho}の承認待ち`}
              {caseData?.approval_shacho && '全承認完了'}
            </div>
          </div>

          {/* 承認操作 */}
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#fff' }}>
            <h3 style={{ marginTop: 0 }}>承認操作</h3>
            
            {/* 申請者承認 */}
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 4 }}>
              <h4 style={{ margin: '0 0 8px 0' }}>申請者承認</h4>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
                <strong>申請者:</strong> {approvers.applicant?.name || '-'} ({approvers.applicant?.email || 'メールアドレスなし'})
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  type="email" 
                  value={managerEmail} 
                  onChange={(e) => setManagerEmail(e.target.value)} 
                  placeholder="所長のメールアドレス" 
                  className="input-inset" 
                  style={{ flex: 1 }} 
                />
                <button onClick={() => handleApprove('staff')} className="btn-3d btn-primary" disabled={!!caseData?.approve_staff}>✓ 承認して次へ送信</button>
                <button onClick={() => openPrintPreview('staff')} className="btn-3d">🖨️ 印刷</button>
              </div>
              {approvers.sectionHead && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#28a745' }}>
                  次の承認者: {approvers.sectionHead.name} ({approvers.sectionHead.email || 'メールアドレスなし'})
                </div>
              )}
            </div>

            {/* 所長承認 */}
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 4 }}>
              <h4 style={{ margin: '0 0 8px 0' }}>所長承認</h4>
              {approvers.sectionHead && (
                <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
                  <strong>所長:</strong> {approvers.sectionHead.name} ({approvers.sectionHead.email || 'メールアドレスなし'})
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input 
                  type="email" 
                  value={directorEmail} 
                  onChange={(e) => setDirectorEmail(e.target.value)} 
                  placeholder="専務のメールアドレス" 
                  className="input-inset" 
                  style={{ flex: 1 }} 
                />
                <button onClick={() => handleApprove('manager')} className="btn-3d btn-primary" disabled={!!caseData?.approve_manager || !caseData?.approve_staff}>✓ 承認して次へ送信</button>
                <button onClick={() => handleResendEmail('manager')} className="btn-3d">📧 再送信</button>
                <button onClick={() => openPrintPreview('manager')} className="btn-3d">🖨️ 印刷</button>
              </div>
              {approvers.senmu && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#28a745' }}>
                  次の承認者: {approvers.senmu.name} ({approvers.senmu.email || 'メールアドレスなし'})
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  type="email" 
                  value={rejectEmailManager} 
                  onChange={(e) => setRejectEmailManager(e.target.value)} 
                  placeholder="差戻先メールアドレス" 
                  className="input-inset" 
                  style={{ flex: 1 }} 
                />
                <button onClick={() => handleReject('manager', rejectEmailManager)} className="btn-3d" style={{ backgroundColor: '#ffc107' }}>↩️ 差戻</button>
              </div>
            </div>

            {/* 専務承認 */}
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 4 }}>
              <h4 style={{ margin: '0 0 8px 0' }}>専務承認</h4>
              {approvers.senmu && (
                <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
                  <strong>専務:</strong> {approvers.senmu.name} ({approvers.senmu.email || 'メールアドレスなし'})
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input 
                  type="email" 
                  value={presidentEmail} 
                  onChange={(e) => setPresidentEmail(e.target.value)} 
                  placeholder="社長のメールアドレス" 
                  className="input-inset" 
                  style={{ flex: 1 }} 
                />
                <button onClick={() => handleApprove('director')} className="btn-3d btn-primary" disabled={!!caseData?.approve_director || !caseData?.approve_manager}>✓ 承認して次へ送信</button>
                <button onClick={() => handleResendEmail('director')} className="btn-3d">📧 再送信</button>
                <button onClick={() => openPrintPreview('director')} className="btn-3d">🖨️ 印刷</button>
              </div>
              {approvers.shacho && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#28a745' }}>
                  次の承認者: {approvers.shacho.name} ({approvers.shacho.email || 'メールアドレスなし'})
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  type="email" 
                  value={rejectEmailDirector} 
                  onChange={(e) => setRejectEmailDirector(e.target.value)} 
                  placeholder="差戻先メールアドレス" 
                  className="input-inset" 
                  style={{ flex: 1 }} 
                />
                <button onClick={() => handleReject('director', rejectEmailDirector)} className="btn-3d" style={{ backgroundColor: '#ffc107' }}>↩️ 差戻</button>
              </div>
            </div>

            {/* 社長承認 */}
            <div style={{ padding: 12, backgroundColor: '#f9f9fa', borderRadius: 4 }}>
              <h4 style={{ margin: '0 0 8px 0' }}>社長承認</h4>
              {approvers.shacho && (
                <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
                  <strong>社長:</strong> {approvers.shacho.name} ({approvers.shacho.email || 'メールアドレスなし'})
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <button onClick={() => handleApprove('president')} className="btn-3d btn-primary" disabled={!!caseData?.approve_president || !caseData?.approve_director} style={{ flex: 1 }}>✓ 最終承認</button>
                <button onClick={() => handleResendEmail('president')} className="btn-3d">📧 再送信</button>
                <button onClick={() => openPrintPreview('president')} className="btn-3d">🖨️ 印刷</button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  type="email" 
                  value={rejectEmailPresident} 
                  onChange={(e) => setRejectEmailPresident(e.target.value)} 
                  placeholder="差戻先メールアドレス" 
                  className="input-inset" 
                  style={{ flex: 1 }} 
                />
                <button onClick={() => handleReject('president', rejectEmailPresident)} className="btn-3d" style={{ backgroundColor: '#ffc107' }}>↩️ 差戻</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const thStyle = {
  padding: '8px 12px',
  backgroundColor: '#f2f2f2',
  color: '#333',
  borderBottom: '2px solid #007bff',
  textAlign: 'left' as const,
  fontWeight: 'bold' as const,
}

const tdStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid #ddd',
  verticalAlign: 'top' as const,
}