-- Adicionando a coluna de vinculo múltiplo de Cursos aos Temas
ALTER TABLE topics ADD COLUMN IF NOT EXISTS target_course_ids INT[] DEFAULT '{}';
COMMENT ON COLUMN topics.target_course_ids IS 'Se vazio, o tema funciona para todos os cursos cujo assunto existe. Caso contrário, restringe a exibição só aos cursos listados aqui.';
