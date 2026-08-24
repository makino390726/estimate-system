import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  factoryCategoryFor,
  isAmountOnlyPlanCategory,
  productIdPrefixesForCategory,
} from '@/lib/annualPlanCategories'

export type PlanMachine = {
  code: string
  name: string
  source: 'factory' | 'product'
  productCode: string | null
  retailPrice: number | null
  costPrice: number | null
}

const FACTORY_ORIGIN =
  process.env.FACTORY_MATERIALS_ORIGIN ||
  process.env.NEXT_PUBLIC_FACTORY_MATERIALS_ORIGIN ||
  'https://factory-materials.vercel.app'

const MODEL_CACHE_MS = 5 * 60 * 1000
const modelCache = new Map<string, { at: number; machines: PlanMachine[] }>()

function factorySupabase() {
  const url = process.env.FACTORY_SUPABASE_URL || ''
  const key =
    process.env.FACTORY_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.FACTORY_SUPABASE_ANON_KEY ||
    ''
  if (!url || !key) return null
  return createClient(url, key)
}

function mapFactoryRows(
  rows: Array<{ model?: string | null; name?: string | null; product_code?: string | null }>,
): PlanMachine[] {
  return rows
    .map((row) => ({
      code: String(row.model || '').trim(),
      name: String(row.name || row.model || '').trim(),
      source: 'factory' as const,
      productCode: row.product_code ? String(row.product_code) : null,
      retailPrice: null,
      costPrice: null,
    }))
    .filter((row) => row.code)
}

async function fetchRetailPriceMap(productCodes: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  const unique = [...new Set(productCodes.map((c) => c.trim()).filter(Boolean))]
  if (unique.length === 0) return prices

  const sb = getSupabaseAdmin()
  const chunkSize = 200
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { data, error } = await sb.from('products').select('id, retail_price').in('id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data || []) {
      const price = Number(row.retail_price)
      if (Number.isFinite(price) && price > 0) prices.set(String(row.id), price)
    }
  }
  return prices
}

async function attachRetailPrices(machines: PlanMachine[]): Promise<PlanMachine[]> {
  const codes = machines.map((m) => m.productCode).filter((c): c is string => Boolean(c))
  const prices = await fetchRetailPriceMap(codes)
  return machines.map((m) => ({
    ...m,
    retailPrice: m.productCode ? prices.get(m.productCode) ?? null : null,
    costPrice: m.costPrice,
  }))
}

async function fetchFactoryModels(factoryCategory: string, includePrices = true): Promise<PlanMachine[]> {
  const cacheKey = `factory:${factoryCategory}:${includePrices ? 'prices' : 'codes'}`
  const cached = modelCache.get(cacheKey)
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return cached.machines

  const sb = factorySupabase()
  let machines: PlanMachine[] = []
  if (sb) {
    let query = sb
      .from('heater_models')
      .select('model, name, product_code, product_category')
      .order('model')
    if (factoryCategory) query = query.eq('product_category', factoryCategory)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    machines = mapFactoryRows(data || [])
  } else {
    const url = new URL('/api/heater/models', FACTORY_ORIGIN)
    if (factoryCategory) url.searchParams.set('category', factoryCategory)
    const res = await fetch(url.toString(), { next: { revalidate: 300 } })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`factory-materials 機種取得に失敗しました (${res.status}) ${text.slice(0, 120)}`)
    }
    const data = await res.json()
    machines = mapFactoryRows(Array.isArray(data) ? data : [])
  }

  if (includePrices) machines = await attachRetailPrices(machines)
  modelCache.set(cacheKey, { at: Date.now(), machines })
  return machines
}

async function fetchProductMachines(category: string): Promise<PlanMachine[]> {
  const cacheKey = `product:${category}`
  const cached = modelCache.get(cacheKey)
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return cached.machines

  const sb = getSupabaseAdmin()
  const prefixes = productIdPrefixesForCategory(category)
  let data: Array<{
    id: string
    name: string | null
    retail_price?: number | null
    cost_price?: number | null
  }> | null = null

  if (prefixes.length > 0) {
    const orFilter = prefixes.map((p) => `id.like.${p}%`).join(',')
    const { data: byPrefix, error } = await sb
      .from('products')
      .select('id, name, retail_price, cost_price')
      .or(orFilter)
      .order('name')
      .limit(400)
    if (error) throw new Error(error.message)
    data = byPrefix
  }

  if (!data || data.length === 0) {
    const keyword = category === '資材' ? '資材' : category
    const { data: byName, error } = await sb
      .from('products')
      .select('id, name, retail_price, cost_price')
      .ilike('name', `%${keyword}%`)
      .order('name')
      .limit(400)
    if (error) throw new Error(error.message)
    data = byName
  }

  const machines = (data || []).map((row) => {
    const price = Number(row.retail_price)
    const cost = Number(row.cost_price)
    return {
      code: String(row.id),
      name: String(row.name || row.id),
      source: 'product' as const,
      productCode: String(row.id),
      retailPrice: Number.isFinite(price) && price > 0 ? price : null,
      costPrice: Number.isFinite(cost) && cost > 0 ? cost : null,
    }
  })
  modelCache.set(cacheKey, { at: Date.now(), machines })
  return machines
}

export async function fetchPlanMachines(
  category: string,
  options?: { includePrices?: boolean },
): Promise<{
  machines: PlanMachine[]
  source: 'factory' | 'product'
  factoryCategory: string | null
  warning: string | null
}> {
  const includePrices = options?.includePrices !== false
  if (isAmountOnlyPlanCategory(category)) {
    const machines = await fetchProductMachines(category)
    return {
      machines,
      source: 'product',
      factoryCategory: null,
      warning: machines.length === 0 ? `${category} に該当する商品が商品マスタにありません（品名は空のままでも追加できます）` : null,
    }
  }

  const factoryCategory = factoryCategoryFor(category) || 'その他'
  try {
    const machines = await fetchFactoryModels(factoryCategory, includePrices)
    return {
      machines,
      source: 'factory',
      factoryCategory,
      warning:
        machines.length === 0
          ? `factory-materials の「${factoryCategory}」に機種がありません`
          : null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      machines: [],
      source: 'factory',
      factoryCategory,
      warning: `機種マスタを読めませんでした: ${message}`,
    }
  }
}
