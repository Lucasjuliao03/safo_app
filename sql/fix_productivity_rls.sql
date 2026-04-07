-- Adicionar políticas RLS na tabela user_daily_productivity para ranking

ALTER TABLE user_daily_productivity ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados podem ver todos os dados de produtividade (para ranking)
DROP POLICY IF EXISTS "Users can view all productivity for ranking" ON user_daily_productivity;
CREATE POLICY "Users can view all productivity for ranking" ON user_daily_productivity 
FOR SELECT TO authenticated USING (true);

-- Usuários podem inserir seus próprios dados
DROP POLICY IF EXISTS "Users can insert own productivity" ON user_daily_productivity;
CREATE POLICY "Users can insert own productivity" ON user_daily_productivity 
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Usuários podem atualizar seus próprios dados
DROP POLICY IF EXISTS "Users can update own productivity" ON user_daily_productivity;
CREATE POLICY "Users can update own productivity" ON user_daily_productivity 
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);