-- Adicionar coluna summaries_read se não existir
ALTER TABLE user_daily_productivity 
ADD COLUMN IF NOT EXISTS summaries_read INTEGER DEFAULT 0;

-- Garantir que a coluna summaries_read tem valor padrão 0 para registros existentes
UPDATE user_daily_productivity 
SET summaries_read = 0 
WHERE summaries_read IS NULL;
