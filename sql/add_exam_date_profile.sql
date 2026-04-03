-- Adiciona coluna exam_date no perfil do usuário para ele cadastrar sua própria data de prova
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exam_date DATE DEFAULT NULL;
COMMENT ON COLUMN profiles.exam_date IS 'Data da prova do usuário, cadastrada pelo próprio aluno';
