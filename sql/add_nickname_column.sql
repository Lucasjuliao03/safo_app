-- ============================================
-- ADICIONAR CAMPO NICKNAME AO PERFIL
-- ============================================

-- Adicionar coluna nickname
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname TEXT UNIQUE;

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON profiles(nickname);

-- Política RLS para nickname (pode ser visto por todos)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view nicknames" ON profiles;
CREATE POLICY "Anyone can view nicknames" ON profiles FOR SELECT USING (true);

-- Atualizar usuários existentes sem nickname
UPDATE profiles SET nickname = LOWER(TRIM(full_name))
WHERE nickname IS NULL AND full_name IS NOT NULL;

-- Verificar nicknames duplicados e resolver
WITH duplicates AS (
  SELECT LOWER(TRIM(full_name)) as nick, array_agg(id) as ids
  FROM profiles 
  WHERE full_name IS NOT NULL AND nickname IS NULL
  GROUP BY LOWER(TRIM(full_name))
  HAVING COUNT(*) > 1
)
UPDATE profiles SET nickname = LOWER(TRIM(full_name)) || ' ' || id::TEXT
WHERE id IN (SELECT UNNEST(ids) FROM duplicates);