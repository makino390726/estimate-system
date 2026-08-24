const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_CONCURRENCY = 6

/** count で総件を取り、ページを並列取得する（PostgREST の 1000 件上限向け） */
export async function fetchSupabasePages<T>(opts: {
  count: () => Promise<number>
  page: (from: number, to: number) => Promise<T[]>
  pageSize?: number
  concurrency?: number
}): Promise<T[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY
  const total = await opts.count()
  if (!total) return []
  const starts: number[] = []
  for (let from = 0; from < total; from += pageSize) starts.push(from)
  const chunks: T[][] = Array.from({ length: starts.length }, () => [])
  let cursor = 0
  const workerCount = Math.min(concurrency, starts.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < starts.length) {
        const i = cursor
        cursor += 1
        const from = starts[i]
        chunks[i] = await opts.page(from, from + pageSize - 1)
      }
    }),
  )
  return chunks.flat()
}
