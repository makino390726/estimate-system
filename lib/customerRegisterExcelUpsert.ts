import type { SupabaseClient } from '@supabase/supabase-js'
import {
    chunkArray,
    normalizeCustomerRegisterId,
    type ParseCustomerRegisterWorkbookResult,
} from '@/lib/customerRegisterExcelImport'

export type CustomerRegisterExcelUpsertResult = {
    batch_id: string | null
    inserted: number
    updated: number
    skipped: number
    skipped_details: { source_row_no: number; reason: string }[]
    errors: { source_row_no: number; reason: string }[]
    error_count: number
}

type ExistingRow = { id: string; manufacturing_no: string | null; serial_no: string | null }

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

/** 解析済み Excel 行を customer_register_rows に upsert（製造番号キー） */
export async function upsertParsedCustomerRegisterRows(
    sb: SupabaseClient,
    parsed: ParseCustomerRegisterWorkbookResult,
    options?: { sourceFileName?: string },
): Promise<CustomerRegisterExcelUpsertResult> {
    let batchId: string | null = null
    if (options?.sourceFileName) {
        const { data: batch, error: batchErr } = await sb
            .from('customer_register_import_batches')
            .insert({ source_file_name: options.sourceFileName })
            .select('id')
            .single()
        if (!batchErr && batch?.id) batchId = batch.id as string
    }

    const now = new Date().toISOString()
    const existing = await loadExistingByKeys(sb, parsed.rows.map((r) => r.upsert_key))

    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: string; payload: Record<string, unknown> }[] = []
    const dbErrors: { source_row_no: number; reason: string }[] = []

    for (const row of parsed.rows) {
        const existingId = findExistingId(existing, row.upsert_key)
        const payload: Record<string, unknown> = {
            ...row.payload,
            updated_at: now,
        }
        if (batchId) payload.import_batch_id = batchId

        if (existingId) {
            toUpdate.push({ id: existingId, payload })
        } else {
            toInsert.push({ ...payload, created_at: now })
        }
    }

    let inserted = 0
    let updated = 0

    for (const insertChunk of chunkArray(toInsert, 50)) {
        const { error } = await sb.from('customer_register_rows').insert(insertChunk)
        if (error) {
            for (const row of insertChunk) {
                const { error: oneErr } = await sb.from('customer_register_rows').insert(row)
                if (oneErr) {
                    dbErrors.push({
                        source_row_no: Number(row.source_row_no) || 0,
                        reason: oneErr.message,
                    })
                } else {
                    inserted += 1
                }
            }
        } else {
            inserted += insertChunk.length
        }
    }

    for (const { id, payload } of toUpdate) {
        const { error } = await sb.from('customer_register_rows').update(payload).eq('id', id)
        if (error) {
            dbErrors.push({
                source_row_no: Number(payload.source_row_no) || 0,
                reason: error.message,
            })
        } else {
            updated += 1
        }
    }

    return {
        batch_id: batchId,
        inserted,
        updated,
        skipped: parsed.skipped.length,
        skipped_details: parsed.skipped.slice(0, 30),
        errors: dbErrors.slice(0, 30),
        error_count: dbErrors.length,
    }
}
