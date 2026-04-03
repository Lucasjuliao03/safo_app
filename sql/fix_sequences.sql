-- Sincronizando sequências numéricas das tabelas
-- Isso corrige erros de "duplicate key value violates unique constraint" após importações de CSV manuais prévias onde IDs foram empurrados

SELECT setval('subjects_id_seq', coalesce((SELECT MAX(id) FROM subjects), 1), true);
SELECT setval('topics_id_seq', coalesce((SELECT MAX(id) FROM topics), 1), true);
SELECT setval('questions_id_seq', coalesce((SELECT MAX(id) FROM questions), 1), true);
SELECT setval('exam_boards_id_seq', coalesce((SELECT MAX(id) FROM exam_boards), 1), true);
