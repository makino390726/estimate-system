-- 決済ルール管理テーブルの作成スクリプト
-- Supabase SQL Editor で実行してください

-- 決済ルーラー管理テーブル
CREATE TABLE IF NOT EXISTS settlement_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL UNIQUE,
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_settlement_rules_branch_id ON settlement_rules(branch_id);

-- RLSポリシーの有効化
ALTER TABLE settlement_rules ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能
CREATE POLICY "Allow public read" ON settlement_rules
  FOR SELECT USING (true);

-- 認証ユーザーが作成・更新可能
CREATE POLICY "Allow authenticated insert" ON settlement_rules
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update" ON settlement_rules
  FOR UPDATE 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Storageバケットの作成（Supabase Dashboardで実施）
-- バケット名: settlement-rules
-- 公開: 有効
-- ファイルサイズ制限: 52MB（PDF用）

-- 保存時刻を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_settlement_rules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settlement_rules_update_timestamp ON settlement_rules;
CREATE TRIGGER settlement_rules_update_timestamp
  BEFORE UPDATE ON settlement_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_settlement_rules_timestamp();
