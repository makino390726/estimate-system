import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveStaffName } from '@/lib/staffNameMatch'

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

type LineWorksMappingRow = {
    staff_name: string
    lineworks_user_id: string
    notify_enabled?: boolean
}

export async function listLineWorksStaffMappings(sb: SupabaseClient) {
    return sb.from('lineworks_staff_mappings').select('*').order('staff_name')
}

export async function upsertLineWorksStaffMapping(
    sb: SupabaseClient,
    input: {
        staff_name?: string | null
        lineworks_user_id?: string | null
        display_name?: string | null
    },
): Promise<
    | { ok: true; staff_name: string; lineworks_user_id: string }
    | { ok: false; error: string; status: number }
> {
    const staff_name = String(input.staff_name || '').trim()
    const lineworks_user_id = String(input.lineworks_user_id || '').trim()
    const display_name = input.display_name ? String(input.display_name).trim() || null : null

    if (!staff_name || !lineworks_user_id) {
        return { ok: false, error: 'staff_name and lineworks_user_id are required', status: 400 }
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

    const { error } = await sb.from('lineworks_staff_mappings').upsert(
        {
            staff_name: canonicalName,
            lineworks_user_id,
            display_name,
            notify_enabled: true,
        },
        { onConflict: 'staff_name' },
    )

    if (error) {
        return { ok: false, error: error.message, status: 500 }
    }

    return { ok: true, staff_name: canonicalName, lineworks_user_id }
}

/** 担当者名（空白差異あり）から LINE WORKS 連携を解決 */
export async function findLineWorksStaffMapping(
    sb: SupabaseClient,
    staffName: string,
): Promise<{ staff_name: string; lineworks_user_id: string } | null> {
    const targets = await findLineWorksStaffMappingsForNames(sb, [staffName])
    return targets[0] ? { staff_name: targets[0].staffName, lineworks_user_id: targets[0].lineWorksUserId } : null
}

export async function findLineWorksStaffMappingsForNames(
    sb: SupabaseClient,
    staffNames: string[],
): Promise<Array<{ staffName: string; lineWorksUserId: string }>> {
    const unique = [...new Set(staffNames.map((n) => trim(n)).filter(Boolean))]
    if (unique.length === 0) return []

    const { data, error } = await sb
        .from('lineworks_staff_mappings')
        .select('staff_name, lineworks_user_id, notify_enabled')
        .eq('notify_enabled', true)

    if (error) throw error

    const rows = (data || []) as LineWorksMappingRow[]
    const valid = rows.filter((m) => trim(m.lineworks_user_id))
    const mappingNames = valid.map((m) => trim(m.staff_name)).filter(Boolean)
    const targets: Array<{ staffName: string; lineWorksUserId: string }> = []

    for (const name of unique) {
        const resolved = resolveStaffName(name, mappingNames)
        if (!resolved) continue
        const row = valid.find((m) => trim(m.staff_name) === resolved)
        if (!row) continue
        targets.push({ staffName: resolved, lineWorksUserId: trim(row.lineworks_user_id) })
    }
    return targets
}
