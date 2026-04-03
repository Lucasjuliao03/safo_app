-- Adiciona a coluna de contagem na tabela existente
ALTER TABLE user_summary_views ADD COLUMN IF NOT EXISTS read_count INT DEFAULT 1;

-- Atualizar resumos existentes para terem pelo menos 1 leitura registrada,
-- caso algum tenha ficado NULL
UPDATE user_summary_views SET read_count = 1 WHERE read_count IS NULL;
