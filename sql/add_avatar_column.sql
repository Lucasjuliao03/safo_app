-- ============================================
-- ADICIONAR CAMPO AVATAR AO PERFIL
-- ============================================

-- Adicionar coluna avatar (nome do arquivo em public/avatar)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar VARCHAR(100);

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_profiles_avatar ON profiles(avatar);

-- Atualizar política RLS se necessário (já existe para nickname)
-- Tornar campo avatar visível publicamente
DROP POLICY IF EXISTS "Anyone can view avatar" ON profiles;
CREATE POLICY "Anyone can view avatar" ON profiles FOR SELECT USING (true);

-- Atualizar usuários existentes sem avatar (definir padrão)
UPDATE profiles SET avatar = 'default'
WHERE avatar IS NULL;
