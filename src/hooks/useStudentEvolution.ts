// useStudentEvolution.ts - Hook para buscar dados de evolução do aluno

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { SUBJECT_COLORS, SUBJECT_ICONS, DEFAULT_ICON, DEFAULT_COLOR } from './useStudyData';

export interface SubjectProgress {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  questionsTotal: number;
  questionsDone: number;
  questionsPercent: number;
  flashcardsTotal: number;
  flashcardsDone: number;
  flashcardsPercent: number;
  summariesTotal: number;
  summariesDone: number;
  summariesPercent: number;
}

export interface StudentEvolution {
  examDate: string | null;
  daysUntilExam: number | null;
  examPassed: boolean;
  questionsTotal: number;
  questionsDone: number;
  questionsPercent: number;
  flashcardsTotal: number;
  flashcardsDone: number;
  flashcardsPercent: number;
  summariesTotal: number;
  summariesDone: number;
  summariesPercent: number;
  overallPercent: number;
  subjectProgress: SubjectProgress[];
}

export function useStudentEvolution(userId: string | undefined, courseId: string | null) {
  return useQuery({
    queryKey: ['studentEvolution', userId, courseId],
    queryFn: async (): Promise<StudentEvolution> => {
      try {
        if (!userId || !courseId) {
          return getEmptyEvolution();
        }

        const courseNumId = parseInt(courseId);

        // 1. Buscar curso para obter exam_date
        const { data: courseData } = await supabase
          .from('courses')
          .select('exam_date')
          .eq('id', courseNumId)
          .maybeSingle();

        const examDate = courseData?.exam_date ? courseData.exam_date.split('T')[0] : null;
        
        // Calcular dias até a prova
        let daysUntilExam: number | null = null;
        let examPassed = false;
        
        if (examDate) {
          const examDateObj = new Date(examDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffTime = examDateObj.getTime() - today.getTime();
          daysUntilExam = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          examPassed = daysUntilExam < 0;
        }

        // 2. Buscar questões do curso (via edicts e edict_subjects)
        const { data: edicts } = await supabase
          .from('edicts')
          .select('id')
          .eq('course_id', courseNumId)
          .eq('is_active', true);

        const edictIds = (edicts || []).map(e => e.id);
        
        let subjectIds: number[] = [];
        if (edictIds.length > 0) {
          const { data: edictSubjects } = await supabase
            .from('edict_subjects')
            .select('subject_id')
            .in('edict_id', edictIds);
          
          subjectIds = Array.from(new Set((edictSubjects || []).map(es => es.subject_id)));
        }

        // Se não encontrou matérias via edicts, buscar todas
        if (subjectIds.length === 0) {
          const { data: allSubjects } = await supabase
            .from('subjects')
            .select('id');
          subjectIds = (allSubjects || []).map(s => s.id);
        }

        // 3. Buscar total de questões disponíveis
        let questionsTotal = 0;
        if (subjectIds.length > 0) {
          const { count } = await supabase
            .from('questions')
            .select('id', { count: 'exact' })
            .in('subject_id', subjectIds)
            .eq('is_active', true)
            .eq('status', 'published');
          questionsTotal = count || 0;
        }

        // 4. Buscar total de questões respondidas pelo aluno (soma histórica)
        const { data: allProductivity } = await supabase
          .from('user_daily_productivity')
          .select('questions_answered')
          .eq('user_id', userId);

        let questionsDone = 0;
        if (allProductivity) {
          questionsDone = allProductivity.reduce((sum, p) => sum + (p.questions_answered || 0), 0);
        }

        // 5. Buscar total de flashcards disponíveis
        let flashcardsTotal = 0;
        if (subjectIds.length > 0) {
          const { count } = await supabase
            .from('flashcards')
            .select('id', { count: 'exact' })
            .in('subject_id', subjectIds)
            .eq('is_active', true);
          flashcardsTotal = count || 0;
        }

        // 6. Buscar flashcards revisados pelo usuário (do curso)
        let flashcardsDone = 0;
        if (subjectIds.length > 0) {
          const { data: fcReviews } = await supabase
            .from('user_flashcard_reviews')
            .select('flashcard_id')
            .eq('user_id', userId);

          if (fcReviews && fcReviews.length > 0) {
            const flashcardIds = fcReviews.map(f => f.flashcard_id);
            const { data: userFlashcards } = await supabase
              .from('flashcards')
              .select('id')
              .in('id', flashcardIds)
              .in('subject_id', subjectIds)
              .eq('is_active', true);
            
            flashcardsDone = (userFlashcards || []).length;
          }
        }

        // 7. Buscar total de resumos
        let summariesTotal = 0;
        if (subjectIds.length > 0) {
          const { count } = await supabase
            .from('summaries')
            .select('id', { count: 'exact' })
            .in('subject_id', subjectIds)
            .eq('is_active', true);
          summariesTotal = count || 0;
        }

        // 8. Buscar resumos visualizados pelo usuário (do curso)
        let summariesDone = 0;
        const { data: summaryViews, error: svError } = await supabase
          .from('user_summary_views')
          .select('summary_id')
          .eq('user_id', userId);

        console.log('[useStudentEvolution] summaryViews:', summaryViews, 'error:', svError);

        if (summaryViews && summaryViews.length > 0 && subjectIds.length > 0) {
          const summaryIds = summaryViews.map(s => s.summary_id);
          console.log('[useStudentEvolution] summaryIds:', summaryIds, 'subjectIds:', subjectIds);
          
          const { data: userSummaries } = await supabase
            .from('summaries')
            .select('id')
            .in('id', summaryIds)
            .in('subject_id', subjectIds)
            .eq('is_active', true);
          
          console.log('[useStudentEvolution] userSummaries:', userSummaries);
          summariesDone = (userSummaries || []).length;
        }

        // 9. Buscar progresso por matéria
        const subjectProgress: SubjectProgress[] = [];
        
        if (subjectIds.length > 0) {
          const { data: subjects } = await supabase
            .from('subjects')
            .select('id, name')
            .in('id', subjectIds)
            .order('name');

          for (const subj of (subjects || [])) {
            // Questões da matéria
            const { count: subjQuestionsTotal } = await supabase
              .from('questions')
              .select('id', { count: 'exact' })
              .eq('subject_id', subj.id)
              .eq('is_active', true)
              .eq('status', 'published');
            
            const subjQuestionsDone = 0; // Simplificado - não calcula por matéria
            const questionsPercent = subjQuestionsTotal ? Math.round((subjQuestionsDone / subjQuestionsTotal) * 100) : 0;

            // Flashcards da matéria
            const { count: subjFlashcardsTotal } = await supabase
              .from('flashcards')
              .select('id', { count: 'exact' })
              .eq('subject_id', subj.id)
              .eq('is_active', true);

            const subjFlashcardsDone = 0; // Simplificado
            const flashcardsPercent = subjFlashcardsTotal ? Math.round((subjFlashcardsDone / subjFlashcardsTotal) * 100) : 0;

            // Resumos da matéria
            const { count: subjSummariesTotal } = await supabase
              .from('summaries')
              .select('id', { count: 'exact' })
              .eq('subject_id', subj.id)
              .eq('is_active', true);

            const subjSummariesDone = 0; // Simplificado
            const summariesPercent = subjSummariesTotal ? Math.round((subjSummariesDone / subjSummariesTotal) * 100) : 0;

            const IconComponent = SUBJECT_ICONS[subj.name] || DEFAULT_ICON;
            const color = SUBJECT_COLORS[subj.name] || DEFAULT_COLOR;

            subjectProgress.push({
              id: String(subj.id),
              name: subj.name,
              icon: IconComponent,
              color,
              questionsTotal: subjQuestionsTotal || 0,
              questionsDone: subjQuestionsDone,
              questionsPercent,
              flashcardsTotal: subjFlashcardsTotal || 0,
              flashcardsDone: subjFlashcardsDone,
              flashcardsPercent,
              summariesTotal: subjSummariesTotal || 0,
              summariesDone: subjSummariesDone,
              summariesPercent,
            });
          }
        }

        const questionsPercent = questionsTotal > 0 ? Math.round((questionsDone / questionsTotal) * 100) : 0;
        const flashcardsPercent = flashcardsTotal > 0 ? Math.round((flashcardsDone / flashcardsTotal) * 100) : 0;
        const summariesPercent = summariesTotal > 0 ? Math.round((summariesDone / summariesTotal) * 100) : 0;
        
        const hasQuestions = questionsTotal > 0;
        const hasFlashcards = flashcardsTotal > 0;
        const hasSummaries = summariesTotal > 0;
        const totalCategories = (hasQuestions ? 1 : 0) + (hasFlashcards ? 1 : 0) + (hasSummaries ? 1 : 0);
        const overallPercent = totalCategories > 0 
          ? Math.round((questionsPercent * (hasQuestions ? 1 : 0) + flashcardsPercent * (hasFlashcards ? 1 : 0) + summariesPercent * (hasSummaries ? 1 : 0)) / totalCategories)
          : 0;

        return {
          examDate,
          daysUntilExam,
          examPassed,
          questionsTotal,
          questionsDone,
          questionsPercent,
          flashcardsTotal,
          flashcardsDone,
          flashcardsPercent,
          summariesTotal,
          summariesDone,
          summariesPercent,
          overallPercent,
          subjectProgress,
        };
      } catch (error) {
        console.error('[useStudentEvolution] Erro:', error);
        return getEmptyEvolution();
      }
    },
    enabled: !!userId && !!courseId,
    staleTime: 1000 * 60 * 5,
  });
}

function getEmptyEvolution(): StudentEvolution {
  return {
    examDate: null,
    daysUntilExam: null,
    examPassed: false,
    questionsTotal: 0,
    questionsDone: 0,
    questionsPercent: 0,
    flashcardsTotal: 0,
    flashcardsDone: 0,
    flashcardsPercent: 0,
    summariesTotal: 0,
    summariesDone: 0,
    summariesPercent: 0,
    overallPercent: 0,
    subjectProgress: [],
  };
}

// Frases motivacionais diárias
const MOTIVATIONAL_PHRASES = [
  "Constância vence intensidade sem direção.",
  "Cada questão resolvida reduz a distância até a aprovação.",
  "Disciplina hoje, resultado no dia da prova.",
  "O sucesso é a soma de pequenos esforços repetidos dia após dia.",
  "Não espere pela motivação; crie disciplina.",
  "O conteúdo que você estuda hoje é a aprovação de amanhã.",
  "Estude como se fosse a última vez. Persistence is key.",
  "Cada flashcard revisado é um passo a menos para o erro no dia da prova.",
  "A aprovação não é sorte, é consequência do estudo consistente.",
  "Quanto mais você estuda, mais sorte você parece ter.",
  "O segredo do sucesso é fazer as coisas que os outros não querem fazer.",
  "Hoje é o dia de estudo. Amanhã é o dia da conquista.",
  "A diferença entre possível e impossível está na determinação.",
  "Não pare quando cansar. Pare quando chegar.",
  "Seu futuro é criado nas manhãs de hoje.",
  "Aprovação é destino. Estudo é o caminho.",
];

export function getDailyMotivationalPhrase(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const index = dayOfYear % MOTIVATIONAL_PHRASES.length;
  return MOTIVATIONAL_PHRASES[index];
}
