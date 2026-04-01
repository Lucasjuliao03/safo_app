// missionService.ts — Sistema de Missão Diária Inteligente

import { Question } from '@/types/study';

// ═══════════════════════════════════════════════════════ //
//  TIPOS                                                       //
// ═══════════════════════════════════════════════════════ //

export interface MissionQuestion {
  id: number;
  subjectId: string;
  subjectName: string;
  topic: string;
  difficulty: string;
  reason: string; // por que foi selecionada
}

export interface MissionFlashcard {
  id: number;
  subjectId: string;
  subjectName: string;
  front: string;
  back: string;
  reason: string;
}

export interface MissionSummary {
  id: number;
  subjectId: string;
  subjectName: string;
  title: string;
  reason: string;
}

export interface MissionItem {
  type: 'questions' | 'flashcards' | 'summary';
  count: number;
  items: MissionQuestion[] | MissionFlashcard[] | MissionSummary[];
  description: string;
}

export interface DailyMission {
  id: string;
  date: string; // YYYY-MM-DD
  generatedAt: string;
  userId: string;
  status: 'pending' | 'in_progress' | 'completed';
  startedAt?: string;
  completedAt?: string;
  questionsCount: number;
  flashcardsCount: number;
  summaryCount: number;
  questions: MissionQuestion[];
  flashcards: MissionFlashcard[];
  summaries: MissionSummary[];
  estimatedMinutes: number;
}

// ═══════════════════════════════════════════════════════ //
//  CONFIGURAÇÕES                                               //
// ═══════════════════════════════════════════════════════ //

const MISSION_CONFIG = {
  questions: { min: 8, max: 15, default: 10 },
  flashcards: { min: 3, max: 8, default: 5 },
  summaries: { min: 1, max: 2, default: 1 },
  timePerQuestion: 90, // segundos
  timePerFlashcard: 30, // segundos
  timePerSummary: 5, // minutos
};

// ═══════════════════════════════════════════════════════ //
//  UTILITÁRIAS                                                //
// ═══════════════════════════════════════════════════════ //

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function calculateEstimatedTime(questions: number, flashcards: number, summaries: number): number {
  const seconds = questions * MISSION_CONFIG.timePerQuestion;
  const flashcardSeconds = flashcards * MISSION_CONFIG.timePerFlashcard;
  const summaryMinutes = summaries * MISSION_CONFIG.timePerSummary;
  return Math.ceil((seconds + flashcardSeconds) / 60 + summaryMinutes);
}

// ═══════════════════════════════════════════════════════ //
//  SELEÇÃO DE QUESTÕES                                        //
// ═══════════════════════════════════════════════════════ //

export function selectMissionQuestions(
  allQuestions: Question[],
  questionStats: any[],
  subjects: { id: string; name: string }[],
  targetCount: number
): MissionQuestion[] {
  if (allQuestions.length === 0) return [];

  const subjectMap = new Map(subjects.map(s => [s.id, s.name]));
  
  // Criar mapa de stats por questão
  const statsMap = new Map(
    questionStats.map(s => [String(s.question_id), s])
  );

  // Classificar questões por prioridade
  const scoredQuestions: { question: Question; score: number; reason: string }[] = [];

  allQuestions.forEach(q => {
    const stats = statsMap.get(q.id);
    const attempts = stats?.total_attempts || 0;
    const correctRate = attempts > 0 ? (stats?.total_correct || 0) / attempts : 0;
    const lastCorrect = stats?.last_is_correct;
    const subjectName = subjectMap.get(q.subjectId) || 'Matéria';

    let score = 0;
    let reason = '';

    // Prioridade 1: Questões nunca feitas (peso muito alto)
    if (attempts === 0) {
      score += 1000;
      reason = 'Questão nova';
    }
    // Prioridade 2: Erradas recentemente
    else if (lastCorrect === false || lastCorrect === 0) {
      score += 500;
      reason = 'Erro recente';
    }
    // Prioridade 3: Matéria com baixo desempenho
    else if (correctRate < 0.5) {
      score += 300;
      reason = `Baixo desempenho (${Math.round(correctRate * 100)}%)`;
    }
    // Prioridade 4: Menos revisadas recentemente
    else if (attempts < 3) {
      score += 150;
      reason = 'Poucas tentativas';
    }
    // fallback
    else {
      score += 50;
      reason = 'Revisão';
    }

    // Ajuste por dificuldade
    if (q.difficulty === 'fácil') score += 10;
    else if (q.difficulty === 'difícil') score -= 20;

    scoredQuestions.push({ question: q, score, reason });
  });

  // Ordenar por score (maior primeiro) e selecionar
  scoredQuestions.sort((a, b) => b.score - a.score);
  const selected = scoredQuestions.slice(0, targetCount);

  return selected.map(({ question, reason }) => ({
    id: parseInt(question.id),
    subjectId: question.subjectId,
    subjectName: subjectMap.get(question.subjectId) || 'Matéria',
    topic: question.topic || 'Geral',
    difficulty: question.difficulty || 'média',
    reason,
  }));
}

// ═══════════════════════════════════════════════════════ //
//  SELEÇÃO DE FLASHCARDS                                     //
// ═══════════════════════════════════════════════════════ //

export function selectMissionFlashcards(
  allFlashcards: any[],
  flashcardStats: any[],
  subjects: { id: string; name: string }[],
  targetCount: number
): MissionFlashcard[] {
  if (allFlashcards.length === 0) return [];

  const subjectMap = new Map(subjects.map(s => [s.id, s.name]));
  
  const scoredFlashcards: { flashcard: any; score: number; reason: string }[] = [];

  allFlashcards.forEach(fc => {
    const stats = flashcardStats.find(s => String(s.flashcard_id) === String(fc.id));
    const attempts = stats?.total_attempts || 0;
    const correctRate = attempts > 0 ? (stats?.total_correct || 0) / attempts : 0;
    const lastCorrect = stats?.last_is_correct;
    const lastReviewed = stats?.last_reviewed_at;
    const subjectName = subjectMap.get(fc.subjectId) || 'Matéria';

    let score = 0;
    let reason = '';

    // Prioridade 1: Errados recentemente
    if (attempts > 0 && lastCorrect === false) {
      score += 500;
      reason = 'Erro recente';
    }
    // Prioridade 2: Pendentes de revisão (nunca revisados)
    else if (attempts === 0) {
      score += 400;
      reason = 'Nunca revisado';
    }
    // Prioridade 3: Muito tempo sem revisar
    else if (lastReviewed) {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastReviewed).getTime()) / (1000 * 60 * 60 * 24)
      );
      score += Math.min(daysSince * 20, 300);
      reason = `${daysSince} dias sem revisar`;
    }
    // Prioridade 4: Baixo desempenho
    else if (correctRate < 0.6) {
      score += 200;
      reason = `Baixo acerto (${Math.round(correctRate * 100)}%)`;
    }
    else {
      score += 50;
      reason = 'Revisão de memória';
    }

    scoredFlashcards.push({ flashcard: fc, score, reason });
  });

  scoredFlashcards.sort((a, b) => b.score - a.score);
  const selected = scoredFlashcards.slice(0, targetCount);

  return selected.map(({ flashcard, reason }) => ({
    id: parseInt(flashcard.id),
    subjectId: flashcard.subjectId,
    subjectName: subjectMap.get(flashcard.subjectId) || 'Matéria',
    front: flashcard.front,
    back: flashcard.back,
    reason,
  }));
}

// ═══════════════════════════════════════════════════════ //
//  SELEÇÃO DE RESUMOS                                        //
// ═══════════════════════════════════════════════════════ //

export function selectMissionSummaries(
  allSummaries: any[],
  subjectStats: any[],
  subjects: { id: string; name: string }[],
  targetCount: number
): MissionSummary[] {
  if (allSummaries.length === 0) return [];

  const subjectMap = new Map(subjects.map(s => [s.id, s.name]));
  
  // Calcular desempenho por matéria
  const subjectPerformance = new Map<string, number>();
  subjectStats.forEach((stat: any) => {
    const current = subjectPerformance.get(stat.subject_id) || 0;
    const rate = stat.total_attempts > 0 
      ? (stat.total_correct || 0) / stat.total_attempts 
      : 0.5;
    subjectPerformance.set(stat.subject_id, rate);
  });

  const scoredSummaries: { summary: any; score: number; reason: string }[] = [];

  allSummaries.forEach(summary => {
    const perf = subjectPerformance.get(summary.subjectId) || 0.5;
    let score = 0;
    let reason = '';

    // Prioridade 1: Resumo de matéria com pior desempenho
    if (perf < 0.4) {
      score += 400;
      reason = 'Matéria com baixo desempenho';
    }
    // Prioridade 2: Resumo de matéria com desempenho moderado
    else if (perf < 0.6) {
      score += 250;
      reason = 'Matéria precisa de reforço';
    }
    // Prioridade 3: Resumo nunca acessado
    else if (!summary.lastReadAt) {
      score += 150;
      reason = 'Não foi lido ainda';
    }
    else {
      score += 50;
      reason = 'Revisão do conteúdo';
    }

    scoredSummaries.push({ summary, score, reason });
  });

  scoredSummaries.sort((a, b) => b.score - a.score);
  const selected = scoredSummaries.slice(0, targetCount);

  return selected.map(({ summary, reason }) => ({
    id: parseInt(summary.id),
    subjectId: summary.subjectId,
    subjectName: subjectMap.get(summary.subjectId) || 'Matéria',
    title: summary.title || summary.name || 'Resumo',
    reason,
  }));
}

// ═══════════════════════════════════════════════════════ //
//  GERAÇÃO DE MISSÃO                                         //
// ═══════════════════════════════════════════════════════ //

export function generateDailyMission(params: {
  userId: string;
  questions: Question[];
  questionStats: any[];
  flashcards: any[];
  flashcardStats: any[];
  summaries: any[];
  subjectStats: any[];
  subjects: { id: string; name: string }[];
}): DailyMission {
  const { userId, questions, questionStats, flashcards, flashcardStats, summaries, subjects } = params;

  const today = getTodayDate();
  const missionId = `${userId}_${today}`;

  // Selecionar questões
  const questionsCount = MISSION_CONFIG.questions.default;
  const selectedQuestions = selectMissionQuestions(questions, questionStats, subjects, questionsCount);

  // Selecionar flashcards
  const flashcardsCount = MISSION_CONFIG.flashcards.default;
  const selectedFlashcards = selectMissionFlashcards(flashcards, flashcardStats, subjects, flashcardsCount);

  // Selecionar resumos
  const summaryCount = MISSION_CONFIG.summaries.default;
  const selectedSummaries = selectMissionSummaries(summaries, questionStats, subjects, summaryCount);

  // Calcular tempo estimado
  const estimatedMinutes = calculateEstimatedTime(questionsCount, flashcardsCount, summaryCount);

  // Gerar descrição das missões
  const questionDescription = selectedQuestions.length > 0
    ? `${selectedQuestions.length} questões de ${selectedQuestions[0].subjectName}${selectedQuestions.length > 1 ? ' e outras' : ''}`
    : 'Nenhuma questão disponível';

  const flashcardDescription = selectedFlashcards.length > 0
    ? `${selectedFlashcards.length} flashcards para revisar`
    : 'Nenhum flashcard pendente';

  const summaryDescription = selectedSummaries.length > 0
    ? `${selectedSummaries.length} resumo${selectedSummaries.length > 1 ? 's' : ''} para estudar`
    : 'Nenhum resumo pendente';

  return {
    id: missionId,
    date: today,
    generatedAt: new Date().toISOString(),
    userId,
    status: 'pending',
    questionsCount,
    flashcardsCount,
    summaryCount,
    questions: selectedQuestions,
    flashcards: selectedFlashcards,
    summaries: selectedSummaries,
    estimatedMinutes,
  };
}

// ═══════════════════════════════════════════════════════ //
//  PERSISTÊNCIA LOCAL                                        //
// ═══════════════════════════════════════════════════════ //

const MISSION_STORAGE_KEY = 'safo_daily_mission';

export function saveMissionLocally(mission: DailyMission): void {
  try {
    localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(mission));
  } catch (error) {
    console.error('[MissionService] Erro ao salvar missão local:', error);
  }
}

export function loadMissionLocally(): DailyMission | null {
  try {
    const stored = localStorage.getItem(MISSION_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as DailyMission;
  } catch (error) {
    console.error('[MissionService] Erro ao carregar missão local:', error);
    return null;
  }
}

export function updateMissionStatus(status: 'pending' | 'in_progress' | 'completed'): void {
  const mission = loadMissionLocally();
  if (!mission) return;

  mission.status = status;
  if (status === 'in_progress' && !mission.startedAt) {
    mission.startedAt = new Date().toISOString();
  }
  if (status === 'completed') {
    mission.completedAt = new Date().toISOString();
  }

  saveMissionLocally(mission);
}

export function isMissionExpired(mission: DailyMission | null): boolean {
  if (!mission) return true;
  return mission.date !== getTodayDate();
}

// ═══════════════════════════════════════════════════════ //
//  ESTADO DA MISSÃO                                          //
// ═══════════════════════════════════════════════════════ //

export function getMissionStatus(mission: DailyMission | null): 'expired' | 'completed' | 'in_progress' | 'pending' {
  if (!mission) return 'expired';
  if (isMissionExpired(mission)) return 'expired';
  if (mission.status === 'completed') return 'completed';
  if (mission.status === 'in_progress') return 'in_progress';
  return 'pending';
}

export function formatMissionStatus(status: string): string {
  switch (status) {
    case 'completed': return 'Missão cumprida';
    case 'in_progress': return 'Missão em andamento';
    case 'pending': return 'Missão pendente';
    default: return 'Sem missão';
  }
}
