import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveStaffName } from '@/lib/staffNameMatch'

export type StaffLineMappingRow = {
    id: string
    staff_name: string
    line_user_id: string
    line_display_name: string | null
    notify_enabled: boolean
    created_at?: string
    updated_at?: string
}

export async function listStaffLineMappings(sb: SupabaseClient) {
    return sb.from('line_staff_mappings').select('*').order('staff_name')
}

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

type LineMappingRow = { staff_name: string; line_user_id: string; notify_enabled?: boolean }

/** 担当者名（空白差異あり）から LINE 連携を解決 */
export async function findStaffLineMapping(
    sb: SupabaseClient,
    staffName: string,
): Promise<{ staff_name: string; line_user_id: string } | null> {
    const input = trim(staffName)
    if (!input) return null

    const { data, error } = await sb
        .from('line_staff_mappings')
        .select('staff_name, line_user_id, notify_enabled')
        .eq('notify_enabled', true)

    if (error) throw error

    const rows = (data || []) as LineMappingRow[]
    const valid = rows.filter((m) => trim(m.line_user_id).startsWith('U'))
    const mappingNames = valid.map((m) => trim(m.staff_name)).filter(Boolean)
    const resolved = resolveStaffName(input, mappingNames)
    if (!resolved) return null

    const row = valid.find((m) => trim(m.staff_name) === resolved)
    if (!row) return null
    return { staff_name: resolved, line_user_id: trim(row.line_user_id) }
}

/** 複数担当者の LINE 連携を一括解決 */
export async function findStaffLineMappingsForNames(
    sb: SupabaseClient,
    staffNames: string[],
): Promise<Array<{ staffName: string; lineUserId: string }>> {
    const unique = [...new Set(staffNames.map((n) => trim(n)).filter(Boolean))]
    if (unique.length === 0) return []

    const { data, error } = await sb
        .from('line_staff_mappings')
        .select('staff_name, line_user_id, notify_enabled')
        .eq('notify_enabled', true)

    if (error) throw error

    const rows = (data || []) as LineMappingRow[]
    const valid = rows.filter((m) => trim(m.line_user_id).startsWith('U'))
    const mappingNames = valid.map((m) => trim(m.staff_name)).filter(Boolean)
    const targets: Array<{ staffName: string; lineUserId: string }> = []

    for (const name of unique) {
        const resolved = resolveStaffName(name, mappingNames)
        if (!resolved) continue
        const row = valid.find((m) => trim(m.staff_name) === resolved)
        if (!row) continue
        targets.push({ staffName: resolved, lineUserId: trim(row.line_user_id) })
    }
    return targets
}

export async function upsertStaffLineMapping(
    sb: SupabaseClient,
    input: {
        staff_name?: string | null
        line_user_id?: string | null
        line_display_name?: string | null
    },
): Promise<{ ok: true; staff_name: string; line_user_id: string } | { ok: false; error: string; status: number }> {
    const staff_name = String(input.staff_name || '').trim()
    const line_user_id = String(input.line_user_id || '').trim()
    const line_display_name = input.line_display_name
        ? String(input.line_display_name).trim() || null
        : null

    if (!staff_name || !line_user_id) {
        return { ok: false, error: 'staff_name and line_user_id are required', status: 400 }
    }
    if (!line_user_id.startsWith('U')) {
        return { ok: false, error: 'Invalid LINE User ID', status: 400 }
    }

    const { data: staffRows, error: staffListErr } = await sb.from('staffs').select('name').order('name')
    if (staffListErr) {
        return { ok: false, error: staffListErr.message, status: 500 }
    }
    const staffNames = (staffRows || []).map((r) => String(r.name || '').trim()).filter(Boolean)
    const canonicalName = resolveStaffName(staff_name, staffNames)
    if (!canonicalName) {
        return {
            ok: false,
            error: `担当者「${staff_name}」が staffs に見つかりません`,
            status: 400,
        }
    }

    const { error } = await sb.from('line_staff_mappings').upsert(
        {
            staff_name: canonicalName,
            line_user_id,
            line_display_name,
            notify_enabled: true,
        },
        { onConflict: 'staff_name' },
    )

    if (error) {
        return { ok: false, error: error.message, status: 500 }
    }

    return { ok: true, staff_name: canonicalName, line_user_id }
}
