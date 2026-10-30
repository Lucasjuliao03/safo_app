CREATE TABLE mentoria_diagnosticos(id integer PRIMARY KEY,user_id uuid,content text);
CREATE TABLE patrulhamento_progresso(id integer PRIMARY KEY,user_id uuid,content text);
CREATE TABLE ranking_global(id integer PRIMARY KEY,user_id uuid,content text);
CREATE TABLE plans(id integer PRIMARY KEY);
CREATE TABLE courses(id integer PRIMARY KEY);
INSERT INTO plans VALUES(1);
INSERT INTO courses VALUES(1);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['mentoria_diagnosticos','patrulhamento_progresso','ranking_global'] LOOP
    EXECUTE format('GRANT ALL ON %I TO authenticated,service_role',t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY legacy_allow ON %I TO authenticated USING (true) WITH CHECK (true)',t);
    EXECUTE format('INSERT INTO %I VALUES(1,NULL,''protected'')',t);
  END LOOP;
END $$;
GRANT SELECT ON plans,courses TO authenticated;
GRANT SELECT ON topics TO authenticated;
CREATE VIEW legacy_mentoring_view AS SELECT * FROM mentoria_diagnosticos;
CREATE VIEW nested_mentoring_view AS SELECT * FROM legacy_mentoring_view;
GRANT SELECT ON legacy_mentoring_view,nested_mentoring_view TO authenticated;
CREATE FUNCTION public.legacy_read_mentoring() RETURNS text LANGUAGE sql SECURITY DEFINER
AS $$ SELECT content FROM mentoria_diagnosticos LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION public.legacy_read_mentoring() TO PUBLIC;
