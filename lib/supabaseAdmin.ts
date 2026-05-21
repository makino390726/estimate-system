import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdiqyslnokscgcuoakle.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function hasSupabaseServiceRole(): boolean {
    return Boolean(supabaseServiceKey)
}

/** サーバー API 用（RLS をバイパス） */
export function getSupabaseAdmin(): SupabaseClient {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    const anonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkaXF5c2xub2tzY2djdW9ha2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTQyMDMsImV4cCI6MjA3Nzk3MDIwM30.aGgaWQvsNhlnh6GO7wAgbTcL9JFpvT2xKnUQMZcnZuk'
    return createClient(supabaseUrl, anonKey)
}
