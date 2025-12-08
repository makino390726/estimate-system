import { createClient } from "@supabase/supabase-js";

// ★ここにあなたのプロジェクトURLとanon keyを直接書きます
const supabaseUrl = "https://xdiqyslnokscgcuoakle.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkaXF5c2xub2tzY2djdW9ha2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTQyMDMsImV4cCI6MjA3Nzk3MDIwM30.aGgaWQvsNhlnh6GO7wAgbTcL9JFpvT2xKnUQMZcnZuk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

