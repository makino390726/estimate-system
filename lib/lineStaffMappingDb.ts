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
