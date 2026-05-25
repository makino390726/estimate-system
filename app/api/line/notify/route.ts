import { NextResponse } from 'next/server'
import { notifyStaffNewRepair, pushMessage } from '@/lib/lineClient'
import { isValidLineUserId } from '@/lib/lineUserId'
import { findStaffLineMapping } from '@/lib/lineStaffMappingDb'
import {
    isRepairStaffNotifyLineOaMode,
    REPAIR_STAFF_NOTIFY_POLICY_NOTE,
    repairStaffNotifyChannelLabel,
    getRepairStaffNotifyChannel,
} from '@/lib/repairStaffNotifyChannel'
import {
    notifyRepairCustomerLineStatus,
    notifyRepairCustomerOnCompleted,
} from '@/lib/repairCustomerLineNotify'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/**
 * LINE通知API
 *
 * 管理画面から呼び出して、担当者にLINE通知を送信する。
 *
 * POST /api/line/notify
 * Body:
 *   - type: 'new_repair' | 'status_change' | 'custom'
 *   - repair_request_id: string (修理案件ID)
 *   - staff_name?: string (通知先担当者名)
 *   - message?: string (カスタムメッセージ)
 *
 * 担当者のLINE紐付け:
 *   line_staff_mappings テーブルで staff_name ⇔ line_user_id を管理
 */

type NotifyBody = {
    type?: 'new_repair' | 'status_change' | 'custom'
    repair_request_id?: string
    staff_name?: string
    message?: string
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as NotifyBody
        const sb = getSupabaseAdmin()

        if (!body.type) {
            return NextResponse.json({ error: 'type is required' }, { status: 400 })
        }

        if (body.type === 'new_repair' && body.repair_request_id) {
            if (!isRepairStaffNotifyLineOaMode()) {
                const ch = getRepairStaffNotifyChannel()
                return NextResponse.json(
                    {
                        error:
                            `担当者向けの新規受付LINE通知は利用できません（現在: ${repairStaffNotifyChannelLabel(ch)}）。${REPAIR_STAFF_NOTIFY_POLICY_NOTE}`,
                    },
                    { status: 403 },
                )
            }
            const { data: repair } = await sb
                .from('repair_requests')
                .select('*')
                .eq('id', body.repair_request_id)
                .single()

            if (!repair) {
                return NextResponse.json({ error: 'Repair request not found' }, { status: 404 })
            }

            // 担当者のLINE IDを取得
            const staffName = String(body.staff_name || repair.assigned_staff || '').trim()
            if (!staffName) {
                return NextResponse.json({ error: 'No staff assigned' }, { status: 400 })
            }

            let mapping: { staff_name: string; line_user_id: string } | null = null
            try {
                mapping = await findStaffLineMapping(sb, staffName)
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e)
                return NextResponse.json({ error: message }, { status: 500 })
            }

            if (!mapping) {
                return NextResponse.json({
                    error: '担当者のLINE連携が未登録です。/line-staff-notify で登録してください',
                    staff_name: staffName,
                }, { status: 404 })
            }

            const photoCount = Array.isArray(repair.photo_urls) ? repair.photo_urls.length : 0
            await notifyStaffNewRepair(mapping.line_user_id, {
                repairRequestId: repair.id,
                requestNo: repair.request_no,
                customerName: repair.customer_name,
                symptom: repair.symptom,
                priority: repair.priority,
                model: repair.model,
                category: repair.category,
                customerAddress: repair.customer_address,
                customerPhone: repair.customer_phone,
                customerMobile: repair.customer_mobile,
                customerRegion: repair.customer_region,
                assignedBranch: repair.assigned_branch,
                assignedStaff: repair.assigned_staff,
                photoCount,
            })

            return NextResponse.json({ status: 'ok', notified: mapping.staff_name })
        }

        if (body.type === 'status_change' && body.repair_request_id) {
            const { data: repair } = await sb
                .from('repair_requests')
                .select('*')
                .eq('id', body.repair_request_id)
                .single()

            if (!repair) {
                return NextResponse.json({ error: 'Repair request not found' }, { status: 404 })
            }

            if (repair.status === 'completed' && isValidLineUserId(repair.line_user_id)) {
                const result = await notifyRepairCustomerOnCompleted(sb, repair.id)
                return NextResponse.json({ status: 'ok', line_customer_notify: result })
            }
            if (isValidLineUserId(repair.line_user_id) && repair.received_via === 'line') {
                await notifyRepairCustomerLineStatus(sb, repair.id)
            } else if (isValidLineUserId(repair.line_user_id)) {
                await pushMessage(
                    repair.line_user_id!,
                    `【修理進捗】受付番号 #${repair.request_no} / ステータス: ${repair.status}`,
                )
            }

            return NextResponse.json({ status: 'ok' })
        }

        if (body.type === 'custom' && body.message) {
            // 特定の担当者 or 顧客にカスタムメッセージ送信
            if (body.staff_name) {
                const mapping = await findStaffLineMapping(sb, body.staff_name)
                if (mapping?.line_user_id) {
                    await pushMessage(mapping.line_user_id, body.message)
                    return NextResponse.json({ status: 'ok', notified: mapping.staff_name })
                }
            }

            if (body.repair_request_id) {
                const { data: repair } = await sb
                    .from('repair_requests')
                    .select('line_user_id')
                    .eq('id', body.repair_request_id)
                    .single()

                if (repair?.line_user_id) {
                    await pushMessage(repair.line_user_id, body.message)
                    return NextResponse.json({ status: 'ok', notified: 'customer' })
                }
            }

            return NextResponse.json({ error: 'No recipient found' }, { status: 404 })
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    } catch (e: any) {
        console.error('LINE Notify error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
