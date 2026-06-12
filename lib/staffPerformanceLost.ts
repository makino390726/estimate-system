import { supabase } from '@/lib/supabaseClient'

export type LostStats = {
  lost_count: number
  lost_amount: number
}

type SupabaseLike = {
  from: (table: string) => any
}

export async function fetchLostStatsByStaff(
  client: SupabaseLike = supabase,
  fromDate?: string | null,
  toDate?: string | null,
): Promise<Map<number, LostStats>> {
  const stats = new Map<number, LostStats>()
  const pageSize = 1000
  let offset = 0

  while (true) {
    let query = client
      .from('cases')
      .select('staff_id, total_amount')
      .eq('status', '失注')

    if (fromDate) {
      query = query.gte('created_date', `${fromDate}T00:00:00`)
    }
    if (toDate) {
      query = query.lte('created_date', `${toDate}T23:59:59.999`)
    }

    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) {
      throw new Error(error.message || '失注データの取得に失敗しました')
    }

    const rows = data || []
    for (const row of rows) {
      const staffId = Number(row.staff_id)
      if (!Number.isFinite(staffId)) continue

      const prev = stats.get(staffId) || { lost_count: 0, lost_amount: 0 }
      prev.lost_count += 1
      prev.lost_amount += Number(row.total_amount || 0)
      stats.set(staffId, prev)
    }

    if (rows.length < pageSize) break
    offset += pageSize
  }

  return stats
}
