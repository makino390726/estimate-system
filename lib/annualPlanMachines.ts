import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  factoryCategoryFor,
  isProductPlanCategory,
} from '@/lib/annualPlanCategories'

export type PlanMachine = {
  code: string
  name: string
  source: 'factory' | 'product'
  productCode: string | null
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
    }))
    .filter((row) => row.code)
}

async function fetchFactoryModels(factoryCategory: string): Promise<PlanMachine[]> {
  const cached = modelCache.get(factoryCategory)
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return cached.machines

  const sb = factorySupabase()
  if (sb) {
    let query = sb
      .from('heater_models')
      .select('model, name, product_code, product_category')
      .order('model')
    if (factoryCategory) query = query.eq('product_category', factoryCategory)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const machines = mapFactoryRows(data || [])
    modelCache.set(factoryCategory, { at: Date.now(), machines })
    return machines
  }

  const url = new URL('/api/heater/models', FACTORY_ORIGIN)
  if (factoryCategory) url.searchParams.set('category', factoryCategory)
  const res = await fetch(url.toString(), { next: { revalidate: 300 } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`factory-materials 機種取得に失敗しました (${res.status}) ${text.slice(0, 120)}`)
  }
  const data = await res.json()
  const machines = mapFactoryRows(Array.isArray(data) ? data : [])
  modelCache.set(factoryCategory, { at: Date.now(), machines })
  return machines
}

async function fetchProductMachines(category: string): Promise<PlanMachine[]> {
  const sb = getSupabaseAdmin()
  const keyword = category === '資材' ? '資材' : category
  const { data, error } = await sb
    .from('products')
    .select('id, name')
    .ilike('name', `%${keyword}%`)
    .order('name')
    .limit(200)
  if (error) throw new Error(error.message)
  return (data || []).map((row) => ({
    code: String(row.id),
    name: String(row.name || row.id),
    source: 'product' as const,
    productCode: String(row.id),
  }))
}

export async function fetchPlanMachines(category: string): Promise<{
  machines: PlanMachine[]
  source: 'factory' | 'product'
  factoryCategory: string | null
  warning: string | null
}> {
  if (isProductPlanCategory(category)) {
    const machines = await fetchProductMachines(category)
    return {
      machines,
      source: 'product',
      factoryCategory: null,
      warning: machines.length === 0 ? `${category} に該当する商品が商品マスタにありません` : null,
    }
  }

  const factoryCategory = factoryCategoryFor(category) || 'その他'
  try {
    const machines = await fetchFactoryModels(factoryCategory)
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
