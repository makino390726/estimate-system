import type { SupabaseClient } from '@supabase/supabase-js'
import { chunkArray, normalizeCustomerRegisterId } from '@/lib/customerRegisterExcelImport'
import { getSheetTypeLabel, repairCategoryToSheetType } from '@/lib/customerRegisterSheetTypes'
import { isValidLineUserId } from '@/lib/lineUserId'

export type LineCustomerMachineInput = {
    sheet_type: string
    manufacturing_no?: string | null
    serial_no?: string | null
    model?: string | null
    model_no?: string | null
    outlet_type?: string | null
    burner_no?: string | null
    /** 製造番号は後で登録（機種のみ先に保存） */
    pending_serial?: boolean
}

export type LineCustomerRegisterInput = {
    line_user_id: string
    line_display_name?: string | null
    customer_name: string
    phone?: string | null
    mobile?: string | null
    postal_code?: string | null
    address?: string | null
    machines: LineCustomerMachineInput[]
}

export type LineCustomerRegisterResult = {
    ok: true
    inserted: number
    updated: number
    pending: number
    skipped: number
    skipped_details: { index: number; reason: string }[]
    register_ids: string[]
    line_mapping_id: string | null
    contact_only: boolean
}

type ExistingRow = { id: string; manufacturing_no: string | null; serial_no: string | null }

function toNullable(v: unknown): string | null {
    if (v == null) return null
    const s = String(v).trim()
    return s || null
}

function resolveUpsertKey(machine: LineCustomerMachineInput): string | null {
    if (machine.pending_serial) return null
    const mfg = normalizeCustomerRegisterId(machine.manufacturing_no || '')
    if (mfg) return mfg
    const serial = normalizeCustomerRegisterId(machine.serial_no || '')
    return serial || null
}

function isPendingMachine(machine: LineCustomerMachineInput): boolean {
    if (machine.pending_serial) return true
    return !resolveUpsertKey(machine)
}

function pendingMachineKey(machine: LineCustomerMachineInput): string {
    const sheetType = repairCategoryToSheetType(machine.sheet_type)
    const model = toNullable(machine.model) || '-'
    return `${sheetType}|${model}`
}

function findExistingId(existing: ExistingRow[], upsertKey: string): string | null {
    const normalizedKey = normalizeCustomerRegisterId(upsertKey)
    const byMfg = existing.find((r) => normalizeCustomerRegisterId(r.manufacturing_no) === normalizedKey)
    if (byMfg) return byMfg.id
    const bySerial = existing.find((r) => normalizeCustomerRegisterId(r.serial_no) === normalizedKey)
    return bySerial?.id ?? null
}

async function loadExistingByKeys(sb: SupabaseClient, keys: string[]): Promise<ExistingRow[]> {
    const uniqueKeys = [...new Set(keys.filter(Boolean))]
    const found: ExistingRow[] = []
    const seenIds = new Set<string>()

    for (const keyChunk of chunkArray(uniqueKeys, 80)) {
        const [{ data: byMfg }, { data: bySerial }] = await Promise.all([
            sb.from('customer_register_rows').select('id, manufacturing_no, serial_no').in('manufacturing_no', keyChunk),
            sb.from('customer_register_rows').select('id, manufacturing_no, serial_no').in('serial_no', keyChunk),
        ])
        for (const row of [...(byMfg || []), ...(bySerial || [])] as ExistingRow[]) {
            if (!seenIds.has(row.id)) {
                seenIds.add(row.id)
                found.push(row)
            }
        }
    }
    return found
}

function buildAddressWithPostal(postal: string | null | undefined, address: string | null | undefined): string | null {
    const p = toNullable(postal)
    const a = toNullable(address)
    if (p && a) return `〒${p} ${a}`
    return a || (p ? `〒${p}` : null)
}

function buildMachinePayload(
    input: LineCustomerRegisterInput,
    machine: LineCustomerMachineInput,
    machineIndex: number,
    options?: { pendingSerial?: boolean },
): Record<string, unknown> {
    const sheetType = repairCategoryToSheetType(machine.sheet_type)
    const pending = options?.pendingSerial ?? isPendingMachine(machine)
    const mfg = pending ? null : toNullable(machine.manufacturing_no)
    const serial = pending ? null : (toNullable(machine.serial_no) || mfg)
    const rawData: Record<string, string> = {
        registration_source: 'line_friend',
        line_user_id: input.line_user_id,
    }
    if (pending) {
        rawData.pending_manufacturing_no = 'true'
        rawData.pending_key = pendingMachineKey(machine)
    }
    if (input.line_display_name) rawData.line_display_name = input.line_display_name
    if (input.postal_code) rawData.postal_code = input.postal_code

    return {
        sheet_name: `LINE登録-${getSheetTypeLabel(sheetType)}`,
        sheet_type: sheetType,
        source_row_no: machineIndex + 1,
        customer_name: input.customer_name.trim(),
        address: buildAddressWithPostal(input.postal_code, input.address),
        phone: toNullable(input.phone),
        mobile: toNullable(input.mobile),
        model: toNullable(machine.model),
        model_no: toNullable(machine.model_no),
        serial_no: serial,
        manufacturing_no: mfg || serial,
        outlet_type: toNullable(machine.outlet_type),
        burner_no: toNullable(machine.burner_no),
        dealer_name: pending ? 'LINE友だち登録（製造番号後日）' : 'LINE友だち登録',
        raw_data: rawData,
    }
}

async function loadPendingRowsForLineUser(
    sb: SupabaseClient,
    lineUserId: string,
): Promise<Array<{ id: string; sheet_type: string | null; model: string | null; raw_data: Record<string, string> | null }>> {
    const { data } = await sb
        .from('customer_register_rows')
        .select('id, sheet_type, model, raw_data')
        .contains('raw_data', { line_user_id: lineUserId, pending_manufacturing_no: 'true' })
        .limit(50)
    return (data || []) as Array<{ id: string; sheet_type: string | null; model: string | null; raw_data: Record<string, string> | null }>
}

function findPendingRowId(
    pendingRows: Array<{ id: string; raw_data: Record<string, string> | null }>,
    pendingKey: string,
): string | null {
    const hit = pendingRows.find((r) => r.raw_data?.pending_key === pendingKey)
    return hit?.id ?? null
}

export function validateLineCustomerRegisterInput(input: LineCustomerRegisterInput): string | null {
    if (!isValidLineUserId(input.line_user_id)) {
        return 'LINEユーザーIDを取得できませんでした。LINEアプリから開き直してください。'
    }
    if (!input.customer_name.trim()) {
        return '氏名を入力してください'
    }
    if (!toNullable(input.phone) && !toNullable(input.mobile)) {
        return '電話番号（固定または携帯）を入力してください'
    }
    for (let i = 0; i < input.machines.length; i++) {
        const m = input.machines[i]
        if (!String(m.sheet_type || '').trim()) {
            return `機械${i + 1}：機種を選択してください`
        }
    }
    const keys = input.machines.map(resolveUpsertKey).filter(Boolean) as string[]
    const dup = keys.find((k, idx) => keys.indexOf(k) !== idx)
    if (dup) {
        return `同じ製造番号が複数入力されています（${dup}）`
    }
    return null
}

/** LIFF からの顧客情報＋複数機械を customer_register_rows に upsert */
export async function upsertLineCustomerRegister(
    sb: SupabaseClient,
    input: LineCustomerRegisterInput,
): Promise<LineCustomerRegisterResult> {
    const validationError = validateLineCustomerRegisterInput(input)
    if (validationError) {
        throw new Error(validationError)
    }

    const keys = input.machines.map((m) => resolveUpsertKey(m)).filter(Boolean) as string[]
    const existing = keys.length > 0 ? await loadExistingByKeys(sb, keys) : []
    const pendingExisting = await loadPendingRowsForLineUser(sb, input.line_user_id)
    const now = new Date().toISOString()

    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: string; payload: Record<string, unknown> }[] = []
    const skipped_details: { index: number; reason: string }[] = []
    const registerIds: string[] = []
    let pending = 0

    input.machines.forEach((machine, index) => {
        const upsertKey = resolveUpsertKey(machine)
        const pendingSerial = isPendingMachine(machine)

        if (pendingSerial) {
            const payload = {
                ...buildMachinePayload(input, machine, index, { pendingSerial: true }),
                updated_at: now,
            }
            const pendingKey = pendingMachineKey(machine)
            const existingPendingId = findPendingRowId(pendingExisting, pendingKey)
            if (existingPendingId) {
                toUpdate.push({ id: existingPendingId, payload })
                registerIds.push(existingPendingId)
            } else {
                toInsert.push({ ...payload, created_at: now })
            }
            return
        }

        if (!upsertKey) {
            skipped_details.push({ index, reason: '製造番号が空です' })
            return
        }
        const payload = {
            ...buildMachinePayload(input, machine, index),
            updated_at: now,
        }
        const existingId = findExistingId(existing, upsertKey)
        if (existingId) {
            toUpdate.push({ id: existingId, payload })
            registerIds.push(existingId)
        } else {
            toInsert.push({ ...payload, created_at: now })
        }
    })

    let inserted = 0
    let updated = 0

    for (const row of toInsert) {
        const isPendingRow = (row.raw_data as Record<string, string> | undefined)?.pending_manufacturing_no === 'true'
        const { data, error } = await sb.from('customer_register_rows').insert(row).select('id').single()
        if (error) {
            skipped_details.push({
                index: Number(row.source_row_no) - 1,
                reason: error.message,
            })
        } else if (data?.id) {
            if (isPendingRow) pending += 1
            else inserted += 1
            registerIds.push(String(data.id))
        }
    }

    for (const { id, payload } of toUpdate) {
        const isPendingRow = (payload.raw_data as Record<string, string> | undefined)?.pending_manufacturing_no === 'true'
        const { error } = await sb.from('customer_register_rows').update(payload).eq('id', id)
        if (error) {
            skipped_details.push({ index: Number(payload.source_row_no) - 1, reason: error.message })
        } else {
            if (isPendingRow) pending += 1
            else updated += 1
        }
    }

    const primaryRegisterId = registerIds[0] || null
    let lineMappingId: string | null = null

    const mappingPayload = {
        line_user_id: input.line_user_id,
        line_display_name: toNullable(input.line_display_name),
        customer_name: input.customer_name.trim(),
        customer_phone: toNullable(input.phone) || toNullable(input.mobile),
        customer_register_id: primaryRegisterId,
        last_message_at: now,
    }

    const { data: mapping, error: mapErr } = await sb
        .from('line_customer_mappings')
        .upsert(mappingPayload, { onConflict: 'line_user_id' })
        .select('id')
        .single()

    if (!mapErr && mapping?.id) {
        lineMappingId = String(mapping.id)
    }

    return {
        ok: true,
        inserted,
        updated,
        pending,
        skipped: skipped_details.length,
        skipped_details: skipped_details.slice(0, 20),
        register_ids: registerIds,
        line_mapping_id: lineMappingId,
        contact_only: input.machines.length === 0,
    }
}

export type LineCustomerPrefill = {
    customer_name: string | null
    phone: string | null
    mobile: string | null
    postal_code: string | null
    address: string | null
    machines: Array<{
        id: string
        sheet_type: string
        manufacturing_no: string | null
        serial_no: string | null
        model: string | null
    }>
}

/** 再登録時のプリフィル用：LINE ID に紐づく既存カルテ行を取得 */
export async function loadLineCustomerPrefill(
    sb: SupabaseClient,
    lineUserId: string,
): Promise<LineCustomerPrefill | null> {
    if (!isValidLineUserId(lineUserId)) return null

    const { data: mapping } = await sb
        .from('line_customer_mappings')
        .select('customer_name, customer_phone, customer_register_id')
        .eq('line_user_id', lineUserId)
        .maybeSingle()

    const { data: rows } = await sb
        .from('customer_register_rows')
        .select('id, sheet_type, manufacturing_no, serial_no, model, customer_name, phone, mobile, address, raw_data')
        .contains('raw_data', { line_user_id: lineUserId })
        .order('updated_at', { ascending: false })
        .limit(20)

    const machineRows = (rows || []) as Array<{
        id: string
        sheet_type: string | null
        manufacturing_no: string | null
        serial_no: string | null
        model: string | null
        customer_name: string | null
        phone: string | null
        mobile: string | null
        address: string | null
        raw_data: Record<string, string> | null
    }>

    if (!mapping && machineRows.length === 0) return null

    const first = machineRows[0]
    const raw = first?.raw_data || {}
    let postal_code = raw.postal_code || null
    let address = first?.address || null
    if (address?.startsWith('〒') && !postal_code) {
        const m = address.match(/^〒(\d{3}-?\d{4})\s*(.*)$/)
        if (m) {
            postal_code = m[1]
            address = m[2] || address
        }
    }

    return {
        customer_name: mapping?.customer_name || first?.customer_name || null,
        phone: first?.phone || mapping?.customer_phone || null,
        mobile: first?.mobile || null,
        postal_code,
        address,
        machines: machineRows.map((r) => ({
            id: r.id,
            sheet_type: r.sheet_type || 'unknown',
            manufacturing_no: r.manufacturing_no,
            serial_no: r.serial_no,
            model: r.model,
        })),
    }
}
