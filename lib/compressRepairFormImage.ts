/** LIFF 送信前に写真を軽量化（アップロード時間・タイムアウト対策） */
export async function compressRepairFormImage(
    file: File,
    maxWidth = 1600,
    quality = 0.82,
): Promise<File> {
    if (!file.type.startsWith('image/')) return file
    if (file.type === 'image/gif') return file
    if (/heic|heif/i.test(file.type) || /\.heic$/i.test(file.name)) return file
    if (file.size < 400_000) return file

    try {
        const bitmap = await createImageBitmap(file)
        const scale = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height, 1))
        const w = Math.max(1, Math.round(bitmap.width * scale))
        const h = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            bitmap.close()
            return file
        }
        ctx.drawImage(bitmap, 0, 0, w, h)
        bitmap.close()

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', quality)
        })
        if (!blob || blob.size >= file.size) return file

        const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
    } catch {
        return file
    }
}
