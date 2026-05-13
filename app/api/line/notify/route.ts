import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyStaffNewRepair, pushMessage } from '@/lib/lineClient'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdiqyslnokscgcuoakle.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkaXF5c2xub2tzY2djdW9ha2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTQyMDMsImV4cCI6MjA3Nzk3MDIwM30.aGgaWQvsNhlnh6GO7wAgbTcL9JFpvT2xKnUQMZcnZuk'
    return createClient(supabaseUrl, anonKey)
}

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
        const sb = getSupabase()

        if (!body.type) {
            return NextResponse.json({ error: 'type is required' }, { status: 400 })
        }

        if (body.type === 'new_repair' && body.repair_request_id) {
            const { data: repair } = await sb
                .from('repair_requests')
                .select('*')
                .eq('id', body.repair_request_id)
                .single()

            if (!repair) {
                return NextResponse.json({ error: 'Repair request not found' }, { status: 404 })
            }

            // 担当者のLINE IDを取得
            const staffName = body.staff_name || repair.assigned_staff
            if (!staffName) {
                return NextResponse.json({ error: 'No staff assigned' }, { status: 400 })
            }

            const { data: mapping } = await sb
                .from('line_staff_mappings')
                .select('line_user_id')
                .eq('staff_name', staffName)
                .single()

            if (!mapping?.line_user_id) {
                return NextResponse.json({ error: 'Staff LINE mapping not found', staff_name: staffName }, { status: 404 })
            }

            await notifyStaffNewRepair(
                mapping.line_user_id,
                repair.request_no,
                repair.customer_name,
                repair.symptom,
                repair.priority,
                repair.model,
            )

            return NextResponse.json({ status: 'ok', notified: staffName })
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

            // 顧客にステータス変更を通知
            if (repair.line_user_id) {
                const statusLabels: Record<string, string> = {
                    received: '受付完了',
                    confirming: '確認中',
                    phone_done: '電話対応済み',
                    visit_scheduled: '出張訪問予定',
                    parts_waiting: '部品手配中',
                    repairing: '修理作業中',
                    completed: '修理完了',
                    billed: '請求書送付済み',
                    closed: '対応完了',
                }

                const statusText = statusLabels[repair.status] || repair.status
                const text = [
                    `【修理進捗のお知らせ】`,
                    `受付番号: #${repair.request_no}`,
                    `ステータス: ${statusText}`,
                    '',
                    repair.status === 'visit_scheduled' && repair.visit_scheduled_date
                        ? `出張予定日: ${repair.visit_scheduled_date}`
                        : null,
                    repair.status === 'completed'
                        ? '修理が完了いたしました。ご利用ありがとうございます。'
                        : null,
                ].filter(Boolean).join('\n')

                await pushMessage(repair.line_user_id, text)
            }

            return NextResponse.json({ status: 'ok' })
        }

        if (body.type === 'custom' && body.message) {
            // 特定の担当者 or 顧客にカスタムメッセージ送信
            if (body.staff_name) {
                const { data: mapping } = await sb
                    .from('line_staff_mappings')
                    .select('line_user_id')
                    .eq('staff_name', body.staff_name)
                    .single()

                if (mapping?.line_user_id) {
                    await pushMessage(mapping.line_user_id, body.message)
                    return NextResponse.json({ status: 'ok', notified: body.staff_name })
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
