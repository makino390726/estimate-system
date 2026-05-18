import type { SupabaseClient } from '@supabase/supabase-js'

export const REPAIR_PHOTOS_BUCKET = 'repair-photos'
export const MAX_REPAIR_FORM_PHOTOS = 8
export const MAX_REPAIR_PHOTO_BYTES = 8 * 1024 * 1024

export type RepairPhotoUploadItem = {
    data: Blob
    fileName: string
    mimeType: string
}

const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
}

export function normalizeRepairMediaUrls(val: unknown): string[] {
    if (!val) return []
    if (Array.isArray(val)) {
        return val.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    }
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val)
            if (Array.isArray(parsed)) {
                return parsed.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
            }
        } catch {
            return val.trim() ? [val.trim()] : []
        }
    }
    return []
}

function extFromMime(mimeType: string, fileName: string): string {
    const fromMime = MIME_TO_EXT[mimeType.toLowerCase()]
    if (fromMime) return fromMime
    const name = fileName || ''
    const dot = name.lastIndexOf('.')
    if (dot >= 0) return name.slice(dot + 1).toLowerCase() || 'jpg'
    return 'jpg'
}

function isImageMime(mimeType: string): boolean {
    return mimeType.startsWith('image/') || mimeType === ''
}

/** FormData から写真エントリを取得 */
export function parseRepairFormPhotoEntries(fd: FormData): RepairPhotoUploadItem[] {
    const items: RepairPhotoUploadItem[] = []
    for (const entry of fd.getAll('photos')) {
        if (typeof entry === 'string') continue
        if (!(entry instanceof File) || entry.size === 0) continue
        if (items.length >= MAX_REPAIR_FORM_PHOTOS) break
        items.push({
            data: entry,
            fileName: entry.name || `photo-${items.length}.jpg`,
            mimeType: entry.type || 'image/jpeg',
        })
    }
    return items
}

/** LIFFフォーム等から受け取った写真を Storage に並列アップロードし、公開 URL の配列を返す */
export async function uploadRepairRequestPhotos(
    sb: SupabaseClient,
    repairRequestId: string,
    files: RepairPhotoUploadItem[],
): Promise<string[]> {
    const list = files.slice(0, MAX_REPAIR_FORM_PHOTOS)
    const ts = Date.now()

    const results = await Promise.all(
        list.map(async (file, i) => {
            if (!isImageMime(file.mimeType) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.fileName)) {
                return null
            }
            if (file.data.size > MAX_REPAIR_PHOTO_BYTES) {
                console.warn(`repair photo skipped (too large): ${file.fileName} ${file.data.size}`)
                return null
            }

            const ext = extFromMime(file.mimeType, file.fileName)
            const path = `${repairRequestId}/${ts}-${i}.${ext}`

            const { error } = await sb.storage
                .from(REPAIR_PHOTOS_BUCKET)
                .upload(path, file.data, {
                    upsert: false,
                    contentType: file.mimeType || `image/${ext}`,
                })

            if (error) {
                console.error('repair photo upload error:', path, error.message)
                return null
            }

            const { data } = sb.storage.from(REPAIR_PHOTOS_BUCKET).getPublicUrl(path)
            return data?.publicUrl || null
        }),
    )

    return results.filter((u): u is string => typeof u === 'string' && u.length > 0)
}
