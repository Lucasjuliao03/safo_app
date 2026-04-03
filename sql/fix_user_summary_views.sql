-- Primeiro, remover a constraint caso exista
ALTER TABLE user_summary_views DROP CONSTRAINT IF EXISTS user_summary_views_user_id_summary_id_key;

-- Destruir as views antigas
TRUNCATE TABLE user_summary_views;

-- Como summary_id foi criado como UUID mas seus IDs muito provavelmente são inteiros/bigints (pois "400 bad request" sempre acontece por isso),
-- vamos converter a coluna.
DO $$ 
BEGIN
  -- Tentar alterar o tipo da coluna para corresponder à tabela summaries real (geralmente BIGINT ou INT)
  ALTER TABLE user_summary_views ALTER COLUMN summary_id TYPE BIGINT USING summary_id::text::bigint;
EXCEPTION WHEN OTHERS THEN
  -- Se falhar porque não temos valores compatíveis, já truncamos então podemos forçar drop e add
  ALTER TABLE user_summary_views DROP COLUMN summary_id;
  ALTER TABLE user_summary_views ADD COLUMN summary_id BIGINT NOT NULL;
END $$;

-- Recriar a constraint para o UPSERT funcionar (on_conflict)
ALTER TABLE user_summary_views ADD CONSTRAINT user_summary_views_user_id_summary_id_key UNIQUE (user_id, summary_id);

-- Recriar as Permissões CORRETAS (incluindo UPDATE para o upsert)
DROP POLICY IF EXISTS "Users can view own summary views" ON user_summary_views;
DROP POLICY IF EXISTS "Users can insert own summary views" ON user_summary_views;
DROP POLICY IF EXISTS "Users can update own summary views" ON user_summary_views;

CREATE POLICY "Users can view own summary views" ON user_summary_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summary views" ON user_summary_views FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Faltava essa:
CREATE POLICY "Users can update own summary views" ON user_summary_views FOR UPDATE USING (auth.uid() = user_id);
