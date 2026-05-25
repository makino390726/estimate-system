import { NextResponse } from 'next/server'
import { getBotChannelInfo, getLineConfig, getProfileWithStatus } from '@/lib/lineClient'
import { isValidLineUserId } from '@/lib/lineUserId'
import { isLineWorksConfigured } from '@/lib/lineWorksClient'
import { hasSupabaseServiceRole, getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/** 完了報告が動かないときのサーバー側診断（認証不要・秘密は返さない） */
export async function GET(request: Request) {
    const repairId = new URL(request.url).searchParams.get('repair_id')?.trim() || ''
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

    const lineBotInfo =
        line.channelAccessToken ? await getBotChannelInfo() : null

    let repairLineProbe: Record<string, unknown> | null = null
    if (repairId && repairTableOk && hasSupabaseServiceRole()) {
        const { data: row } = await sb
            .from('repair_requests')
            .select('id, request_no, status, line_user_id, received_via')
            .eq('id', repairId)
            .maybeSingle()
        const lineUserId = String(row?.line_user_id || '').trim()
        const profileResult =
            line.channelAccessToken && isValidLineUserId(lineUserId)
                ? await getProfileWithStatus(lineUserId)
                : { profile: null, http_status: null }
        repairLineProbe = {
            repair_id: repairId,
            found: Boolean(row),
            request_no: row?.request_no ?? null,
            status: row?.status ?? null,
            received_via: row?.received_via ?? null,
            line_user_id_valid: isValidLineUserId(lineUserId),
            line_user_id_prefix: lineUserId ? `${lineUserId.slice(0, 6)}…` : null,
            line_profile_ok: Boolean(profileResult.profile),
            line_profile_http_status: profileResult.http_status,
            line_display_name: profileResult.profile?.displayName ?? null,
        }
    }

    const liffId = String(process.env.NEXT_PUBLIC_LIFF_ID || '').trim()
    const liffIdAi = String(process.env.NEXT_PUBLIC_LIFF_ID_AI || '').trim()

    return NextResponse.json({
        ok: hasSupabaseServiceRole() && Boolean(line.channelAccessToken) && repairTableOk,
        supabase_service_role: hasSupabaseServiceRole(),
        line_channel_access_token: Boolean(line.channelAccessToken),
        line_channel_secret: Boolean(line.channelSecret),
        lineworks_configured: isLineWorksConfigured(),
        repair_requests_readable: repairTableOk,
        repair_requests_error: repairTableError,
        status_constraint_probe: statusConstraintHint,
        repair_line_probe: repairLineProbe,
        line_bot_basic_id: lineBotInfo?.basicId ?? null,
        line_bot_display_name: lineBotInfo?.displayName ?? null,
        vercel_env: process.env.VERCEL_ENV || null,
        git_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
        deployment_id: process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 12) || null,
        liff_id_set: Boolean(liffId),
        liff_id_prefix: liffId ? `${liffId.slice(0, 12)}…` : null,
        liff_id_expected_channel_prefix: '2010166867',
        liff_id_matches_new_channel: liffId.startsWith('2010166867-'),
        liff_id_ai_prefix: liffIdAi ? `${liffIdAi.slice(0, 12)}…` : null,
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
            repairLineProbe && repairLineProbe.line_user_id_valid === false
                ? 'line_user_id が未登録または形式不正 → LIFF受付またはLINE連携が必要'
                : null,
            repairLineProbe &&
            repairLineProbe.line_profile_ok === false &&
            repairLineProbe.line_profile_http_status === 404
                ? `プロフィール404 → この line_user_id は公式${lineBotInfo?.basicId ? ` ${lineBotInfo.basicId}` : ''} の友だちとして認識されていません（ブロック・別IDで受付・LIFFチャネル未リンク）`
                : null,
            repairLineProbe &&
            repairLineProbe.line_profile_ok === false &&
            repairLineProbe.line_profile_http_status === 403
                ? 'プロフィール403 → トークン権限またはプラン制限を確認'
                : null,
            repairLineProbe &&
            repairLineProbe.line_profile_ok === false &&
            !repairLineProbe.line_profile_http_status
                ? 'プロフィール取得失敗（ステータス不明）→ line_user_id 未設定またはトークン未設定'
                : null,
            lineBotInfo?.basicId
                ? `現在のトークンは公式アカウント @${lineBotInfo.basicId.replace(/^@/, '')} 用です（LINE Developers と一致するか確認）`
                : null,
            !liffId
                ? 'NEXT_PUBLIC_LIFF_ID 未設定 → Vercel 設定後に必ず再デプロイ'
                : null,
            liffId && !liffId.startsWith('2010166867-')
                ? 'NEXT_PUBLIC_LIFF_ID が新LIFF(2010166867-HZRimeyh)と不一致 → 更新して再デプロイ、リッチメニューも新URLへ'
                : null,
            repairLineProbe && repairLineProbe.line_profile_ok === false
                ? 'line_user_id が旧プロバイダー由来の可能性 → 新LIFFで再受付またはLINE連携で更新後に再送'
                : null,
        ].filter((h): h is string => Boolean(h)),
    })
}
