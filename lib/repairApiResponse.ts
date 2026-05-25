/** fetch した API レスポンスをユーザー向けメッセージに変換 */
export async function parseRepairApiJsonResponse(
    res: Response,
    fallbackError: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
    const text = await res.text()
    let data: Record<string, unknown> = {}
    try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
        if (res.status === 401) {
            return {
                ok: false,
                message:
                    'APIが認証で拒否されました（401）。ページを再読み込みするか、しばらくしてから再度お試しください。',
            }
        }
        if (res.status === 404 && (text.includes('<!DOCTYPE') || text.includes('<html'))) {
            return {
                ok: false,
                message:
                    'APIが見つかりません（404）。最新のデプロイ反映後にスーパーリロード（Ctrl+Shift+R）してください。',
            }
        }
        return {
            ok: false,
            message: `${fallbackError}（HTTP ${res.status}）`,
        }
    }

    if (!res.ok) {
        const err = typeof data.error === 'string' ? data.error : fallbackError
        const code = typeof data.code === 'string' ? data.code : ''
        const hint =
            code === 'missing_service_role'
                ? '（Vercelに SUPABASE_SERVICE_ROLE_KEY を設定して再デプロイ）'
                : ''
        return { ok: false, message: `${err}${hint}` }
    }

    return { ok: true, data }
}
