import type { SupabaseClient } from '@supabase/supabase-js'
import {
    buildRepairDealerNameForCustomerRegister,
    getSheetTypeLabel,
    repairCategoryToSheetType,
} from '@/lib/customerRegisterSheetTypes'

export type CustomerRegisterCandidate = {
    id: string
    customer_name: string | null
    address: string | null
    phone: string | null
    mobile: string | null
    model: string | null
    serial_no: string | null
}

export type RepairCustomerRegisterSource = {
    customer_name: string
    customer_address?: string | null
    customer_phone?: string | null
    customer_mobile?: string | null
    category?: string | null
    model?: string | null
    serial_no?: string | null
    manufacturing_no?: string | null
    assigned_staff?: string | null
    received_via?: string | null
    notes?: string | null
}

function toNullable(v: unknown): string | null {
    if (v == null) return null
    const s = String(v).trim()
    return s || null
}

export function buildCustomerRegisterPayloadFromRepair(
    source: RepairCustomerRegisterSource,
): Record<string, unknown> {
    const name = source.customer_name.trim()
    const sheetType = repairCategoryToSheetType(source.category)
    return {
        customer_name: name,
        address: toNullable(source.customer_address),
        phone: toNullable(source.customer_phone),
        mobile: toNullable(source.customer_mobile),
        model: toNullable(source.model),
        serial_no: toNullable(source.serial_no),
        manufacturing_no: toNullable(source.manufacturing_no),
        sheet_name: getSheetTypeLabel(sheetType),
        sheet_type: sheetType,
        staff_name: toNullable(source.assigned_staff),
        dealer_name: buildRepairDealerNameForCustomerRegister({
            received_via: String(source.received_via || ''),
            notes: String(source.notes || ''),
            customer_phone: String(source.customer_phone || ''),
        }),
    }
}

export function hasCustomerRegisterSyncInfo(source: RepairCustomerRegisterSource): boolean {
    const name = source.customer_name.trim()
    if (!name) return false
    return Boolean(
        toNullable(source.customer_address) ||
            toNullable(source.customer_phone) ||
            toNullable(source.customer_mobile) ||
            toNullable(source.model) ||
            toNullable(source.serial_no),
    )
}

export type PrepareCustomerRegisterSyncResult =
    | { ok: false; error: string }
    | {
          ok: true
          mode: 'skip'
          message: string
      }
    | {
          ok: true
          mode: 'new' | 'exists'
          payload: Record<string, unknown>
          existingCustomers: CustomerRegisterCandidate[]
      }

export async function prepareCustomerRegisterSync(
    sb: SupabaseClient,
    source: RepairCustomerRegisterSource,
): Promise<PrepareCustomerRegisterSyncResult> {
    const name = source.customer_name.trim()
    if (!name) {
        return { ok: false, error: '顧客名を入力してください' }
    }
    if (!hasCustomerRegisterSyncInfo(source)) {
        return {
            ok: true,
            mode: 'skip',
            message: '住所・電話・型式・本体番号のいずれかを入力してください',
        }
    }

    const payload = buildCustomerRegisterPayloadFromRepair(source)
    const { data: existing, error } = await sb
        .from('customer_register_rows')
        .select('id, customer_name, address, phone, mobile, model, serial_no')
        .eq('customer_name', name)

    if (error) {
        return { ok: false, error: error.message }
    }

    const list = (existing || []) as CustomerRegisterCandidate[]
    return {
        ok: true,
        mode: list.length > 0 ? 'exists' : 'new',
        payload,
        existingCustomers: list,
    }
}

export type ApplyCustomerRegisterSyncResult =
    | { ok: false; error: string }
    | { ok: true; customer_register_id: string; message: string }

/** 新規登録または既存行更新し、修理案件に customer_register_id を紐づけ */
export async function applyCustomerRegisterSync(
    sb: SupabaseClient,
    repairRequestId: string,
    payload: Record<string, unknown>,
    action: 'insert' | 'update',
    targetCustomerRegisterId?: string,
): Promise<ApplyCustomerRegisterSyncResult> {
    const rid = repairRequestId.trim()
    if (!rid) {
        return { ok: false, error: 'repair_request_id is required' }
    }

    let registerId = targetCustomerRegisterId?.trim() || ''

    if (action === 'insert') {
        const { data, error } = await sb
            .from('customer_register_rows')
            .insert(payload)
            .select('id')
            .single()
        if (error) {
            return { ok: false, error: error.message }
        }
        registerId = String(data?.id || '')
    } else {
        if (!registerId) {
            return { ok: false, error: '更新対象の顧客登録IDが必要です' }
        }
        const { error } = await sb.from('customer_register_rows').update(payload).eq('id', registerId)
        if (error) {
            return { ok: false, error: error.message }
        }
    }

    if (!registerId) {
        return { ok: false, error: '顧客登録IDの取得に失敗しました' }
    }

    const { error: linkErr } = await sb
        .from('repair_requests')
        .update({ customer_register_id: registerId })
        .eq('id', rid)

    if (linkErr) {
        return { ok: false, error: linkErr.message }
    }

    return {
        ok: true,
        customer_register_id: registerId,
        message:
            action === 'insert'
                ? '顧客登録（カルテ）に新規登録し、案件に紐づけました'
                : '顧客登録（カルテ）を更新し、案件に紐づけました',
    }
}
