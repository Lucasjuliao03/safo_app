CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
ALTER TABLE profiles ADD COLUMN xp_total integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN streak_days integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN level_number integer NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN last_access_at timestamptz;
ALTER TABLE user_daily_productivity ADD COLUMN productivity_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
ALTER TABLE user_daily_productivity ADD COLUMN questions_correct integer NOT NULL DEFAULT 0;
ALTER TABLE user_daily_productivity ADD COLUMN questions_wrong integer NOT NULL DEFAULT 0;
ALTER TABLE user_daily_productivity ADD COLUMN summaries_read integer NOT NULL DEFAULT 0;
ALTER TABLE user_daily_productivity ADD COLUMN xp_earned integer NOT NULL DEFAULT 0;
ALTER TABLE user_daily_productivity ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE user_daily_productivity ADD UNIQUE(user_id,productivity_date);
ALTER TABLE user_daily_productivity ALTER COLUMN questions_answered SET DEFAULT 0;
ALTER TABLE user_daily_productivity ALTER COLUMN flashcards_reviewed SET DEFAULT 0;
CREATE TYPE public.flashcard_review_enum AS ENUM('wrong','hard','good','easy');
CREATE TABLE question_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid REFERENCES profiles ON DELETE CASCADE,
 question_id bigint NOT NULL,selected_option char(1) NOT NULL,is_correct boolean NOT NULL,attempt_number integer NOT NULL DEFAULT 1
);
CREATE TABLE user_question_stats (
 user_id uuid REFERENCES profiles ON DELETE CASCADE,question_id bigint,total_attempts integer NOT NULL DEFAULT 0,
 total_correct integer NOT NULL DEFAULT 0,total_wrong integer NOT NULL DEFAULT 0,
 first_answered_at timestamptz,last_answered_at timestamptz,last_selected_option char(1),last_is_correct boolean,
 PRIMARY KEY(user_id,question_id)
);
CREATE TABLE user_flashcard_reviews (
 user_id uuid REFERENCES profiles ON DELETE CASCADE,flashcard_id bigint,total_reviews integer NOT NULL DEFAULT 0,
 total_correct integer NOT NULL DEFAULT 0,total_wrong integer NOT NULL DEFAULT 0,current_interval_days integer NOT NULL DEFAULT 1,
 last_review_result public.flashcard_review_enum,last_reviewed_at timestamptz,next_review_at timestamptz,
 memory_stage integer NOT NULL DEFAULT 1,is_mastered boolean NOT NULL DEFAULT false,updated_at timestamptz DEFAULT now(),
 PRIMARY KEY(user_id,flashcard_id)
);
CREATE TABLE flashcard_review_logs (
 user_id uuid REFERENCES profiles ON DELETE CASCADE,flashcard_id bigint,review_result public.flashcard_review_enum,interval_after integer
);
CREATE TABLE user_xp_logs (user_id uuid REFERENCES profiles ON DELETE CASCADE,source_type text,source_id bigint,xp_amount integer,description text);
CREATE TABLE user_achievements (user_id uuid REFERENCES profiles ON DELETE CASCADE,achievement_id text,unlocked_at timestamptz,notification_shown boolean,PRIMARY KEY(user_id,achievement_id));
CREATE TABLE daily_missions (
 user_id uuid REFERENCES profiles ON DELETE CASCADE,mission_date date,status text DEFAULT 'pending',
 questions_completed integer DEFAULT 0,flashcards_completed integer DEFAULT 0,summary_completed integer DEFAULT 0,
 questions_count integer DEFAULT 0,flashcards_count integer DEFAULT 0,summary_count integer DEFAULT 0,
 started_at timestamptz,completed_at timestamptz,updated_at timestamptz
);
CREATE TABLE summaries (id bigint PRIMARY KEY,topic_id bigint,law_reference_id bigint,is_active boolean DEFAULT true,status text DEFAULT 'published');
CREATE TABLE user_summary_views (user_id uuid REFERENCES profiles ON DELETE CASCADE,summary_id bigint,viewed_date date,read_count integer NOT NULL DEFAULT 1,PRIMARY KEY(user_id,summary_id));
INSERT INTO summaries VALUES(1,1,7,true,'published'),(2,1,7,true,'published'),(3,1,7,true,'published'),(4,2,7,true,'published');
GRANT INSERT,UPDATE,DELETE,SELECT ON question_attempts,user_question_stats,user_flashcard_reviews,flashcard_review_logs,
 user_daily_productivity,user_xp_logs,user_summary_views,user_achievements TO authenticated;
CREATE FUNCTION public.legacy_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'assert_study_access legacy browser guard';
END; $$;
CREATE TRIGGER legacy_attempt_guard BEFORE INSERT ON question_attempts FOR EACH ROW EXECUTE FUNCTION legacy_attempt_guard();
