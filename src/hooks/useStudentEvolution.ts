// useStudentEvolution.ts - Hook para buscar dados de evolução do aluno

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  examDateFormatted: string | null;
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

        const cid = parseInt(courseId);

        // 1. Buscar data da prova do PERFIL do usuário
        const { data: profileData } = await supabase
          .from('profiles')
          .select('exam_date')
          .eq('id', userId)
          .maybeSingle();

        const examDate = profileData?.exam_date ? String(profileData.exam_date).split('T')[0] : null;
        const examDateFormatted = examDate 
          ? (() => {
              const [y, m, d] = examDate.split('-');
              return `${d}/${m}/${y}`;
            })()
          : null;
        
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

        // 2. Buscar TODAS as matérias
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('id, name')
          .order('name');
        
        const subjects = subjectsData || [];

        // 3. Buscar TODOS os topics
        const { data: allTopics } = await supabase
          .from('topics')
          .select('id, name, subject_id, target_course_ids');
        
        // Filtrar topics visíveis para o curso
        const visibleTopicIds: number[] = [];
        (allTopics || []).forEach((t: any) => {
          if (!t.target_course_ids || t.target_course_ids.length === 0 || t.target_course_ids.includes(cid)) {
            visibleTopicIds.push(t.id);
          }
        });

        // 4. Questões Disponíveis e Respondidas - com paginação
        let allQuestions: any[] = [];
        let qPage = 0;
        const pageSize = 1000;
        
        while (true) {
          const { data: questionsPage } = await supabase
            .from('questions')
            .select('id, topic_id, subject_id, topics(target_course_ids)')
            .eq('is_active', true)
            .eq('status', 'published')
            .range(qPage * pageSize, (qPage + 1) * pageSize - 1);
          
          if (!questionsPage || questionsPage.length === 0) break;
          allQuestions = [...allQuestions, ...questionsPage];
          qPage++;
          if (questionsPage.length < pageSize) break;
        }
        
        // Filtrar questões vinculadas ao curso
        const questions = allQuestions.filter((q: any) => {
          const tc = q.topics?.target_course_ids;
          return !tc || tc.length === 0 || tc.includes(cid);
        });
        const questionsTotal = questions.length;

        // Respondidas pelo usuário - buscar de TODOS os dias na user_daily_productivity
        let allProdQuestions = 0;
        let prodPage = 0;
        
        while (true) {
          const { data: prodData } = await supabase
            .from('user_daily_productivity')
            .select('questions_answered')
            .eq('user_id', userId)
            .range(prodPage * pageSize, (prodPage + 1) * pageSize - 1);
          
          if (!prodData || prodData.length === 0) break;
          allProdQuestions += prodData.reduce((sum, p) => sum + (p.questions_answered || 0), 0);
          prodPage++;
          if (prodData.length < pageSize) break;
        }
        
        const questionsDone = allProdQuestions;

        // 5. Flashcards Disponíveis e Revisados - com paginação
        let allFlashcards: any[] = [];
        let fcPage = 0;
        
        while (true) {
          const { data: flashcardsPage } = await supabase
            .from('flashcards')
            .select('id, topic_id, subject_id, topics(target_course_ids)')
            .eq('is_active', true)
            .range(fcPage * pageSize, (fcPage + 1) * pageSize - 1);
          
          if (!flashcardsPage || flashcardsPage.length === 0) break;
          allFlashcards = [...allFlashcards, ...flashcardsPage];
          fcPage++;
          if (flashcardsPage.length < pageSize) break;
        }
        
        // Filtrar flashcards vinculados ao curso
        const flashcards = allFlashcards.filter((f: any) => {
          const tc = f.topics?.target_course_ids;
          return !tc || tc.length === 0 || tc.includes(cid);
        });
        const flashcardsTotal = flashcards.length;

        const { data: fcReviews } = await supabase
          .from('user_flashcard_reviews')
          .select('flashcard_id')
          .eq('user_id', userId);
        
        const reviewedIds = new Set((fcReviews || []).map(r => String(r.flashcard_id)));
        const flashcardsDoneCards = flashcards.filter(f => reviewedIds.has(String(f.id)));
        const flashcardsDone = flashcardsDoneCards.length;

        // 6. Resumos Disponíveis e Visualizados - com paginação
        let allSummaries: any[] = [];
        let sPage = 0;
        
        while (true) {
          const { data: summariesPage } = await supabase
            .from('summaries')
            .select('id, topic_id, subject_id, topics(target_course_ids)')
            .eq('is_active', true)
            .range(sPage * pageSize, (sPage + 1) * pageSize - 1);
          
          if (!summariesPage || summariesPage.length === 0) break;
          allSummaries = [...allSummaries, ...summariesPage];
          sPage++;
          if (summariesPage.length < pageSize) break;
        }
        
        // Filtrar resumos vinculados ao curso
        const summaries = allSummaries.filter((s: any) => {
          const tc = s.topics?.target_course_ids;
          return !tc || tc.length === 0 || tc.includes(cid);
        });
        const summariesTotal = summaries.length;

        const { data: sumViews } = await supabase
          .from('user_summary_views')
          .select('summary_id')
          .eq('user_id', userId);
        
        const viewedIds = new Set((sumViews || []).map(v => String(v.summary_id)));
        const summariesDoneItems = summaries.filter(s => viewedIds.has(String(s.id)));
        const summariesDone = summariesDoneItems.length;

        // 7. Calcular Progresso por Matéria
        const subjectProgress: SubjectProgress[] = subjects.map(subj => {
          const sQuestionsTotal = questions.filter(q => q.subject_id === subj.id).length;
          const sQuestionsDone = 0; // Simplificado
          
          const sFlashcardsTotal = flashcards.filter(f => f.subject_id === subj.id).length;
          const sFlashcardsDone = flashcardsDoneCards.filter(f => f.subject_id === subj.id).length;

          const sSummariesTotal = summaries.filter(s => s.subject_id === subj.id).length;
          const sSummariesDone = summariesDoneItems.filter(s => s.subject_id === subj.id).length;

          const IconComponent = SUBJECT_ICONS[subj.name] || DEFAULT_ICON;
          const color = SUBJECT_COLORS[subj.name] || DEFAULT_COLOR;

          return {
            id: String(subj.id),
            name: subj.name,
            icon: IconComponent,
            color,
            questionsTotal: sQuestionsTotal,
            questionsDone: sQuestionsDone,
            questionsPercent: sQuestionsTotal > 0 ? Math.round((sQuestionsDone / sQuestionsTotal) * 100) : 0,
            flashcardsTotal: sFlashcardsTotal,
            flashcardsDone: sFlashcardsDone,
            flashcardsPercent: sFlashcardsTotal > 0 ? Math.round((sFlashcardsDone / sFlashcardsTotal) * 100) : 0,
            summariesTotal: sSummariesTotal,
            summariesDone: sSummariesDone,
            summariesPercent: sSummariesTotal > 0 ? Math.round((sSummariesDone / sSummariesTotal) * 100) : 0,
          };
        });

        // 8. Calcular Percentuais Gerais
        const questionsPercent = questionsTotal > 0 ? Math.round((questionsDone / questionsTotal) * 100) : 0;
        const flashcardsPercent = flashcardsTotal > 0 ? Math.round((flashcardsDone / flashcardsTotal) * 100) : 0;
        const summariesPercent = summariesTotal > 0 ? Math.round((summariesDone / summariesTotal) * 100) : 0;
        
        const categories = [];
        if (questionsTotal > 0) categories.push(questionsPercent);
        if (flashcardsTotal > 0) categories.push(flashcardsPercent);
        if (summariesTotal > 0) categories.push(summariesPercent);
        
        const overallPercent = categories.length > 0 
          ? Math.round(categories.reduce((a, b) => a + b, 0) / categories.length)
          : 0;

        return {
          examDate,
          examDateFormatted,
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

// Hook para salvar/atualizar data da prova do usuário
export function useUpdateExamDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, examDate }: { userId: string; examDate: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ exam_date: examDate })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studentEvolution'] });
      qc.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}

function getEmptyEvolution(): StudentEvolution {
  return {
    examDate: null,
    examDateFormatted: null,
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
