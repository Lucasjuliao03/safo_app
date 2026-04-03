-- 1. Adiciona a coluna de formato de questão (Múltipla Escolha vs Verdadeiro ou Falso)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'multiple_choice' CHECK (format IN ('multiple_choice', 'true_false'));
COMMENT ON COLUMN questions.format IS 'multiple_choice (4 ou 5 opções) ou true_false';

-- 2. Remove o bloqueio (Check Constraint) que obrigava a resposta ser apenas A, B, C, D ou E
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_correct_option_check;

-- 3. Recria a regra permitindo V e F (Verdadeiro e Falso) como opção válida no banco de dados
ALTER TABLE questions ADD CONSTRAINT questions_correct_option_check 
CHECK (correct_option IN ('A', 'B', 'C', 'D', 'E', 'a', 'b', 'c', 'd', 'e', 'V', 'F', 'v', 'f'));

-- 4. Torna as alternativas opcionais no nível do Banco De Dados para suportar questões Certo ou Errado
ALTER TABLE questions ALTER COLUMN option_a DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_b DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_d DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_e DROP NOT NULL;
