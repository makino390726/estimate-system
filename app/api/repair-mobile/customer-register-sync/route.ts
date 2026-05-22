import { NextResponse } from 'next/server'
import {
    applyCustomerRegisterSync,
    buildCustomerRegisterPayloadFromRepair,
    prepareCustomerRegisterSync,
    type RepairCustomerRegisterSource,
} from '@/lib/repairCustomerRegisterSync'
import { getRepairAdminSupabase } from '@/lib/repairStatusUpdate'

export const runtime = 'nodejs'

type Body = {
    action?: 'prepare' | 'apply'
    repair_request_id?: string
    sync_action?: 'insert' | 'update'
    target_customer_register_id?: string
    customer_name?: string
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

async function loadSource(sb: ReturnType<typeof getRepairAdminSupabase>, body: Body): Promise<
    | { ok: false; error: string; status: number }
    | { ok: true; repairId: string; source: RepairCustomerRegisterSource }
> {
    const repairId = String(body.repair_request_id || '').trim()
    if (!repairId) {
        return { ok: false, error: 'repair_request_id is required', status: 400 }
    }

    const { data: repair, error } = await sb.from('repair_requests').select('*').eq('id', repairId).single()
    if (error || !repair) {
        return { ok: false, error: '案件が見つかりません', status: 404 }
    }

    const source: RepairCustomerRegisterSource = {
        customer_name:
            body.customer_name !== undefined ? String(body.customer_name) : repair.customer_name,
        customer_address:
            body.customer_address !== undefined ? body.customer_address : repair.customer_address,
        customer_phone: body.customer_phone !== undefined ? body.customer_phone : repair.customer_phone,
        customer_mobile:
            body.customer_mobile !== undefined ? body.customer_mobile : repair.customer_mobile,
        category: body.category !== undefined ? body.category : repair.category,
        model: body.model !== undefined ? body.model : repair.model,
        serial_no: body.serial_no !== undefined ? body.serial_no : repair.serial_no,
        manufacturing_no:
            body.manufacturing_no !== undefined ? body.manufacturing_no : repair.manufacturing_no,
        assigned_staff:
            body.assigned_staff !== undefined ? body.assigned_staff : repair.assigned_staff,
        received_via: body.received_via !== undefined ? body.received_via : repair.received_via,
        notes: body.notes !== undefined ? body.notes : repair.notes,
    }

    return { ok: true, repairId, source }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as Body
        const sb = getRepairAdminSupabase()

        if (body.action === 'prepare') {
            const loaded = await loadSource(sb, body)
            if (!loaded.ok) {
                return NextResponse.json({ error: loaded.error }, { status: loaded.status })
            }

            const result = await prepareCustomerRegisterSync(sb, loaded.source)
            if (!result.ok) {
                return NextResponse.json({ error: result.error }, { status: 400 })
            }

            if (result.mode === 'skip') {
                return NextResponse.json({ ok: true, mode: 'skip', message: result.message })
            }

            return NextResponse.json({
                ok: true,
                mode: result.mode,
                existingCustomers: result.existingCustomers,
                preview: result.payload,
            })
        }

        if (body.action === 'apply') {
            const loaded = await loadSource(sb, body)
            if (!loaded.ok) {
                return NextResponse.json({ error: loaded.error }, { status: loaded.status })
            }

            const syncAction = body.sync_action
            if (syncAction !== 'insert' && syncAction !== 'update') {
                return NextResponse.json({ error: 'sync_action must be insert or update' }, { status: 400 })
            }

            const payload = buildCustomerRegisterPayloadFromRepair(loaded.source)
            const applied = await applyCustomerRegisterSync(
                sb,
                loaded.repairId,
                payload,
                syncAction,
                body.target_customer_register_id,
            )

            if (!applied.ok) {
                return NextResponse.json({ error: applied.error }, { status: 400 })
            }

            return NextResponse.json({
                ok: true,
                customer_register_id: applied.customer_register_id,
                message: applied.message,
            })
        }

        return NextResponse.json({ error: 'action must be prepare or apply' }, { status: 400 })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('customer-register-sync:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
