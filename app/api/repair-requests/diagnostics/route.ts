import { NextResponse } from 'next/server'
import { getLineConfig } from '@/lib/lineClient'
import { isLineWorksConfigured } from '@/lib/lineWorksClient'
import { hasSupabaseServiceRole, getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/** 完了報告が動かないときのサーバー側診断（認証不要・秘密は返さない） */
export async function GET() {
    const line = getLineConfig()
    const sb = getSupabaseAdmin()

    let repairTableOk = true
    let repairTableError: string | null = null
    const { error: tblErr } = await sb.from('repair_requests').select('id, status').limit(1)
    if (tblErr) {
        repairTableOk = false
        repairTableError = tblErr.message
    }

    let statusConstraintHint: string | null = null
    if (hasSupabaseServiceRole() && repairTableOk) {
        const fakeId = '00000000-0000-0000-0000-000000000099'
        const { error: probeErr } = await sb
            .from('repair_requests')
            .update({ status: 'completed' })
            .eq('id', fakeId)
        if (probeErr && /check|constraint/i.test(probeErr.message)) {
            statusConstraintHint = probeErr.message
        }
    }

    return NextResponse.json({
        ok: hasSupabaseServiceRole() && Boolean(line.channelAccessToken) && repairTableOk,
        supabase_service_role: hasSupabaseServiceRole(),
        line_channel_access_token: Boolean(line.channelAccessToken),
        line_channel_secret: Boolean(line.channelSecret),
        lineworks_configured: isLineWorksConfigured(),
        repair_requests_readable: repairTableOk,
        repair_requests_error: repairTableError,
        status_constraint_probe: statusConstraintHint,
        vercel_env: process.env.VERCEL_ENV || null,
        git_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
        production_url: 'https://estimate-system-ten.vercel.app',
        hints: [
            !hasSupabaseServiceRole()
                ? 'SUPABASE_SERVICE_ROLE_KEY 未設定 → 完了報告のDB更新ができません'
                : null,
            !line.channelAccessToken
                ? 'LINE_CHANNEL_ACCESS_TOKEN 未設定 → 顧客へ完了報告が送れません'
                : null,
            statusConstraintHint
                ? `status制約エラーの可能性: ${statusConstraintHint} → apply_repair_prerequisites.sql を実行`
                : null,
            !repairTableOk ? `repair_requests 参照エラー: ${repairTableError}` : null,
        ].filter((h): h is string => Boolean(h)),
    })
}
