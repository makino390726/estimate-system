export type Customer = {
  id: string
  name: string
  kana?: string | null
  postal_code?: string | null
  prefecture?: string | null
  city?: string | null
  address?: string | null
  building?: string | null
  phone?: string | null
  tel?: string | null          // ★ 追加（phone のエイリアス）
  fax?: string | null
  email?: string | null
  representative?: string | null
  department?: string | null
  address1?: string | null      // ★ 追加（address のエイリアス）
  address2?: string | null      // ★ 追加（building のエイリアス）
  note?: string | null          // ★ 追加
  created_at?: string | null
  updated_at?: string | null
}