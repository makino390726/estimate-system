const cache = new Map<string, { at: number; value: unknown }>()

export const ANNUAL_PLAN_CACHE_TTL_MS = 45_000

export function readAnnualPlanCache<T>(key: string, ttlMs = ANNUAL_PLAN_CACHE_TTL_MS): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key)
    return null
  }
  return hit.value as T
}

export function writeAnnualPlanCache(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value })
}

export function clearAnnualPlanCaches() {
  cache.clear()
}
