import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Subject, Question, Flashcard } from '@/types/study';
import { toast } from 'sonner';
import { ACHIEVEMENTS } from '@/types/achievements';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { Scale, FileText, BookOpen, Building2, Users, PenTool, BookOpenIcon } from 'lucide-react';
import { fetchSecureContent } from '@/services/secureContentService';
import { answerStudyQuestion, recordStudyFlashcardReview, type FlashcardRating } from '@/services/studyAccessService';
import { invalidateStudyProgress, showStudyAchievements } from '@/lib/studyProgress';
import { getStudyDate } from '@/lib/studyDate';
import { rememberLastStudyFeedback } from '@/lib/lastStudyFeedback';

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

      const allSubjects = await fetchSecureContent<any>('subjects', { courseId });

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
      if (courseId === null) return [];
      const data = await fetchSecureContent<any>('topics', { courseId });
      return data.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    },
    staleTime: 1000 * 60 * 30,
  });
}

/* ═══════════════════════════════════════════════════════ */
/*  QUESTIONS                                             */
/* ═══════════════════════════════════════════════════════ */
export function useQuestions(courseId?: string | null, activeLawIds?: number[] | null) {
  return useQuery({
    queryKey: ['questions', courseId, activeLawIds],
    queryFn: async () => {
      if (courseId === null) return [];
      const filtered = await fetchSecureContent<any>('questions', {
        courseId,
        lawIds: activeLawIds,
      });

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
          
          // Embaralhar opções localmente (Fisher-Yates) para evitar vício de resposta sem afetar o BD
          for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
          }
        }

        const diff = { easy: 'fácil' as const, medium: 'média' as const, hard: 'difícil' as const }[q.difficulty] || 'média' as const;

        return {
          id: String(q.id),
          subjectId: String(q.subject_id),
          topicId: q.topic_id ? String(q.topic_id) : null,
          lawReferenceId: q.law_reference_id ? Number(q.law_reference_id) : null,
          lawReferenceName: q.law_references?.short_name || q.law_references?.name || null,
          topic: q.topics?.name || "Geral",
          subtopic: "",
          difficulty: diff,
          year: q.source_year || new Date().getFullYear(),
          board: q.exam_boards?.name || "Banca",
          organ: q.format === 'true_false' ? 'Certo/Errado' : (q.question_type === 'ia' ? 'IA' : 'Banca'),
          statement: q.statement,
          options,
          correctOption: q.correct_option?.toLowerCase() || '',
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
export function useFlashcards(courseId?: string | null, activeLawIds?: number[] | null) {
  return useQuery({
    queryKey: ['flashcards', courseId, activeLawIds],
    queryFn: async () => {
      const filtered = await fetchSecureContent<any>('flashcards', {
        courseId,
        lawIds: activeLawIds,
      });
      return filtered.map((f: any): Flashcard => ({
        id: String(f.id),
        subjectId: String(f.subject_id),
        topicId: f.topic_id ? String(f.topic_id) : null,
        lawReferenceId: f.law_reference_id ? Number(f.law_reference_id) : null,
        lawReferenceName: (f as any).law_references?.short_name || (f as any).law_references?.name || null,
        topic: f.topics?.name || "Geral",
        front: f.front_text,
        back: f.back_text || '',
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
  lawReferenceId: number | null;
  lawReferenceName: string | null;
}

export function useSummaries(courseId?: string | null, activeLawIds?: number[] | null) {
  return useQuery({
    queryKey: ['summaries', courseId, activeLawIds],
    queryFn: async () => {
      const filtered = await fetchSecureContent<any>('summaries', {
        courseId,
        lawIds: activeLawIds,
      });

      return filtered.map((s: any): SummaryItem => ({
        id: String(s.id),
        subjectId: String(s.subject_id),
        topicId: s.topic_id ? String(s.topic_id) : null,
        lawReferenceId: s.law_reference_id ? Number(s.law_reference_id) : null,
        lawReferenceName: s.law_references?.short_name || s.law_references?.name || null,
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
/*  FILTRO DE LEIS ATIVAS POR CURSO (via edital + normas) */
/* ═══════════════════════════════════════════════════════ */
/**
 * Retorna os IDs dos law_references ativos para o edital mais recente do curso.
 * - null  → nenhuma norma vinculada ao edital, sem filtro restritivo (exibe tudo)
 * - []    → edital sem leis, aplica filtro vazio (nada seria exibido, situação inesperada)
 * - [1,2] → IDs das leis permitidas para o curso
 */
export function useActiveLawIdsForCourse(courseId?: number | null, editalId?: number | null) {
  return useQuery({
    queryKey: ['active_law_ids', courseId, editalId],
    queryFn: async () => {
      let targetEdictId = editalId;

      // Se não tem editalId, busca o mais recente do curso
      if (!targetEdictId && courseId) {
        const { data: edicts, error: edictsErr } = await supabase
          .from('edicts')
          .select('id')
          .eq('course_id', courseId)
          .eq('is_active', true)
          .order('year', { ascending: false })
          .limit(1);

        if (!edictsErr && edicts && edicts.length > 0) {
          targetEdictId = edicts[0].id;
        }
      }

      if (!targetEdictId) return null; // Sem edital → sem filtro restritivo

      // Busca as leis vinculadas a esse edital
      const { data: links, error: linksErr } = await supabase
        .from('edital_law_references')
        .select('law_reference_id')
        .eq('edital_id', targetEdictId);

      if (linksErr) throw linksErr;
      if (!links || links.length === 0) return null; // Edital sem leis → sem filtro restritivo

      return links.map((l: any) => Number(l.law_reference_id));
    },
    staleTime: 1000 * 60 * 15,
    enabled: courseId !== undefined && courseId !== null,
  });
}


/* ═══════════════════════════════════════════════════════ */
/*  MUTATIONS — Record answers & reviews                  */
/* ═══════════════════════════════════════════════════════ */
export function useRecordAnswer() {
  const qc = useQueryClient();
  const notifications = useNotificationContext();
  return useMutation({
    mutationFn: (vars: { userId: string; questionId: number; selectedOption: string; isCorrect?: boolean; requestId?: string }) =>
      answerStudyQuestion(vars.questionId, vars.selectedOption, vars.requestId || crypto.randomUUID()),
    onSuccess: (feedback, variables) => {
      rememberLastStudyFeedback(qc, variables.userId, { type: 'questions', id: variables.questionId,
        requestId: variables.requestId || '', feedback });
      qc.setQueryData(['studyAccess', variables.userId], feedback);
      invalidateStudyProgress(qc, feedback.entitled || feedback.remaining !== 0);
      showStudyAchievements(feedback);
      notifications.markAsStudied();
    },
  });
}

export function useRecordFlashcardReview() {
  const qc = useQueryClient();
  const notifications = useNotificationContext();
  return useMutation({
    mutationFn: (vars: { userId: string; flashcardId: number; result: FlashcardRating; requestId: string }) =>
      recordStudyFlashcardReview(vars.flashcardId, vars.result, vars.requestId),
    onSuccess: (feedback, variables) => {
      qc.setQueryData(['studyAccess', variables.userId], feedback);
      invalidateStudyProgress(qc, feedback.entitled || feedback.remaining !== 0);
      showStudyAchievements(feedback);
      notifications.markAsStudied();
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
  const today = getStudyDate();
  return useQuery({
    queryKey: ['userProductivity', userId, today],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('user_daily_productivity')
        .select('*')
        .eq('user_id', userId)
        .eq('productivity_date', today)
        .maybeSingle();
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('user_daily_productivity')
        .select('questions_answered, flashcards_reviewed, summaries_read')
        .eq('user_id', userId);
      if (error) throw error;
        
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
      if (error) throw error;
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
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}
