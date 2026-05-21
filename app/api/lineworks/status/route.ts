import { NextResponse } from 'next/server'
import { listLineWorksStaffMappings } from '@/lib/lineworksStaffMappingDb'
import {
    getLineWorksAccessToken,
    getLineWorksBotId,
    getLineWorksEnvStatus,
    isLineWorksConfigured,
} from '@/lib/lineWorksClient'
import { getSupabaseAdmin, hasSupabaseServiceRole } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/** LINE WORKS 連携の診断（設定・トークン・登録件数） */
export async function GET() {
    try {
        const env = getLineWorksEnvStatus()
        const configured = isLineWorksConfigured()
        const missingEnv = Object.entries(env)
            .filter(([, ok]) => !ok)
            .map(([name]) => name)
        let tokenOk = false
        let tokenError: string | null = null

        if (configured) {
            try {
                await getLineWorksAccessToken()
                tokenOk = true
            } catch (e) {
                tokenError = e instanceof Error ? e.message : String(e)
            }
        }

        const sb = getSupabaseAdmin()
        const { data: mappings, error: mapErr } = await listLineWorksStaffMappings(sb)
        const enabled = (mappings || []).filter((m) => m.notify_enabled !== false)

        let notificationsTableOk = true
        let notificationsTableError: string | null = null
        const { error: lwTableErr } = await sb.from('repair_lineworks_notifications').select('id').limit(1)
        if (lwTableErr) {
            notificationsTableOk = false
            notificationsTableError = lwTableErr.message
        }

        return NextResponse.json({
            ok: configured && tokenOk,
            configured,
            env,
            missingEnv,
            tokenOk,
            tokenError,
            supabaseServiceRole: hasSupabaseServiceRole(),
            botId: configured ? getLineWorksBotId() : null,
            mappingCount: enabled.length,
            mappings: enabled.map((m) => ({
                staff_name: m.staff_name,
                lineworks_user_id: m.lineworks_user_id,
            })),
            mapError: mapErr?.message || null,
            notificationsTableOk,
            notificationsTableError,
            hints: [
                !hasSupabaseServiceRole()
                    ? 'SUPABASE_SERVICE_ROLE_KEY が未設定です（保存時 RLS エラーの原因）。Supabase の service_role を Vercel に追加するか enable_lineworks_staff_mappings_rls.sql を実行'
                    : null,
                !configured
                    ? missingEnv.length > 0
                        ? `LINE WORKS 必須の環境変数が未設定: ${missingEnv.join(', ')}`
                        : 'LINE WORKS 必須の環境変数が未設定です'
                    : null,
                configured && !tokenOk
                    ? `APIトークン取得失敗: ${tokenError || 'PRIVATE_KEY / CLIENT_ID / SERVICE_ACCOUNT を確認'}`
                    : null,
                configured && tokenOk && enabled.length === 0
                    ? '担当者の LINE WORKS 連携が未登録です（この画面で登録）'
                    : null,
                notificationsTableOk === false
                    ? `repair_lineworks_notifications テーブル未作成: ${notificationsTableError}`
                    : null,
            ].filter((h): h is string => Boolean(h)),
            hint:
                [
                    !hasSupabaseServiceRole() ? 'SUPABASE_SERVICE_ROLE_KEY 未設定' : null,
                    !configured
                        ? missingEnv.length > 0
                            ? `LINE WORKS 未設定: ${missingEnv.join(', ')}`
                            : 'LINE WORKS 未設定'
                        : null,
                    configured && !tokenOk ? `トークン失敗: ${tokenError || ''}` : null,
                ]
                    .filter(Boolean)
                    .join(' / ') || null,
            deployNote: '環境変数を追加・変更したあとは Vercel で Redeploy しないと反映されません',
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
