import { NextResponse } from 'next/server'

/** 本番が最新ビルドか確認用（Vercel が注入する環境変数） */
export async function GET() {
    return NextResponse.json({
        ok: true,
        vercel_env: process.env.VERCEL_ENV || null,
        deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
        git_commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
        built_at: new Date().toISOString(),
    })
}
