'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabaseClient'
import { useReactToPrint } from 'react-to-print'
import { resolveStaffName } from '@/lib/staffNameMatch'
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
  price_rate?: number | null
  retail_price?: number | null
  exclude_from_total?: boolean
  cost_unit_price: number
  amount: number
  cost_amount: number
  gross_profit: number
  temp_case_id: number
  section: string
  section_id: number
  remarks?: string  // ★ 備考欄（定価情報など）
  unregistered_product?: string  // ★ マスタ未登録商品名
  comment?: string
  // ★ 動的に追加されるプロパティ
  product_name?: string
}

type LwMapping = {
  staff_name: string
  lineworks_user_id: string
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
  const [honorific, setHonorific] = useState<string>('様')  // ★ 敬称
  const [approvalHistory, setApprovalHistory] = useState<any[]>([])  // ★ 承認履歴

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

  const [managerLineWorksId, setManagerLineWorksId] = useState('')
  const [directorLineWorksId, setDirectorLineWorksId] = useState('')
  const [presidentLineWorksId, setPresidentLineWorksId] = useState('')

  const [rejectLineWorksIdManager, setRejectLineWorksIdManager] = useState('')
  const [rejectLineWorksIdDirector, setRejectLineWorksIdDirector] = useState('')
  const [rejectLineWorksIdPresident, setRejectLineWorksIdPresident] = useState('')
  const [lwMappings, setLwMappings] = useState<LwMapping[]>([])
  const [rejectReasonManager, setRejectReasonManager] = useState('')
  const [rejectReasonDirector, setRejectReasonDirector] = useState('')
  const [rejectReasonPresident, setRejectReasonPresident] = useState('')

  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [previewApprovalLevel, setPreviewApprovalLevel] = useState<'staff' | 'manager' | 'director' | 'president'>('staff')
  // ★ 印刷用ref
  const printRef = useRef<HTMLDivElement>(null)

  // ★ react-to-print設定
  const handlePrint = useReactToPrint({
    contentRef: printRef,  // content → contentRef に変更
  })

  const openPrintPreview = (level: 'staff' | 'manager' | 'director' | 'president') => {
    console.log('openPrintPreview called with level:', level)
    setPreviewApprovalLevel(level)
    setShowPrintPreview(true)
  }

  const closePrintPreview = () => {
    console.log('closePrintPreview called')
    setShowPrintPreview(false)
  }

  const resolveLwIdForStaff = (staffName: string | null | undefined, mappings: LwMapping[]): string => {
    if (!staffName) return ''
    const names = mappings.map((m) => m.staff_name)
    const resolved = resolveStaffName(staffName, names)
    if (!resolved) return ''
    const row = mappings.find((m) => m.staff_name === resolved)
    return row?.lineworks_user_id?.trim() || ''
  }

  const lwIdLabel = (staffName: string | null | undefined) => {
    const id = resolveLwIdForStaff(staffName, lwMappings)
    return id || 'LINE WORKS ID未登録'
  }

  useEffect(() => {
    if (caseId) {
      console.log('案件ID:', caseId)
      fetchCaseData()
    }
    setCurrentUser({ id: 1, name: '仮ユーザー', role: 'staff' })
    console.log('Initial showPrintPreview state:', showPrintPreview)
  }, [caseId])

  // ★ approvers と LINE WORKS 連携から通知先 ID を自動入力
  useEffect(() => {
    if (lwMappings.length === 0) return
    const mgr = resolveLwIdForStaff(approvers.sectionHead?.name, lwMappings)
    if (mgr) setManagerLineWorksId(mgr)
    const dir = resolveLwIdForStaff(approvers.senmu?.name, lwMappings)
    if (dir) setDirectorLineWorksId(dir)
    const pre = resolveLwIdForStaff(approvers.shacho?.name, lwMappings)
    if (pre) setPresidentLineWorksId(pre)
    const app = resolveLwIdForStaff(approvers.applicant?.name, lwMappings)
    if (app) {
      setRejectLineWorksIdManager(app)
      setRejectLineWorksIdDirector(app)
      setRejectLineWorksIdPresident(app)
    }
  }, [approvers, lwMappings])

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

      // ★ 敬称を読み込み
      if (caseDataResult.honorific) {
        setHonorific(caseDataResult.honorific)
      }

      // ★ 顧客名を取得（customer_idから顧客マスタを参照）
      if (caseDataResult.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('name')
          .eq('id', caseDataResult.customer_id)
          .single()

        if (!customerError && customerData) {
          setCustomerName(customerData.name)
        } else {
          // フォールバック：IDをそのまま表示
          setCustomerName(caseDataResult.customer_id)
        }
      } else {
        setCustomerName('-')
      }

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
        .order('display_order', { ascending: true })
        .order('id', { ascending: true })

      if (!detailsError && details) {
        const productIds = [...new Set(details.map(d => d.product_id ? String(d.product_id) : '').filter(Boolean))]
        console.log('productIds:', productIds)

        if (productIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from('products')
            .select('id, name, unit, cost_price, retail_price')
            .in('id', productIds)

          if (productsError) {
            console.error('products取得エラー:', productsError)
          }
          console.log('productsData:', productsData)

          const byId: Record<string, { id: any; name: string; unit: string | null; cost_price: number | null; retail_price: number | null }> = {}
          for (const p of (productsData || [])) {
            byId[String(p.id)] = p
          }

          const enrichedDetails = details.map(detail => {
            const pid = detail.product_id ? String(detail.product_id) : ''
            const product = pid ? byId[pid] : null

            const displayName = detail.unregistered_product || product?.name || '-'

            return {
              ...detail,
              product_name: displayName,
              unit: product?.unit || detail.unit || '-',
              cost_price: detail.cost_unit_price ?? product?.cost_price ?? 0,
              retail_price: product?.retail_price ?? null,
              price_rate: detail.price_rate ?? null,
              exclude_from_total: detail.exclude_from_total ?? false,
              remarks: detail.remarks || undefined,  // ★ remarks を保持
            }
          })

          console.log('enrichedDetails:', enrichedDetails)
          setDetailsData(enrichedDetails)
        } else {
          console.warn('product_idが空のため、商品マスタは参照できません。')
          setDetailsData(details.map(d => ({
            ...d,
            product_name: d.unregistered_product || '-',
            cost_price: d.cost_unit_price ?? 0,
            retail_price: null,
            price_rate: d.price_rate ?? null,
            exclude_from_total: d.exclude_from_total ?? false,
            remarks: d.remarks || undefined,  // ★ remarks を保持
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

      // ★ モーダル状態をリセット（ホワイトアウト対策）
      setShowPrintPreview(false)

      // ★ 承認履歴を取得
      const { data: historyData, error: historyError } = await supabase
        .from('approval_history')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: true })

      if (!historyError && historyData) {
        setApprovalHistory(historyData)
      }

      const mapRes = await fetch('/api/lineworks/staff-mappings', { cache: 'no-store' })
      const mapData = await mapRes.json().catch(() => ({}))
      const mappings: LwMapping[] =
        mapRes.ok && mapData.ok
          ? (mapData.mappings || []).map((m: LwMapping) => ({
              staff_name: String(m.staff_name || '').trim(),
              lineworks_user_id: String(m.lineworks_user_id || '').trim(),
            }))
          : []
      setLwMappings(mappings)

      const mgrLw = resolveLwIdForStaff(sectionHead?.name, mappings)
      if (mgrLw) setManagerLineWorksId(mgrLw)
      const dirLw = resolveLwIdForStaff(senmu?.name, mappings)
      if (dirLw) setDirectorLineWorksId(dirLw)
      const preLw = resolveLwIdForStaff(shacho?.name, mappings)
      if (preLw) setPresidentLineWorksId(preLw)
      const appLw = resolveLwIdForStaff(applicant?.name, mappings)
      if (appLw) {
        setRejectLineWorksIdManager(appLw)
        setRejectLineWorksIdDirector(appLw)
        setRejectLineWorksIdPresident(appLw)
      }
    }
  }

  // ★ 承認のみ（LINE WORKS 通知なし）
  const handleApproveOnly = async (role: string) => {
    // 申請不要モードでは申請者以外の承認を遮断
    if (role !== 'staff' && caseData?.skip_higher_approval) {
      alert('申請不要モードのため、他の承認は無効です')
      return
    }
    if (!currentUser) {
      alert('ログインしてください')
      return
    }

    const now = new Date().toISOString()
    let updateData: any = {}

    switch (role) {
      case 'staff':
        // 申請不要 → 上位承認を無効化するフラグも保存（カラムがある場合のみ）
        updateData = { approve_staff: now }
        if (canSkipHigherApproval) {
          updateData.skip_higher_approval = true
        }
        break
      case 'manager':
        if (!caseData?.approve_staff) {
          alert('申請者の承認が必要です')
          return
        }
        updateData = { approve_manager: now }
        break
      case 'director':
        if (!caseData?.approve_manager) {
          alert('所長の承認が必要です')
          return
        }
        updateData = { approve_director: now }
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
      setMsg('承認しました（通知なし）')
      await recordApprovalHistory(role, '承認')
      fetchCaseData()
      setTimeout(() => setMsg(null), 2000)
    }
  }

  // ★ 承認履歴を記録
  const recordApprovalHistory = async (role: string, action: string) => {
    const { error } = await supabase
      .from('approval_history')
      .insert({
        case_id: caseId,
        role: role,
        action: action,
      })

    if (error) {
      console.error('履歴記録エラー:', error)
    }
  }

  // ★ 承認して LINE WORKS 通知
  const handleApprove = async (role: string) => {
    // 申請不要モードでは申請者以外の承認を遮断
    if (role !== 'staff' && caseData?.skip_higher_approval) {
      alert('申請不要モードのため、他の承認は無効です')
      return
    }
    if (!currentUser) {
      alert('ログインしてください')
      return
    }

    const now = new Date().toISOString()
    let updateData: any = {}
    let nextApproverLineWorksId = ''

    switch (role) {
      case 'staff':
        if (!managerLineWorksId) {
          alert('所長の LINE WORKS ID を入力してください')
          return
        }
        // 通常承認→上位承認を有効にするため skip_higher_approval を false にする（カラムがある場合のみ）
        updateData = { approve_staff: now }
        if (canSkipHigherApproval) {
          updateData.skip_higher_approval = false
        }
        nextApproverLineWorksId = managerLineWorksId
        break

      case 'manager':
        if (!caseData?.approve_staff) {
          alert('申請者の承認が必要です')
          return
        }
        if (!directorLineWorksId) {
          alert('専務の LINE WORKS ID を入力してください')
          return
        }
        updateData = { approve_manager: now }
        nextApproverLineWorksId = directorLineWorksId
        break

      case 'director':
        if (!caseData?.approve_manager) {
          alert('所長の承認が必要です')
          return
        }
        if (!presidentLineWorksId) {
          alert('社長の LINE WORKS ID を入力してください')
          return
        }
        updateData = { approve_director: now }
        nextApproverLineWorksId = presidentLineWorksId
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
      await recordApprovalHistory(role, '承認して次へ送信')
      fetchCaseData()

      if (nextApproverLineWorksId) {
        let nextStaffName = ''
        switch (role) {
          case 'staff':
            nextStaffName = approvers.sectionHead?.name || ''
            break
          case 'manager':
            nextStaffName = approvers.senmu?.name || ''
            break
          case 'director':
            nextStaffName = approvers.shacho?.name || ''
            break
        }
        await sendApprovalNotify(nextApproverLineWorksId, nextStaffName)
      }

      setTimeout(() => setMsg(null), 2000)
    }
  }

  // ★ 承認して口頭で承認依頼
  const handleApproveWithOralRequest = async (role: string) => {
    if (role !== 'staff' && caseData?.skip_higher_approval) {
      alert('申請不要モードのため、他の承認は無効です')
      return
    }
    if (!currentUser) {
      alert('ログインしてください')
      return
    }

    const now = new Date().toISOString()
    let updateData: any = {}

    switch (role) {
      case 'staff':
        updateData = {
          approve_staff: now,
          oral_request_manager: now
        }
        if (canSkipHigherApproval) {
          updateData.skip_higher_approval = false
        }
        break
      case 'manager':
        if (!caseData?.approve_staff) {
          alert('申請者の承認が必要です')
          return
        }
        updateData = {
          approve_manager: now,
          oral_request_director: now
        }
        break
      case 'director':
        if (!caseData?.approve_manager) {
          alert('所長の承認が必要です')
          return
        }
        updateData = {
          approve_director: now,
          oral_request_president: now
        }
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
      console.error('エラー詳細:', error?.message, error?.details, error?.hint)
      alert(`承認に失敗しました: ${error?.message || error}`)
    } else {
      setMsg('承認しました（次の承認者に口頭で連絡してください）')
      await recordApprovalHistory(role, '承認して口頭で承認依頼')
      fetchCaseData()
      setTimeout(() => setMsg(null), 3000)
    }
  }

  const handleReject = async (role: string, rejectLineWorksId: string, rejectReason: string) => {
    if (caseData?.skip_higher_approval) {
      alert('申請不要モードのため、差戻は無効です')
      return
    }
    if (!rejectLineWorksId) {
      alert('差し戻し先の LINE WORKS ID を入力してください')
      return
    }

    const trimmedReason = rejectReason.trim()
    const confirmMessage = trimmedReason
      ? `本当に差し戻しますか？\n承認がクリアされ、担当者へ LINE WORKS で差戻通知が送信されます。\n\n差戻理由:\n${trimmedReason}`
      : '本当に差し戻しますか？\n承認がクリアされ、担当者へ LINE WORKS で差戻通知が送信されます。'

    if (!confirm(confirmMessage)) {
      return
    }

    let updateData: any = {}

    switch (role) {
      case 'manager':
        updateData = { approve_staff: null, approve_manager: null }   // ★ 自身の承認もクリア
        break
      case 'director':
        updateData = { approve_manager: null, approve_director: null } // ★ 自身の承認もクリア
        break
      case 'president':
        updateData = { approve_director: null, approve_president: null } // ★ 社長印をクリア
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
      const historyAction = trimmedReason ? `差戻: ${trimmedReason}` : '差戻'

      await recordApprovalHistory(role, historyAction)
      await sendRejectNotify(rejectLineWorksId, approvers.applicant?.name || '', trimmedReason)
      setMsg('差し戻しました。LINE WORKS で差戻通知を送信しました。')

      if (role === 'manager') setRejectReasonManager('')
      if (role === 'director') setRejectReasonDirector('')
      if (role === 'president') setRejectReasonPresident('')

      fetchCaseData()
    }

    setTimeout(() => setMsg(null), 3000)
  }

  const handleResendNotify = async (role: string) => {
    if (caseData?.skip_higher_approval) {
      alert('申請不要モードのため、通知送信は無効です')
      return
    }
    let lineWorksUserId = ''
    let staffName = ''

    switch (role) {
      case 'manager':
        lineWorksUserId = managerLineWorksId
        staffName = approvers.sectionHead?.name || ''
        break
      case 'director':
        lineWorksUserId = directorLineWorksId
        staffName = approvers.senmu?.name || ''
        break
      case 'president':
        lineWorksUserId = presidentLineWorksId
        staffName = approvers.shacho?.name || ''
        break
    }

    if (!lineWorksUserId) {
      alert('LINE WORKS ID を入力してください')
      return
    }

    await sendApprovalNotify(lineWorksUserId, staffName, true)
  }

  // ★ 承認取消処理
  const handleCancelApproval = async () => {
    if (!confirm('申請者の承認を取り消しますか？\n印章が削除され、承認前の状態に戻ります。')) {
      return
    }

    const { error } = await supabase
      .from('cases')
      .update({
        approve_staff: null,
        approve_manager: null,
        approve_director: null,
        approve_president: null,
        skip_higher_approval: null,
      })
      .eq('case_id', caseId)

    if (error) {
      console.error('承認取消エラー:', error)
      alert('承認取消に失敗しました')
    } else {
      setMsg('承認を取り消しました')
      await recordApprovalHistory('staff', '承認取消')
      fetchCaseData()
      setTimeout(() => setMsg(null), 2000)
    }
  }

  const sendApprovalNotify = async (lineWorksUserId: string, staffName: string, isResend: boolean = false) => {
    try {
      const response = await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineWorksUserId,
          staffName: staffName || undefined,
          caseId,
          caseNo: caseData?.case_no ?? null,
          subject: caseData?.subject || '件名不明',
          approvedBy: currentUser?.name || '担当者',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        alert(`LINE WORKS通知に失敗しました: ${result.error || '不明なエラー'}`)
      } else {
        const message = isResend ? '承認依頼を LINE WORKS に再送信しました' : '承認依頼を LINE WORKS に送信しました'
        const recipient = result.staffName || staffName || lineWorksUserId
        setMsg(`${message}: ${recipient}`)
        setTimeout(() => setMsg(null), 3000)
      }
    } catch (error) {
      alert('LINE WORKS 通知送信中にエラーが発生しました')
    }
  }

  const sendRejectNotify = async (lineWorksUserId: string, staffName: string, rejectReason: string) => {
    try {
      const response = await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineWorksUserId,
          staffName: staffName || undefined,
          caseId,
          caseNo: caseData?.case_no ?? null,
          subject: caseData?.subject || '件名不明',
          isReject: true,
          rejectReason,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        alert(`LINE WORKS通知に失敗しました: ${result.error || '不明なエラー'}`)
      }
    } catch (error) {
      console.error('差戻 LINE WORKS 通知送信失敗:', error)
      alert('LINE WORKS 通知送信中にエラーが発生しました')
    }
  }

  const subtotal = detailsData.reduce((sum, r) => sum + r.amount, 0)
  const totalCostAmount = detailsData.reduce((sum, r) => sum + ((r.cost_price || 0) * r.quantity), 0)
  const totalGrossProfit = subtotal - totalCostAmount
  const grossProfitRate = subtotal > 0 ? (totalGrossProfit / subtotal) * 100 : 0

  // DBにskip_higher_approvalカラムがない環境でも落ちないよう存在判定
  const canSkipHigherApproval = caseData ? ('skip_higher_approval' in caseData) : false

  const discount = caseData?.discount || 0
  const taxRate = caseData?.tax_rate || 0.1
  const subtotalAfterDiscount = subtotal - discount
  const taxAmount = Math.floor(subtotalAfterDiscount * taxRate)
  const totalAmount = subtotalAfterDiscount + taxAmount

  const getPriceBasisText = (row: CaseDetail) => {
    if (!row.price_rate || row.price_rate <= 0) return '-'
    const listPrice = row.retail_price && row.retail_price > 0 ? row.retail_price : null
    if (!listPrice) return `掛率: ${row.price_rate.toFixed(1)}%`
    return `定価: ${listPrice.toLocaleString()} / 掛率: ${row.price_rate.toFixed(1)}%`
  }

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
    remarks: d.remarks || undefined,
    exclude_from_total: d.exclude_from_total ?? false,
    unregistered_product: d.unregistered_product || undefined,
    comment: d.comment || undefined,
  }))

  // セクションをPrintEstimate用に整形
  const sections = sectionsData.map(s => ({
    id: s.id,
    name: s.name,
  }))

  const MAX_ROWS_PER_PAGE = 20 // ★ 追加: 見積PDFの1ページあたり行数

  const getApprovalStamps = () => ({
    staff: !!caseData?.approve_staff,
    manager: !!caseData?.approve_manager && !caseData?.skip_higher_approval,
    director: !!caseData?.approve_director && !caseData?.skip_higher_approval,
    president: !!caseData?.approve_president && !caseData?.skip_higher_approval,
  });

  const getApprovalStampUrls = () => ({
    staff: approvers.applicant?.stamp_path || null,
    manager: caseData?.skip_higher_approval ? null : approvers.sectionHead?.stamp_path || null,
    director: caseData?.skip_higher_approval ? null : approvers.senmu?.stamp_path || null,
    president: caseData?.skip_higher_approval ? null : approvers.shacho?.stamp_path || null,
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

  const getApproverCardStyle = (approved: boolean, oralRequested: boolean): React.CSSProperties => {
    if (approved) {
      return {
        padding: '12px 20px',
        backgroundColor: '#334155',
        border: '2px solid #3b82f6',
        borderRadius: 8,
        minWidth: 160,
      }
    }

    if (oralRequested) {
      return {
        padding: '12px 20px',
        backgroundColor: '#fff3cd',
        border: '2px solid #ffc107',
        borderRadius: 8,
        minWidth: 160,
      }
    }

    return {
      padding: '12px 20px',
      backgroundColor: '#fff',
      border: '2px solid #ddd',
      borderRadius: 8,
      minWidth: 160,
    }
  }

  const getApproverTextColors = (approved: boolean) => {
    return {
      label: { fontSize: 12, color: approved ? '#94a3b8' : '#666' },
      name: { fontWeight: 'bold', fontSize: 16, color: approved ? '#fff' : '#111827' },
      lineWorksId: { fontSize: 11, color: approved ? '#cbd5e1' : '#555' },
      approved: { fontSize: 11, color: approved ? '#93c5fd' : '#28a745' },
    }
  }

  const higherApprovalDisabled = !!caseData?.skip_higher_approval

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', fontSize: 12, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, color: '#fff' }}>案件詳細・承認 (ID: {caseId})</h1>
        <Link href="/cases/list">
          <button className="selector-button" style={{ padding: '8px 16px', color: '#fff' }}>
            ← 案件一覧に戻る
          </button>
        </Link>
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', backgroundColor: '#16a34a', color: '#fff', border: '1px solid #15803d', borderRadius: 4, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* ★ caseData がない場合の読み込み中表示 */}
      {!caseData && (
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
          読み込み中...
        </div>
      )}

      {/* ★ caseData がある場合のみ表示 */}
      {caseData && (
        <>
          {/* 印刷プレビューモーダル */}
          {showPrintPreview && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={closePrintPreview}>
              <div style={{ backgroundColor: '#1e293b', padding: 24, borderRadius: 12, maxWidth: '95vw', maxHeight: '95vh', overflow: 'auto', border: '1px solid #334155' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2 style={{ color: '#fff' }}>印刷プレビュー</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handlePrint} className="selector-button primary">🖨️ 印刷</button>
                    <button onClick={closePrintPreview} className="selector-button">✕ 閉じる</button>
                  </div>
                </div>
                <PrintEstimate
                  ref={printRef}
                  printRef={printRef}
                  layoutType={caseData?.layout_type || 'vertical'}
                  estimateNo={caseData?.case_no || ''}
                  estimateDate={caseData?.created_date || ''}
                  customerName={customerName}
                  honorific={honorific}
                  subject={caseData?.subject || ''}
                  deliveryDeadline={caseData?.delivery_deadline || ''}
                  deliveryPlace={caseData?.delivery_place || ''}
                  deliveryTerms={caseData?.delivery_terms || ''}
                  paymentTerms={caseData?.payment_terms || ''}
                  validityText={caseData?.validity_text || ''}
                  discount={caseData?.special_discount || 0}
                  taxRate={0.1}
                  subtotal={detailsData.reduce((sum, row) => sum + (row.amount || 0), 0)}
                  subtotalAfterDiscount={detailsData.reduce((sum, row) => sum + (row.amount || 0), 0) - (caseData?.special_discount || 0)}
                  taxAmount={(detailsData.reduce((sum, row) => sum + (row.amount || 0), 0) - (caseData?.special_discount || 0)) * 0.1}
                  totalAmount={(detailsData.reduce((sum, row) => sum + (row.amount || 0), 0) - (caseData?.special_discount || 0)) * 1.1}
                  MAX_ROWS_PER_PAGE={20}
                  rows={detailsData.map(d => ({
                    product_id: d.product_id || '',
                    item_name: d.product_name || '',
                    spec: d.spec || '',
                    unit: d.unit || '',
                    quantity: d.quantity || 0,
                    unit_price: d.unit_price || null,
                    amount: d.amount || 0,
                    cost_price: d.cost_price || 0,
                    section_id: d.section_id || null,
                    remarks: d.remarks || undefined,
                    exclude_from_total: d.exclude_from_total ?? false,
                    unregistered_product: d.unregistered_product || undefined,
                    comment: d.comment || undefined,
                  }))}
                  sections={sectionsData.map(s => ({
                    id: s.id || 0,
                    name: s.name || '',
                  }))}
                  approvalStamps={getApprovalStamps()}
                  stampUrls={getApprovalStampUrls()}
                />
              </div>
            </div>
          )}

          {/* 案件情報 */}
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #334155', borderRadius: 8, backgroundColor: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, color: '#93c5fd' }}>案件情報</h2>
              <button
                onClick={async () => {
                  const { error } = await supabase
                    .from('cases')
                    .update({
                      branch_manager: caseData.branch_manager,
                      final_approver: caseData.final_approver,
                    })
                    .eq('case_id', caseId)
                  if (error) {
                    alert('保存エラー: ' + error.message)
                  } else {
                    alert('営業所確認者と最終確認者を保存しました')
                  }
                }}
                className="btn-3d btn-primary"
                style={{ padding: '8px 16px', fontSize: 12 }}
              >
                💾 保存
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, color: '#cbd5e1' }}>
              <div><strong>見積番号:</strong> {caseData.case_no}</div>
              <div><strong>作成日:</strong> {caseData.created_date}</div>
              <div><strong>得意先名:</strong> {customerName}</div>
              <div><strong>担当者:</strong> {staffName}</div>
              <div><strong>件名:</strong> {caseData.subject}</div>
              <div><strong>ステータス:</strong> {getStatusText(caseData.status)}</div>
              <div><strong>納入場所:</strong> {caseData.delivery_place || '-'}</div>
              <div><strong>納期:</strong> {caseData.delivery_deadline || '-'}</div>
              <div><strong>納入条件:</strong> {caseData.delivery_terms || '-'}</div>
              <div><strong>有効期限:</strong> {caseData.validity_text || '-'}</div>
              <div><strong>支払条件:</strong> {caseData.payment_terms || '-'}</div>
              <div><strong>レイアウト:</strong> {caseData.layout_type === 'horizontal' ? '横様式' : '縦様式'}</div>
              <div style={{ gridColumn: '1 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ marginBottom: 8 }}><strong>営業所確認者:</strong></div>
                  <input
                    type="text"
                    value={caseData.branch_manager || ''}
                    onChange={(e) => setCaseData({ ...caseData, branch_manager: e.target.value })}
                    placeholder="営業所確認者名"
                    style={{ border: '1px solid #475569', padding: '8px 10px', width: '100%', backgroundColor: '#0f172a', color: '#cbd5e1', borderRadius: 6 }}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8 }}><strong>最終確認者:</strong></div>
                  <input
                    type="text"
                    value={caseData.final_approver || ''}
                    onChange={(e) => setCaseData({ ...caseData, final_approver: e.target.value })}
                    placeholder="最終確認者名"
                    style={{ border: '1px solid #475569', padding: '8px 10px', width: '100%', backgroundColor: '#0f172a', color: '#cbd5e1', borderRadius: 6 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 明細テーブル */}
          <h2 style={{ color: '#93c5fd' }}>明細</h2>
          {detailsData.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic' }}>明細データがありません</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr>
                  <th style={thStyle}>商品名</th>
                  {/* ★ 規格列を削除 */}
                  <th style={thStyle}>単価設定根拠</th>
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
                      <td style={tdStyle}>
                        {row.spec ? `${row.product_name || '-'} ${row.spec}` : (row.product_name || '-')}
                      </td>
                      <td style={tdStyle}>{getPriceBasisText(row)}</td>
                      <td style={tdStyle}>{row.quantity}</td>
                      <td style={tdStyle}>{row.unit_price ? row.unit_price.toLocaleString() : ''}</td>
                      <td style={tdStyle}>{row.amount.toLocaleString()}</td>
                      <td style={tdStyle}>{costPrice.toLocaleString()}</td>
                      <td style={tdStyle}>{costAmount.toLocaleString()}</td>
                      <td style={tdStyle}>{grossProfit.toLocaleString()}</td>
                      <td style={tdStyle}>{row.remarks || '-'}</td>
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
          <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: '#93c5fd' }}>承認フロー</h3>
            {/* 承認フローの表示（存在チェックを追加） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ padding: '12px 20px', backgroundColor: '#334155', border: '2px solid #3b82f6', borderRadius: 8, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>申請者</div>
                <div style={{ fontWeight: 'bold', fontSize: 16, color: '#fff' }}>{approvers.applicant?.name ?? '-'}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>LINE WORKS ID</div>
                <div style={{ fontSize: 11, color: '#cbd5e1' }}>{lwIdLabel(approvers.applicant?.name)}</div>
                {caseData?.oral_request_manager && !caseData?.approve_staff && <div style={{ fontSize: 11, color: '#ff6b6b' }}>📞 口頭依頼済</div>}
              </div>

              {approvers.sectionHead && (
                <>
                  <span style={{ fontSize: 24, color: '#999' }}>→</span>
                  <div style={getApproverCardStyle(!!caseData?.approve_manager, !!caseData?.oral_request_director)}>
                    <div style={getApproverTextColors(!!caseData?.approve_manager).label}>所長</div>
                    <div style={getApproverTextColors(!!caseData?.approve_manager).name}>{approvers.sectionHead.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>LINE WORKS ID</div>
                    <div style={getApproverTextColors(!!caseData?.approve_manager).lineWorksId}>{lwIdLabel(approvers.sectionHead.name)}</div>
                    {caseData?.approve_manager && <div style={getApproverTextColors(!!caseData?.approve_manager).approved}>✓ 承認済</div>}
                    {caseData?.oral_request_director && !caseData?.approve_manager && <div style={{ fontSize: 11, color: '#ff6b6b' }}>📞 口頭依頼済</div>}
                  </div>
                </>
              )}

              {approvers.senmu && (
                <>
                  <span style={{ fontSize: 24, color: '#999' }}>→</span>
                  <div style={getApproverCardStyle(!!caseData?.approve_director, !!caseData?.oral_request_president)}>
                    <div style={getApproverTextColors(!!caseData?.approve_director).label}>専務</div>
                    <div style={getApproverTextColors(!!caseData?.approve_director).name}>{approvers.senmu.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>LINE WORKS ID</div>
                    <div style={getApproverTextColors(!!caseData?.approve_director).lineWorksId}>{lwIdLabel(approvers.senmu.name)}</div>
                    {caseData?.approve_director && <div style={getApproverTextColors(!!caseData?.approve_director).approved}>✓ 承認済</div>}
                    {caseData?.oral_request_president && !caseData?.approve_director && <div style={{ fontSize: 11, color: '#ff6b6b' }}>📞 口頭依頼済</div>}
                  </div>
                </>
              )}

              {approvers.shacho && (
                <>
                  <span style={{ fontSize: 24, color: '#999' }}>→</span>
                  <div style={getApproverCardStyle(!!caseData?.approve_president, false)}>
                    <div style={getApproverTextColors(!!caseData?.approve_president).label}>社長</div>
                    <div style={getApproverTextColors(!!caseData?.approve_president).name}>{approvers.shacho.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>LINE WORKS ID</div>
                    <div style={getApproverTextColors(!!caseData?.approve_president).lineWorksId}>{lwIdLabel(approvers.shacho.name)}</div>
                    {caseData?.approve_president && <div style={getApproverTextColors(!!caseData?.approve_president).approved}>✓ 承認済</div>}
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
              <strong style={{ color: '#cbd5e1', fontSize: 13 }}>担当者の承認経路（マスタ・LINE WORKS ID）</strong>
              <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', lineHeight: 1.9 }}>
                <div>申請者: {approvers.applicant?.name || '—'} … {lwIdLabel(approvers.applicant?.name)}</div>
                {approvers.sectionHead ? (
                  <div>所長: {approvers.sectionHead.name} … {lwIdLabel(approvers.sectionHead.name)}</div>
                ) : (
                  <div>所長: 未設定</div>
                )}
                {approvers.senmu ? (
                  <div>専務: {approvers.senmu.name} … {lwIdLabel(approvers.senmu.name)}</div>
                ) : (
                  <div>専務: 未設定</div>
                )}
                {approvers.shacho ? (
                  <div>社長: {approvers.shacho.name} … {lwIdLabel(approvers.shacho.name)}</div>
                ) : (
                  <div>社長: 未設定</div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 13 }}>
              <strong>現在の状態:</strong>{' '}
              {!caseData?.approval_section_head && !caseData?.oral_request_manager && approvalFlow.sectionHead && `${approvalFlow.sectionHead}の承認待ち`}
              {caseData?.oral_request_manager && !caseData?.approve_staff && '申請者が口頭で所長に承認依頼予定'}
              {!caseData?.approval_section_head && !caseData?.approval_senmu && caseData?.oral_request_director && !caseData?.approve_manager && approvalFlow.senmu && `所長が口頭で${approvalFlow.senmu}に承認依頼予定`}
              {caseData?.approval_section_head && !caseData?.approval_senmu && !caseData?.oral_request_director && approvalFlow.senmu && `${approvalFlow.senmu}の承認待ち`}
              {!caseData?.approval_senmu && !caseData?.approval_shacho && caseData?.oral_request_president && !caseData?.approve_director && approvalFlow.shacho && `専務が口頭で${approvalFlow.shacho}に承認依頼予定`}
              {caseData?.approval_senmu && !caseData?.approval_shacho && !caseData?.oral_request_president && approvalFlow.shacho && `${approvalFlow.shacho}の承認待ち`}
              {caseData?.approval_shacho && '全承認完了'}
            </div>
          </div>

          {/* 承認履歴 */}
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #334155', borderRadius: 8, backgroundColor: '#1e293b' }}>
            <h3 style={{ marginTop: 0, color: '#93c5fd' }}>承認履歴</h3>
            {approvalHistory.length === 0 ? (
              <p style={{ color: '#64748b', fontStyle: 'italic' }}>承認アクションはまだありません</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>役割</th>
                    <th style={thStyle}>アクション</th>
                    <th style={thStyle}>実行日時</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalHistory.map((history, index) => {
                    const roleLabel: { [key: string]: string } = {
                      'staff': '申請者',
                      'manager': '所長',
                      'director': '専務',
                      'president': '社長',
                    }
                    return (
                      <tr key={index}>
                        <td style={tdStyle}>{roleLabel[history.role] || history.role}</td>
                        <td style={tdStyle}>{history.action}</td>
                        <td style={tdStyle}>{new Date(history.created_at).toLocaleString('ja-JP')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 承認操作 */}
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #334155', borderRadius: 8, backgroundColor: '#1e293b' }}>
            <h3 style={{ marginTop: 0, color: '#93c5fd' }}>承認操作</h3>

            {/* 申請者承認（申請不要 / 通常送信） */}
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#0f172a', borderRadius: 4, border: '1px solid #334155' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#cbd5e1' }}>申請者承認</h4>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#94a3b8' }}>
                <strong style={{ color: '#cbd5e1' }}>申請者:</strong> {approvers.applicant?.name || '-'}（{lwIdLabel(approvers.applicant?.name)}）
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <button
                  onClick={() => handleApproveOnly('staff')}
                  className="btn-3d"
                  disabled={!!caseData?.approve_staff}
                  style={{ backgroundColor: '#dc3545', color: '#fff', minWidth: 120 }}
                >
                  申請不要
                </button>
                <button
                  onClick={handleCancelApproval}
                  className="btn-3d"
                  disabled={!caseData?.approve_staff}
                  style={{ backgroundColor: '#6c757d', color: '#fff', minWidth: 120 }}
                >
                  承認取消
                </button>
                <button onClick={() => handleApprove('staff')} className="btn-3d" disabled={!!caseData?.approve_staff} style={{ backgroundColor: '#007bff', color: '#000' }}>✓ 承認して次へ送信</button>
                <button onClick={() => handleApproveWithOralRequest('staff')} className="btn-3d" disabled={!!caseData?.approve_staff} style={{ backgroundColor: '#6f42c1', color: '#fff' }}>📞 口頭で承認依頼</button>
                <button onClick={() => openPrintPreview('staff')} className="btn-3d" style={{ color: '#fff' }}>🖨️ 印刷</button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  value={managerLineWorksId}
                  onChange={(e) => setManagerLineWorksId(e.target.value)}
                  placeholder="所長 LINE WORKS ID（ログインメール）"
                  className="input-inset"
                  style={{ flex: 1 }}
                  disabled={!!caseData?.approve_staff}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                「申請不要」を押すと上位承認は無効化します。「承認して次へ送信」で通常の承認フローを継続できます。
              </div>
            </div>

            {/* 所長承認 */}
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#0f172a', borderRadius: 4, border: '1px solid #334155' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#cbd5e1' }}>所長承認</h4>
              {approvers.sectionHead && (
                <div style={{ marginBottom: 8, fontSize: 13, color: '#94a3b8' }}>
                  <strong style={{ color: '#cbd5e1' }}>所長:</strong> {approvers.sectionHead.name}（{lwIdLabel(approvers.sectionHead.name)}）
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  type="text"
                  value={directorLineWorksId}
                  onChange={(e) => setDirectorLineWorksId(e.target.value)}
                  placeholder="専務 LINE WORKS ID（ログインメール）"
                  className="input-inset"
                  style={{ flex: 1 }}
                  disabled={higherApprovalDisabled}
                />
                <button onClick={() => handleApproveOnly('manager')} className="btn-3d" disabled={higherApprovalDisabled || !!caseData?.approve_manager || !caseData?.approve_staff || !!caseData?.skip_higher_approval} style={{ backgroundColor: '#dc3545', color: '#fff' }}>✓ 承認</button>
                <button onClick={() => handleApprove('manager')} className="btn-3d" disabled={higherApprovalDisabled || !!caseData?.approve_manager || !caseData?.approve_staff || !!caseData?.skip_higher_approval} style={{ backgroundColor: '#007bff', color: '#000' }}>✓ 承認して次へ送信</button>
                <button onClick={() => handleApproveWithOralRequest('manager')} className="btn-3d" disabled={higherApprovalDisabled || !!caseData?.approve_manager || !caseData?.approve_staff || !!caseData?.skip_higher_approval} style={{ backgroundColor: '#6f42c1', color: '#fff' }}>📞 口頭で承認依頼</button>
                <button onClick={() => handleResendNotify('manager')} className="btn-3d" disabled={higherApprovalDisabled} style={{ color: '#fff' }}>💬 再通知</button>
                <button onClick={() => openPrintPreview('manager')} className="btn-3d" disabled={higherApprovalDisabled} style={{ color: '#fff' }}>🖨️ 印刷</button>
              </div>
              {approvers.senmu && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#28a745' }}>
                  次の承認者: {approvers.senmu.name}（{lwIdLabel(approvers.senmu.name)}）
                </div>
              )}
              <RejectControls
                lineWorksUserId={rejectLineWorksIdManager}
                onLineWorksUserIdChange={setRejectLineWorksIdManager}
                reason={rejectReasonManager}
                onReasonChange={setRejectReasonManager}
                onReject={() => handleReject('manager', rejectLineWorksIdManager, rejectReasonManager)}
                disabled={higherApprovalDisabled}
              />
            </div>

            {/* 専務承認 */}
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#0f172a', borderRadius: 4, border: '1px solid #334155' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#cbd5e1' }}>専務承認</h4>
              {approvers.senmu && (
                <div style={{ marginBottom: 8, fontSize: 13, color: '#94a3b8' }}>
                  <strong style={{ color: '#cbd5e1' }}>専務:</strong> {approvers.senmu.name}（{lwIdLabel(approvers.senmu.name)}）
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  type="text"
                  value={presidentLineWorksId}
                  onChange={(e) => setPresidentLineWorksId(e.target.value)}
                  placeholder="社長 LINE WORKS ID（ログインメール）"
                  className="input-inset"
                  style={{ flex: 1 }}
                  disabled={higherApprovalDisabled}
                />
                <button onClick={() => handleApproveOnly('director')} className="btn-3d" disabled={higherApprovalDisabled || !!caseData?.approve_director || !caseData?.approve_manager || !!caseData?.skip_higher_approval} style={{ backgroundColor: '#dc3545', color: '#fff' }}>✓ 承認</button>
                <button onClick={() => handleApprove('director')} className="btn-3d" disabled={higherApprovalDisabled || !!caseData?.approve_director || !caseData?.approve_manager || !!caseData?.skip_higher_approval} style={{ backgroundColor: '#007bff', color: '#000' }}>✓ 承認して次へ送信</button>
                <button onClick={() => handleApproveWithOralRequest('director')} className="btn-3d" disabled={higherApprovalDisabled || !!caseData?.approve_director || !caseData?.approve_manager || !!caseData?.skip_higher_approval} style={{ backgroundColor: '#6f42c1', color: '#fff' }}>📞 口頭で承認依頼</button>
                <button onClick={() => handleResendNotify('director')} className="btn-3d" disabled={higherApprovalDisabled} style={{ color: '#fff' }}>💬 再通知</button>
                <button onClick={() => openPrintPreview('director')} className="btn-3d" disabled={higherApprovalDisabled} style={{ color: '#fff' }}>🖨️ 印刷</button>
              </div>
              {approvers.shacho && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#28a745' }}>
                  次の承認者: {approvers.shacho.name}（{lwIdLabel(approvers.shacho.name)}）
                </div>
              )}
              <RejectControls
                lineWorksUserId={rejectLineWorksIdDirector}
                onLineWorksUserIdChange={setRejectLineWorksIdDirector}
                reason={rejectReasonDirector}
                onReasonChange={setRejectReasonDirector}
                onReject={() => handleReject('director', rejectLineWorksIdDirector, rejectReasonDirector)}
                disabled={higherApprovalDisabled}
              />
            </div>

            {/* 社長承認 */}
            <div style={{ padding: 12, backgroundColor: '#0f172a', borderRadius: 4, border: '1px solid #334155' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#cbd5e1' }}>社長承認</h4>
              {approvers.shacho && (
                <div style={{ marginBottom: 8, fontSize: 13, color: '#94a3b8' }}>
                  <strong style={{ color: '#cbd5e1' }}>社長:</strong> {approvers.shacho.name}（{lwIdLabel(approvers.shacho.name)}）
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <button onClick={() => handleApproveOnly('president')} className="btn-3d btn-primary" disabled={higherApprovalDisabled || !!caseData?.approve_president || !caseData?.approve_director || !!caseData?.skip_higher_approval} style={{ flex: 1 }}>✓ 最終承認</button>
                <button onClick={() => handleResendNotify('president')} className="btn-3d" disabled={higherApprovalDisabled} style={{ color: '#fff' }}>💬 再通知</button>
                <button onClick={() => openPrintPreview('president')} className="btn-3d" disabled={higherApprovalDisabled} style={{ color: '#fff' }}>🖨️ 印刷</button>
              </div>
              <RejectControls
                lineWorksUserId={rejectLineWorksIdPresident}
                onLineWorksUserIdChange={setRejectLineWorksIdPresident}
                reason={rejectReasonPresident}
                onReasonChange={setRejectReasonPresident}
                onReject={() => handleReject('president', rejectLineWorksIdPresident, rejectReasonPresident)}
                disabled={higherApprovalDisabled}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function RejectControls({
  lineWorksUserId,
  onLineWorksUserIdChange,
  reason,
  onReasonChange,
  onReject,
  disabled = false,
}: {
  lineWorksUserId: string
  onLineWorksUserIdChange: (value: string) => void
  reason: string
  onReasonChange: (value: string) => void
  onReject: () => void
  disabled?: boolean
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={lineWorksUserId}
          onChange={(e) => onLineWorksUserIdChange(e.target.value)}
          placeholder="差戻先 LINE WORKS ID（ログインメール）"
          className="input-inset"
          style={{ flex: 1 }}
          disabled={disabled}
        />
        <button
          onClick={onReject}
          className="btn-3d"
          style={{ backgroundColor: '#ffc107' }}
          disabled={disabled}
        >
          ↩️ 差戻
        </button>
      </div>
      <textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="差戻理由（任意・LINE WORKS通知と承認履歴に記載されます）"
        className="input-inset"
        rows={2}
        disabled={disabled}
        style={{
          width: '100%',
          marginTop: 8,
          resize: 'vertical',
          minHeight: 56,
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

const thStyle = {
  padding: '8px 12px',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  borderBottom: '2px solid #3b82f6',
  textAlign: 'left' as const,
  fontWeight: 'bold' as const,
  border: '1px solid #334155',
}

const tdStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid #334155',
  border: '1px solid #334155',
  backgroundColor: '#0f172a',
  color: '#cbd5e1',
  verticalAlign: 'top' as const,
}