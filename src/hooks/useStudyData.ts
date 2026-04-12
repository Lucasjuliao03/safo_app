import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Subject, Question, Flashcard } from '@/types/study';
import { toast } from 'sonner';
import { ACHIEVEMENTS } from '@/types/achievements';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { Scale, FileText, BookOpen, Building2, Users, PenTool, BookOpenIcon } from 'lucide-react';

/* ═══════════════════════════════════════════════════════ */
/*  ICON MAP (UI only — not stored in DB)                 */
/* ═══════════════════════════════════════════════════════ */
export const SUBJECT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Direito Penal": Scale,
  "Direito Constitucional": FileText,
  "Legislação Especial": BookOpen,
  "Direito Administrativo": Building2,
  "Direitos Humanos": Users,
  "Português": PenTool,
};

export const SUBJECT_COLORS: Record<string, string> = {
  "Direito Penal": "hsl(0 72% 55%)",
  "Direito Constitucional": "hsl(217 91% 60%)",
  "Legislação Especial": "hsl(142 71% 45%)",
  "Direito Administrativo": "hsl(38 92% 55%)",
  "Direitos Humanos": "hsl(271 68% 60%)",
  "Português": "hsl(190 80% 50%)",
};

export const DEFAULT_ICON = BookOpenIcon;
export const DEFAULT_COLOR = "hsl(217 91% 60%)";

export const SUBJECT_UI_MAP: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  "Direito Penal":            { icon: Scale, color: "hsl(0 72% 55%)" },
  "Direito Constitucional":   { icon: FileText, color: "hsl(217 91% 60%)" },
  "Legislação Especial":      { icon: BookOpen, color: "hsl(142 71% 45%)" },
  "Direito Administrativo":   { icon: Building2, color: "hsl(38 92% 55%)" },
  "Direitos Humanos":         { icon: Users, color: "hsl(271 68% 60%)" },
  "Português":                { icon: PenTool, color: "hsl(190 80% 50%)" },
};

/* ═══════════════════════════════════════════════════════ */
/*  SUBJECTS                                              */
/* ═══════════════════════════════════════════════════════ */
export function useSubjects(courseId?: string | null) {
  return useQuery({
    queryKey: ['subjects', courseId],
    queryFn: async () => {
      // Admin (courseId undefined) vê tudo; usuário sem curso (null) não vê nada
      if (courseId === null) return [];

      let { data, error } = await supabase.from('subjects').select('*').order('name');
      if (error) throw error;
      let allSubjects = data || [];

      if (courseId) {
         const cid = parseInt(courseId);
         
         // Busca todos os temas e filtra quais são visíveis para este curso
         const { data: allTopics } = await supabase.from('topics').select('subject_id, target_course_ids');
         const allowedSubjectIds = new Set<number>();
         
         (allTopics || []).forEach((t: any) => {
            // Tema visível se: target_course_ids está vazio (aberto a todos) OU contém o curso do aluno
            if (!t.target_course_ids || t.target_course_ids.length === 0 || t.target_course_ids.includes(cid)) {
               allowedSubjectIds.add(t.subject_id);
            }
         });
         
         allSubjects = allSubjects.filter(sub => allowedSubjectIds.has(parseInt(sub.id)));
      }

      return allSubjects.map((s: any): Subject => {
        const color = SUBJECT_COLORS[s.name] || DEFAULT_COLOR;
        const IconComponent = SUBJECT_ICONS[s.name] || DEFAULT_ICON;
        return { id: String(s.id), name: s.name, icon: IconComponent, color, questionCount: 0 };
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  TOPICS / SUBTOPICS                                    */
/* ═══════════════════════════════════════════════════════ */
export function useTopics(courseId?: string | null) {
  return useQuery({
    queryKey: ['topics', courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from('topics').select('*').order('sort_order');
      if (error) throw error;
      if (!data) return [];
      
      // Se courseId definido, filtra: tema visível se target_course_ids vazio OU contém o curso
      if (courseId) {
        const cid = Number(courseId);
        return data.filter((t: any) => !t.target_course_ids || t.target_course_ids.length === 0 || t.target_course_ids.includes(cid));
      }
      return data;
    },
    staleTime: 1000 * 60 * 30,
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  QUESTIONS                                             */
/* ═══════════════════════════════════════════════════════ */
export function useQuestions(courseId?: string | null) {
  return useQuery({
    queryKey: ['questions', courseId],
    queryFn: async () => {
      // Buscar TODAS as questões com paginação
      let allQuestions: any[] = [];
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('questions')
          .select(`id, subject_id, topic_id, subtopic_id, question_type, difficulty, source_year, statement,
                   option_a, option_b, option_c, option_d, option_e, format,
                   correct_option, explanation, board_id, is_active, status, exam_boards(name), topics(name, target_course_ids)`)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        allQuestions = [...allQuestions, ...data];
        page++;
        if (data.length < pageSize) break;
      }
      
      let filtered = allQuestions;
      
      // Filtrar por is_active e status
      filtered = filtered.filter((r: any) => r.is_active === true && r.status === 'published');
      
      if (courseId) {
        const cid = Number(courseId);
        filtered = filtered.filter((row: any) => {
          const tc = row.topics?.target_course_ids;
          return !tc || tc.length === 0 || tc.includes(cid);
        });
      }
      return filtered.map((q: any): Question => {
        const options = [];
        if (q.format === 'true_false') {
          options.push({ id: 'v', text: 'Verdadeiro' });
          options.push({ id: 'f', text: 'Falso' });
        } else {
          if (q.option_a) options.push({ id: 'a', text: q.option_a });
          if (q.option_b) options.push({ id: 'b', text: q.option_b });
          if (q.option_c) options.push({ id: 'c', text: q.option_c });
          if (q.option_d) options.push({ id: 'd', text: q.option_d });
          if (q.option_e) options.push({ id: 'e', text: q.option_e });
        }

        const diff = { easy: 'fácil' as const, medium: 'média' as const, hard: 'difícil' as const }[q.difficulty] || 'média' as const;

        return {
          id: String(q.id),
          subjectId: String(q.subject_id),
          topicId: q.topic_id ? String(q.topic_id) : null,
          topic: q.topics?.name || "Geral",
          subtopic: "",
          difficulty: diff,
          year: q.source_year || new Date().getFullYear(),
          board: q.exam_boards?.name || "Banca",
          organ: q.format === 'true_false' ? 'Certo/Errado' : (q.question_type === 'ia' ? 'IA' : 'Banca'),
          statement: q.statement,
          options,
          correctOption: q.correct_option.toLowerCase(),
          explanation: q.explanation || "",
          format: q.format || "multiple_choice",
        };
      });
    },
    staleTime: 1000 * 60 * 10,
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  FLASHCARDS                                            */
/* ═══════════════════════════════════════════════════════ */
export function useFlashcards(courseId?: string | null) {
  return useQuery({
    queryKey: ['flashcards', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flashcards')
        .select(`id, subject_id, topic_id, front_text, back_text, difficulty,
                 topics(name, target_course_ids)`)
        .eq('is_active', true)
        .eq('status', 'published');
      if (error) throw error;
      let filtered = data || [];
      if (courseId) {
        const cid = Number(courseId);
        filtered = filtered.filter(row => !row.topics?.target_course_ids || row.topics.target_course_ids.length === 0 || row.topics.target_course_ids.includes(cid));
      }
      return filtered.map((f: any): Flashcard => ({
        id: String(f.id),
        subjectId: String(f.subject_id),
        topicId: f.topic_id ? String(f.topic_id) : null,
        topic: f.topics?.name || "Geral",
        front: f.front_text,
        back: f.back_text,
      }));
    },
    staleTime: 1000 * 60 * 10,
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  SUMMARIES  (replaces resumosDb)                       */
/* ═══════════════════════════════════════════════════════ */
export interface SummaryItem {
  id: string;
  subjectId: string;
  topicId: string | null;
  title: string;
  contentHtml: string | null;
  contentMarkdown: string | null;
  format: string;
  sortOrder: number;
}

export function useSummaries(courseId?: string | null) {
  return useQuery({
    queryKey: ['summaries', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('summaries')
        .select(`id, subject_id, topic_id, subtopic_id, title, format, content_html, content_markdown, sort_order,
                 topics(name, target_course_ids), subtopics(name)`)
        .eq('is_active', true)
        .eq('status', 'published')
        .order('sort_order');
      if (error) throw error;
      let filtered = data || [];
      if (courseId) {
        const cid = Number(courseId);
        filtered = filtered.filter((row: any) => !row.topics?.target_course_ids || row.topics.target_course_ids.length === 0 || row.topics.target_course_ids.includes(cid));
      }

      return filtered.map((s: any): SummaryItem => ({
        id: String(s.id),
        subjectId: String(s.subject_id),
        topicId: s.topic_id ? String(s.topic_id) : null,
        title: s.title,
        contentHtml: s.content_html,
        contentMarkdown: s.content_markdown,
        format: s.format,
        sortOrder: s.sort_order,
      }));
    },
    staleTime: 1000 * 60 * 10,
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  COURSES & EDICTS                                      */
/* ═══════════════════════════════════════════════════════ */
export interface CourseRow {
  id: string;
  name: string;
  description: string | null;
  examDate: string | null;
}

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('*').eq('is_active', true);
      if (error) throw error;
      return (data || []).map((c: any): CourseRow => ({
        id: String(c.id),
        name: c.name,
        description: c.description,
        examDate: c.exam_date ? c.exam_date.split('T')[0] : null,
      }));
    },
    staleTime: 1000 * 60 * 30,
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  MUTATIONS — Record answers & reviews                  */
/* ═══════════════════════════════════════════════════════ */
export function useRecordAnswer() {
  const qc = useQueryClient();
  const notifications = useNotificationContext();
  
  return useMutation({
    mutationFn: async (vars: { userId: string; questionId: number; selectedOption: string; isCorrect: boolean }) => {
      // 1. Insert attempt
      const { error: attErr } = await supabase.from('question_attempts').insert({
        user_id: vars.userId,
        question_id: vars.questionId,
        selected_option: vars.selectedOption.toUpperCase(),
        is_correct: vars.isCorrect,
      });
      if (attErr) throw attErr;

      // 2. Upsert stats
      const { data: existing } = await supabase
        .from('user_question_stats')
        .select('*')
        .eq('user_id', vars.userId)
        .eq('question_id', vars.questionId)
        .maybeSingle();

      if (existing) {
        await supabase.from('user_question_stats').update({
          total_attempts: existing.total_attempts + 1,
          total_correct: existing.total_correct + (vars.isCorrect ? 1 : 0),
          total_wrong: existing.total_wrong + (vars.isCorrect ? 0 : 1),
          last_answered_at: new Date().toISOString(),
          last_selected_option: vars.selectedOption.toUpperCase(),
          last_is_correct: vars.isCorrect,
        }).eq('user_id', vars.userId).eq('question_id', vars.questionId);
      } else {
        await supabase.from('user_question_stats').insert({
          user_id: vars.userId,
          question_id: vars.questionId,
          total_attempts: 1,
          total_correct: vars.isCorrect ? 1 : 0,
          total_wrong: vars.isCorrect ? 0 : 1,
          first_answered_at: new Date().toISOString(),
          last_answered_at: new Date().toISOString(),
          last_selected_option: vars.selectedOption.toUpperCase(),
          last_is_correct: vars.isCorrect,
        });
      }

      // 3. Grant XP
      const xp = vars.isCorrect ? 15 : 3;
      await supabase.from('user_xp_logs').insert({
        user_id: vars.userId,
        source_type: 'question',
        source_id: vars.questionId,
        xp_amount: xp,
        description: vars.isCorrect ? 'Acerto em questão' : 'Tentativa de questão',
      });

      // 4. Update profile XP
      const { error: rpcErr } = await supabase.rpc('increment_xp', { user_id_arg: vars.userId, xp_arg: xp });
      if (rpcErr) {
        // fallback if RPC doesn't exist
        const { data: profileData } = await supabase.from('profiles').select('xp_total').eq('id', vars.userId).maybeSingle();
        if (profileData) {
          await supabase.from('profiles').update({ xp_total: (profileData.xp_total || 0) + xp }).eq('id', vars.userId);
        }
      }

      // 5. Update daily productivity
      const today = new Date().toISOString().split('T')[0];
      const { data: prod } = await supabase
        .from('user_daily_productivity')
        .select('*')
        .eq('user_id', vars.userId)
        .eq('productivity_date', today)
        .maybeSingle();

      if (prod) {
        await supabase.from('user_daily_productivity').update({
          questions_answered: prod.questions_answered + 1,
          questions_correct: prod.questions_correct + (vars.isCorrect ? 1 : 0),
          questions_wrong: prod.questions_wrong + (vars.isCorrect ? 0 : 1),
          xp_earned: prod.xp_earned + xp,
        }).eq('id', prod.id);
      } else {
        await supabase.from('user_daily_productivity').insert({
          user_id: vars.userId,
          productivity_date: today,
          questions_answered: 1,
          questions_correct: vars.isCorrect ? 1 : 0,
          questions_wrong: vars.isCorrect ? 0 : 1,
          xp_earned: xp,
        });

        const { data: profile } = await supabase.from('profiles').select('streak_days, last_access_at').eq('id', vars.userId).maybeSingle();
        if (profile) {
          let newStreak = 1;
          if (profile.last_access_at) {
            const lastDate = new Date(profile.last_access_at);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (lastDate.toDateString() === yesterday.toDateString()) {
              newStreak = (profile.streak_days || 0) + 1;
            } else if (lastDate.toDateString() === new Date().toDateString()) {
              newStreak = profile.streak_days || 1;
            }
          }
        await supabase.from('profiles').update({ 
          streak_days: newStreak, 
          last_access_at: new Date().toISOString() 
        }).eq('id', vars.userId);
        }
      }

      // Update mission progress
      try {
        const today = new Date().toISOString().split('T')[0];
        const { data: mission } = await supabase
          .from('daily_missions')
          .select('*')
          .eq('user_id', vars.userId)
          .eq('mission_date', today)
          .maybeSingle();

        if (mission && mission.status !== 'completed') {
          const newQuestionsCompleted = (mission.questions_completed || 0) + 1;
          const updates: Record<string, any> = {
            questions_completed: newQuestionsCompleted,
            updated_at: new Date().toISOString(),
          };
          if (mission.status === 'pending') {
            updates.status = 'in_progress';
            updates.started_at = new Date().toISOString();
          }
          
          // Verificar se todas as etapas foram concluídas (considerando > 0)
          const questionsTarget = mission.questions_count || 0;
          const flashcardsTarget = mission.flashcards_count || 0;
          const summaryTarget = mission.summary_count || 0;
          
          const allQuestionsDone = questionsTarget === 0 || newQuestionsCompleted >= questionsTarget;
          const allFlashcardsDone = flashcardsTarget === 0 || (mission.flashcards_completed || 0) >= flashcardsTarget;
          const allSummariesDone = summaryTarget === 0 || (mission.summary_completed || 0) >= summaryTarget;
          
          if (allQuestionsDone && allFlashcardsDone && allSummariesDone) {
            updates.status = 'completed';
            updates.completed_at = new Date().toISOString();
            console.log('[useRecordAnswer] Missão completada!');
          }
          
          await supabase
            .from('daily_missions')
            .update(updates)
            .eq('id', mission.id);
        }
      } catch (e) {
        console.error('[useRecordAnswer] Erro ao atualizar missão:', e);
      }

      // Check achievements
      console.log('[useRecordAnswer] Verificando conquistas...');
      try {
        // Buscar conquistas já desbloqueadas
        const { data: existingData, error: fetchErr } = await supabase
          .from('user_achievements')
          .select('achievement_id')
          .eq('user_id', vars.userId);

        if (fetchErr) {
          console.error('[useRecordAnswer] Erro ao buscar conquistas:', fetchErr);
        } else {
          const unlockedIds = new Set(existingData?.map((a: any) => a.achievement_id) || []);
          console.log('[useRecordAnswer] IDs desbloqueados:', Array.from(unlockedIds));

          // Buscar stats
          const { data: profileData } = await supabase
            .from('profiles')
            .select('xp_total, streak_days')
            .eq('id', vars.userId)
            .single();

          const { data: qStats } = await supabase
            .from('user_question_stats')
            .select('total_attempts, total_correct')
            .eq('user_id', vars.userId);

          const totalAnswered = qStats?.reduce((sum: number, s: any) => sum + (s.total_attempts || 0), 0) || 0;
          const totalCorrect = qStats?.reduce((sum: number, s: any) => sum + (s.total_correct || 0), 0) || 0;

          // Importar conquistas localmente para evitar dependência circular
          // ACHIEVEMENTS já está importado no topo do arquivo

          const unlocked: any[] = [];

          for (const achievement of ACHIEVEMENTS) {
            if (unlockedIds.has(achievement.id) || achievement.isSecret) continue;

            let isUnlocked = false;

            switch (achievement.category) {
              case 'questions':
                isUnlocked = totalAnswered >= achievement.requirement;
                break;
              case 'streak':
                isUnlocked = (profileData?.streak_days || 0) >= achievement.requirement;
                break;
              case 'xp':
                isUnlocked = (profileData?.xp_total || 0) >= achievement.requirement;
                break;
              case 'accuracy':
                isUnlocked = totalCorrect >= achievement.requirement;
                break;
            }

            if (isUnlocked) {
              console.log(`[useRecordAnswer] ✅ Conquista: ${achievement.name}`);
              unlocked.push(achievement);

              // Inserir no banco
              await supabase.from('user_achievements').insert({
                user_id: vars.userId,
                achievement_id: achievement.id,
                unlocked_at: new Date().toISOString(),
                notification_shown: false,
              });

              // Adicionar XP
              if (achievement.xpReward > 0) {
                const { error: rpcErr } = await supabase.rpc('increment_xp', {
                  user_id_arg: vars.userId,
                  xp_arg: achievement.xpReward,
                });
                if (rpcErr) {
                  const { data: prof } = await supabase.from('profiles').select('xp_total').eq('id', vars.userId).single();
                  if (prof) {
                    await supabase.from('profiles').update({ xp_total: (prof.xp_total || 0) + achievement.xpReward }).eq('id', vars.userId);
                  }
                }
              }
            }
          }

          // Mostrar toast
          if (unlocked.length > 0) {
            if (unlocked.length === 1) {
              const a = unlocked[0];
              toast.success(`🏆 Conquista Desbloqueada!`, {
                description: `${a.icon} ${a.name}\n${a.description}`,
                duration: 6000,
              });
            } else {
              toast.success(`🎉 ${unlocked.length} Conquistas Desbloqueadas!`, {
                description: unlocked.map((a) => `${a.icon} ${a.name}`).join(' • '),
                duration: 6000,
              });
            }
          }
        }
        
        // Marcar como estudado e verificar streak
        notifications.markAsStudied();
        
        // Verificar e notificar streak
        notifications.checkAndNotify(vars.userId);
      } catch (e) {
        console.error('[useRecordAnswer] Erro geral nas conquistas:', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userProfile'] });
      qc.invalidateQueries({ queryKey: ['userProductivity'] });
      qc.invalidateQueries({ queryKey: ['userLifetimeUsage'] });
      qc.invalidateQueries({ queryKey: ['userQuestionStats'] });
      qc.invalidateQueries({ queryKey: ['userAchievements'] });
      qc.invalidateQueries({ queryKey: ['daily-mission'] });
    },
  });
}

export function useRecordFlashcardReview() {
  const qc = useQueryClient();
  const notifications = useNotificationContext();
  
  return useMutation({
    mutationFn: async (vars: { userId: string; flashcardId: number; result: 'wrong' | 'hard' | 'good' | 'easy' }) => {
      const intervalMap = { wrong: 1, hard: 2, good: 4, easy: 7 };
      const newInterval = intervalMap[vars.result];
      const nextReview = new Date();
      nextReview.setDate(nextReview.getDate() + newInterval);

      // Upsert review record
      const { data: existing } = await supabase
        .from('user_flashcard_reviews')
        .select('*')
        .eq('user_id', vars.userId)
        .eq('flashcard_id', vars.flashcardId)
        .maybeSingle();

      const isCorrect = vars.result !== 'wrong';

      if (existing) {
        await supabase.from('user_flashcard_reviews').update({
          total_reviews: existing.total_reviews + 1,
          total_correct: existing.total_correct + (isCorrect ? 1 : 0),
          total_wrong: existing.total_wrong + (isCorrect ? 0 : 1),
          current_interval_days: newInterval,
          last_review_result: vars.result,
          last_reviewed_at: new Date().toISOString(),
          next_review_at: nextReview.toISOString(),
          memory_stage: isCorrect ? Math.min(existing.memory_stage + 1, 10) : 1,
          is_mastered: isCorrect && existing.memory_stage >= 5,
        }).eq('user_id', vars.userId).eq('flashcard_id', vars.flashcardId);
      } else {
        await supabase.from('user_flashcard_reviews').insert({
          user_id: vars.userId,
          flashcard_id: vars.flashcardId,
          total_reviews: 1,
          total_correct: isCorrect ? 1 : 0,
          total_wrong: isCorrect ? 0 : 1,
          current_interval_days: newInterval,
          last_review_result: vars.result,
          last_reviewed_at: new Date().toISOString(),
          next_review_at: nextReview.toISOString(),
          memory_stage: isCorrect ? 2 : 1,
        });
      }

      // Log the review
      await supabase.from('flashcard_review_logs').insert({
        user_id: vars.userId,
        flashcard_id: vars.flashcardId,
        review_result: vars.result,
        interval_after: newInterval,
      });

      // XP
      const xp = 5;
      const { error: rpcErr } = await supabase.rpc('increment_xp', { user_id_arg: vars.userId, xp_arg: xp });
      if (rpcErr) {
         const { data: profileData } = await supabase.from('profiles').select('xp_total').eq('id', vars.userId).maybeSingle();
         if (profileData) {
            await supabase.from('profiles').update({ xp_total: (profileData.xp_total || 0) + xp }).eq('id', vars.userId);
         }
      }

      // Daily productivity
      const today = new Date().toISOString().split('T')[0];
      const { data: prod } = await supabase
        .from('user_daily_productivity')
        .select('*')
        .eq('user_id', vars.userId)
        .eq('productivity_date', today)
        .maybeSingle();

      if (prod) {
        await supabase.from('user_daily_productivity').update({
          flashcards_reviewed: prod.flashcards_reviewed + 1,
          xp_earned: prod.xp_earned + xp,
        }).eq('id', prod.id);
      } else {
        await supabase.from('user_daily_productivity').insert({
          user_id: vars.userId,
          productivity_date: today,
          flashcards_reviewed: 1,
          xp_earned: xp,
        });

        // Compute streak
        const { data: profile } = await supabase.from('profiles').select('streak_days, last_access_at').eq('id', vars.userId).maybeSingle();
        if (profile) {
          let newStreak = 1;
          if (profile.last_access_at) {
            const lastDate = new Date(profile.last_access_at);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (lastDate.toDateString() === yesterday.toDateString()) {
              newStreak = (profile.streak_days || 0) + 1;
            } else if (lastDate.toDateString() === new Date().toDateString()) {
              newStreak = profile.streak_days || 1;
            }
          }
          await supabase.from('profiles').update({ 
            streak_days: newStreak, 
            last_access_at: new Date().toISOString() 
          }).eq('id', vars.userId);
        }
      }

      // Update mission progress for flashcards
      try {
        const today = new Date().toISOString().split('T')[0];
        const { data: mission } = await supabase
          .from('daily_missions')
          .select('*')
          .eq('user_id', vars.userId)
          .eq('mission_date', today)
          .maybeSingle();

        if (mission && mission.status !== 'completed') {
          const newFlashcardsCompleted = (mission.flashcards_completed || 0) + 1;
          const updates: Record<string, any> = {
            flashcards_completed: newFlashcardsCompleted,
            updated_at: new Date().toISOString(),
          };
          if (mission.status === 'pending') {
            updates.status = 'in_progress';
            updates.started_at = new Date().toISOString();
          }
          
          // Verificar se todas as etapas foram concluídas (considerando > 0)
          const questionsTarget = mission.questions_count || 0;
          const flashcardsTarget = mission.flashcards_count || 0;
          const summaryTarget = mission.summary_count || 0;
          
          const allQuestionsDone = questionsTarget === 0 || (mission.questions_completed || 0) >= questionsTarget;
          const allFlashcardsDone = flashcardsTarget === 0 || newFlashcardsCompleted >= flashcardsTarget;
          const allSummariesDone = summaryTarget === 0 || (mission.summary_completed || 0) >= summaryTarget;
          
          if (allQuestionsDone && allFlashcardsDone && allSummariesDone) {
            updates.status = 'completed';
            updates.completed_at = new Date().toISOString();
            console.log('[useRecordFlashcardReview] Missão completada!');
          }
          
          await supabase
            .from('daily_missions')
            .update(updates)
            .eq('id', mission.id);
        }
      } catch (e) {
        console.error('[useRecordFlashcardReview] Erro ao atualizar missão:', e);
      }

      // Check achievements for flashcards
      console.log('[useRecordFlashcardReview] Verificando conquistas...');
      try {
        const { data: existingData, error: fetchErr } = await supabase
          .from('user_achievements')
          .select('achievement_id')
          .eq('user_id', vars.userId);

        if (fetchErr) {
          console.error('[useRecordFlashcardReview] Erro ao buscar conquistas:', fetchErr);
        } else {
          const unlockedIds = new Set(existingData?.map((a: any) => a.achievement_id) || []);

          const { data: profileData } = await supabase
            .from('profiles')
            .select('xp_total, streak_days')
            .eq('id', vars.userId)
            .single();

          const { data: allFlashcards } = await supabase
            .from('user_flashcard_reviews')
            .select('total_reviews')
            .eq('user_id', vars.userId);

          const totalFlashcards = allFlashcards?.reduce((sum: number, s: any) => sum + (s.total_reviews || 0), 0) || 0;

          // ACHIEVEMENTS já está importado no topo do arquivo

          const unlocked: any[] = [];

          for (const achievement of ACHIEVEMENTS) {
            if (unlockedIds.has(achievement.id) || achievement.isSecret) continue;

            let isUnlocked = false;

            switch (achievement.category) {
              case 'flashcards':
                isUnlocked = totalFlashcards >= achievement.requirement;
                break;
              case 'streak':
                isUnlocked = (profileData?.streak_days || 0) >= achievement.requirement;
                break;
              case 'xp':
                isUnlocked = (profileData?.xp_total || 0) >= achievement.requirement;
                break;
            }

            if (isUnlocked) {
              console.log(`[useRecordFlashcardReview] ✅ Conquista: ${achievement.name}`);
              unlocked.push(achievement);

              await supabase.from('user_achievements').insert({
                user_id: vars.userId,
                achievement_id: achievement.id,
                unlocked_at: new Date().toISOString(),
                notification_shown: false,
              });

              if (achievement.xpReward > 0) {
                const { error: rpcErr } = await supabase.rpc('increment_xp', {
                  user_id_arg: vars.userId,
                  xp_arg: achievement.xpReward,
                });
                if (rpcErr) {
                  const { data: prof } = await supabase.from('profiles').select('xp_total').eq('id', vars.userId).single();
                  if (prof) {
                    await supabase.from('profiles').update({ xp_total: (prof.xp_total || 0) + achievement.xpReward }).eq('id', vars.userId);
                  }
                }
              }
            }
          }

          if (unlocked.length > 0) {
            if (unlocked.length === 1) {
              const a = unlocked[0];
              toast.success(`🏆 Conquista Desbloqueada!`, {
                description: `${a.icon} ${a.name}\n${a.description}`,
                duration: 6000,
              });
            } else {
              toast.success(`🎉 ${unlocked.length} Conquistas Desbloqueadas!`, {
                description: unlocked.map((a) => `${a.icon} ${a.name}`).join(' • '),
                duration: 6000,
              });
            }
          }
          
          // Marcar como estudado e verificar streak
          notifications.markAsStudied();
          notifications.checkAndNotify(vars.userId);
        }
      } catch (e) {
        console.error('[useRecordFlashcardReview] Erro geral nas conquistas:', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userProfile'] });
      qc.invalidateQueries({ queryKey: ['userProductivity'] });
      qc.invalidateQueries({ queryKey: ['userLifetimeUsage'] });
      qc.invalidateQueries({ queryKey: ['flashcards'] });
      qc.invalidateQueries({ queryKey: ['userAchievements'] });
      qc.invalidateQueries({ queryKey: ['daily-mission'] });
    },
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  USER STATS (from profile + productivity)              */
/* ═══════════════════════════════════════════════════════ */
export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['userProfile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) return null;
      return data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useUserProductivity(userId: string | undefined) {
  return useQuery({
    queryKey: ['userProductivity', userId],
    queryFn: async () => {
      if (!userId) return null;
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('user_daily_productivity')
        .select('*')
        .eq('user_id', userId)
        .eq('productivity_date', today)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
    staleTime: 1000 * 30, // 30s
  });
}

export function useUserLifetimeUsage(userId: string | undefined) {
  return useQuery({
    queryKey: ['userLifetimeUsage', userId],
    queryFn: async () => {
      if (!userId) return { questionsAndFlashcards: 0, summaries: 0 };
      const { data } = await supabase
        .from('user_daily_productivity')
        .select('questions_answered, flashcards_reviewed, summaries_read')
        .eq('user_id', userId);
        
      if (!data) return { questionsAndFlashcards: 0, summaries: 0 };
      
      return data.reduce((acc, row) => ({
        questionsAndFlashcards: acc.questionsAndFlashcards + (row.questions_answered || 0) + (row.flashcards_reviewed || 0),
        summaries: acc.summaries + (row.summaries_read || 0)
      }), { questionsAndFlashcards: 0, summaries: 0 });
    },
    enabled: !!userId,
    staleTime: 1000 * 30, // 30s
  });
}

export function useUserQuestionStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['userQuestionStats', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_question_stats')
        .select('*')
        .eq('user_id', userId);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useUserFlashcardReviews(userId: string | undefined) {
  return useQuery({
    queryKey: ['userFlashcardReviews', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_flashcard_reviews')
        .select('*')
        .eq('user_id', userId);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });
}
