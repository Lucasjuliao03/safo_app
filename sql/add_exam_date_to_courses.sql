-- Adicionar campo exam_date na tabela courses
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS exam_date DATE;

-- Atualizar cursos existentes com datas de exemplo (opcional, para teste)
-- UPDATE courses SET exam_date = '2025-09-01' WHERE id = 1;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_courses_exam_date ON courses(exam_date);
