-- ============================================
-- TABELA: user_summary_views
-- Registrar visualização de resumos para streak
-- ============================================

CREATE TABLE IF NOT EXISTS user_summary_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_id UUID NOT NULL,
  viewed_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, summary_id)
);

-- Habilitar RLS
ALTER TABLE user_summary_views ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own summary views" ON user_summary_views;
DROP POLICY IF EXISTS "Users can insert own summary views" ON user_summary_views;

-- Políticas RLS
CREATE POLICY "Users can view own summary views" ON user_summary_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summary views" ON user_summary_views FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_summary_views_user ON user_summary_views(user_id, viewed_date DESC);
CREATE INDEX IF NOT EXISTS idx_summary_views_date ON user_summary_views(viewed_date);

-- Permissões
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON user_summary_views TO anon, authenticated;
