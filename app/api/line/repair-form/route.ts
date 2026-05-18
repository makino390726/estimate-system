import { NextResponse, after } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendRepairConfirmation, pushMessage } from '@/lib/lineClient'
import { notifyRepairRequestCreated } from '@/lib/repairStaffNotify'
import { repairCategoryToSheetType } from '@/lib/customerRegisterSheetTypes'
import {
    parseRepairFormPhotoEntries,
    type RepairPhotoUploadItem,
    uploadRepairRequestPhotos,
} from '@/lib/repairPhotoStorage'

export const runtime = 'nodejs'
/** 写真アップロード・LINE通知はバックグラウンドで行うため、受付レスポンスは先に返す */
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdiqyslnokscgcuoakle.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    return createClient(supabaseUrl, anonKey)
}

type RepairFormFields = {
    customer_name: string
    category: string | null
    model: string | null
    symptom: string
    symptom_category: string | null
    customer_phone: string | null
    customer_mobile: string | null
    customer_address: string | null
    customer_region: string | null
    notes: string | null
    assigned_branch: string | null
    assigned_staff: string | null
    line_user_id: string | null
    line_display_name: string | null
}

type InsertedRequest = { id: string; request_no: number }

function strField(fd: FormData, key: string): string {
    const v = fd.get(key)
    return typeof v === 'string' ? v.trim() : ''
}

function parseJsonFields(body: Record<string, unknown>): RepairFormFields | null {
    const customer_name = String(body.customer_name || '').trim()
    const symptom = String(body.symptom || '').trim()
    if (!customer_name || !symptom) return null
    return {
        customer_name,
        symptom,
        category: body.category ? repairCategoryToSheetType(String(body.category)) : null,
        model: body.model ? String(body.model).trim() || null : null,
        symptom_category: body.symptom_category ? String(body.symptom_category).trim() || null : null,
        customer_phone: body.customer_phone ? String(body.customer_phone).trim() || null : null,
        customer_mobile: body.customer_mobile ? String(body.customer_mobile).trim() || null : null,
        customer_address: body.customer_address ? String(body.customer_address).trim() || null : null,
        customer_region: body.customer_region ? String(body.customer_region).trim() || null : null,
        notes: body.notes ? String(body.notes).trim() || null : null,
        assigned_branch: body.assigned_branch ? String(body.assigned_branch).trim() || null : null,
        assigned_staff: body.assigned_staff ? String(body.assigned_staff).trim() || null : null,
        line_user_id: body.line_user_id ? String(body.line_user_id).trim() || null : null,
        line_display_name: body.line_display_name ? String(body.line_display_name).trim() || null : null,
    }
}

function parseMultipartFields(fd: FormData): RepairFormFields | null {
    const customer_name = strField(fd, 'customer_name')
    const symptom = strField(fd, 'symptom')
    if (!customer_name || !symptom) return null
    const categoryRaw = strField(fd, 'category')
    return {
        customer_name,
        symptom,
        category: categoryRaw ? repairCategoryToSheetType(categoryRaw) : null,
        model: strField(fd, 'model') || null,
        symptom_category: strField(fd, 'symptom_category') || null,
        customer_phone: strField(fd, 'customer_phone') || null,
        customer_mobile: strField(fd, 'customer_mobile') || null,
        customer_address: strField(fd, 'customer_address') || null,
        customer_region: strField(fd, 'customer_region') || null,
        notes: strField(fd, 'notes') || null,
        assigned_branch: strField(fd, 'assigned_branch') || null,
        assigned_staff: strField(fd, 'assigned_staff') || null,
        line_user_id: strField(fd, 'line_user_id') || null,
        line_display_name: strField(fd, 'line_display_name') || null,
    }
}

function buildInsertPayload(fields: RepairFormFields) {
    return {
        received_via: 'line',
        priority: 'normal',
        status: 'received',
        customer_name: fields.customer_name,
        category: fields.category,
        symptom: fields.symptom,
        symptom_category: fields.symptom_category,
        model: fields.model,
        customer_phone: fields.customer_phone,
        customer_mobile: fields.customer_mobile,
        customer_address: fields.customer_address,
        customer_region: fields.customer_region,
        assigned_branch: fields.assigned_branch,
        assigned_staff: fields.assigned_staff,
        line_user_id: fields.line_user_id,
        line_message_id: null,
        photo_urls: [] as string[],
        video_urls: [] as string[],
        notes: [
            fields.notes || '',
            `LINE LIFF フォーム受付 (表示名: ${fields.line_display_name || '不明'})`,
        ].filter(Boolean).join('\n'),
    }
}

async function insertRepairRequest(
    sb: SupabaseClient,
    fields: RepairFormFields,
): Promise<{ error: unknown; data: InsertedRequest | null }> {
    const { data, error } = await sb
        .from('repair_requests')
        .insert(buildInsertPayload(fields))
        .select('id, request_no')
        .single()

    if (error || !data) {
        return { error, data: null }
    }
    return { error: null, data }
}

async function sendLineConfirmation(
    fields: RepairFormFields,
    requestNo: number,
    photoCount: number,
) {
    if (!fields.line_user_id) return

    try {
        await sendRepairConfirmation(
            fields.line_user_id,
            requestNo,
            fields.symptom,
            fields.model ?? undefined,
        )
    } catch (e) {
        console.error('LIFF受付確認Flex送信エラー:', e)
        try {
            await pushMessage(
                fields.line_user_id,
                `修理依頼の送信が完了しました（受付番号: #${requestNo}）\n\n` +
                    `お名前: ${fields.customer_name}\n` +
                    (fields.model ? `型式: ${fields.model}\n` : '') +
                    `症状: ${fields.symptom}\n` +
                    (photoCount > 0 ? `写真: ${photoCount}枚\n` : '') +
                    '\n担当者より折り返しご連絡いたします。',
            )
        } catch (e2) {
            console.error('LIFFフォールバックpush送信エラー:', e2)
        }
    }
}

/** 受付レスポンス返却後に写真保存・LINE通知（失敗しても受付は維持） */
function schedulePostAcceptTasks(
    sb: SupabaseClient,
    fields: RepairFormFields,
    data: InsertedRequest,
    photoEntries: RepairPhotoUploadItem[],
) {
    after(async () => {
        let photoCount = 0
        try {
            if (photoEntries.length > 0) {
                const photo_urls = await uploadRepairRequestPhotos(sb, data.id, photoEntries)
                photoCount = photo_urls.length
                if (photo_urls.length > 0) {
                    const { error: upErr } = await sb
                        .from('repair_requests')
                        .update({ photo_urls })
                        .eq('id', data.id)
                    if (upErr) {
                        console.error('repair_requests photo_urls update error:', upErr)
                    }
                }
            }
        } catch (e) {
            console.error('background photo upload:', e)
        }

        notifyRepairRequestCreated(data.id)
        await sendLineConfirmation(fields, data.request_no, photoCount)
    })
}

function acceptAndRespond(
    sb: SupabaseClient,
    fields: RepairFormFields,
    data: InsertedRequest,
    photoEntries: RepairPhotoUploadItem[],
) {
    schedulePostAcceptTasks(sb, fields, data, photoEntries)
    return NextResponse.json({
        ok: true,
        request_no: data.request_no,
        id: data.id,
    })
}

export async function POST(request: Request) {
    try {
        const sb = getSupabase()
        const contentType = request.headers.get('content-type') || ''

        if (contentType.includes('multipart/form-data')) {
            const fd = await request.formData()
            const fields = parseMultipartFields(fd)
            if (!fields) {
                return NextResponse.json(
                    { error: 'お名前と症状は必須です' },
                    { status: 400 },
                )
            }

            const photoEntries = parseRepairFormPhotoEntries(fd)
            const { error, data } = await insertRepairRequest(sb, fields)
            if (error || !data) {
                console.error('LIFF repair-form INSERT error:', error)
                return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
            }

            return acceptAndRespond(sb, fields, data, photoEntries)
        }

        const body = await request.json()
        const fields = parseJsonFields(body)
        if (!fields) {
            return NextResponse.json(
                { error: 'お名前と症状は必須です' },
                { status: 400 },
            )
        }

        const { error, data } = await insertRepairRequest(sb, fields)
        if (error || !data) {
            console.error('LIFF repair-form INSERT error:', JSON.stringify({
                code: (error as { code?: string })?.code,
                message: (error as { message?: string })?.message,
            }))
            return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
        }

        return acceptAndRespond(sb, fields, data, [])
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        console.error('LIFF repair-form error:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
