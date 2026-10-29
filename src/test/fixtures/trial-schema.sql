CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE profiles (
  id uuid PRIMARY KEY, role text DEFAULT 'student', is_active boolean DEFAULT false,
  active_until timestamptz, course_id integer DEFAULT 1, edital_id bigint DEFAULT 3,
  plan_status text DEFAULT 'trial', plan_expires_at timestamptz
);
CREATE TABLE topics (id bigint PRIMARY KEY, target_course_ids integer[]);
CREATE TABLE edicts (id bigint PRIMARY KEY, course_id integer, year integer, is_active boolean);
CREATE TABLE edital_law_references (edital_id bigint, law_reference_id bigint);
CREATE TABLE questions (
  id bigint PRIMARY KEY, topic_id bigint, law_reference_id bigint, correct_option text,
  explanation text, is_active boolean, status text
);
CREATE TABLE flashcards (
  id bigint PRIMARY KEY, topic_id bigint, law_reference_id bigint, back_text text, is_active boolean, status text
);
CREATE TABLE user_daily_productivity (
  user_id uuid REFERENCES profiles ON DELETE CASCADE, questions_answered integer, flashcards_reviewed integer
);
CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.has_active_access() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, UPDATE, DELETE ON profiles TO authenticated;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_profile_read ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY legacy_profile_update ON profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY legacy_profile_delete ON profiles FOR DELETE TO authenticated USING (true);
GRANT SELECT ON questions, flashcards TO anon, authenticated;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_question_read ON questions FOR SELECT TO authenticated USING (true);
CREATE POLICY legacy_card_read ON flashcards FOR SELECT TO authenticated USING (true);
INSERT INTO topics VALUES (1, ARRAY[1]), (2, ARRAY[2]);
INSERT INTO edicts VALUES (3,1,2027,true);
INSERT INTO edital_law_references VALUES (3,7);
INSERT INTO questions SELECT i, 1,7,'a','Comentário protegido',true,'published' FROM generate_series(1,40) i;
INSERT INTO questions VALUES (41,2,7,'a','Outro curso',true,'published'), (42,1,99,'a','Outra lei',true,'published');
INSERT INTO flashcards VALUES (1,1,7,'Verso protegido',true,'published');
