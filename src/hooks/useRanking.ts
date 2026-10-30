// useRanking.ts - Hook para gerenciar ranking

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getAvatarUrl } from './useAvatar';
import { getStudyDate, getRankingStartDate } from '@/lib/studyDate';

// Função para obter URL do avatar
function getAvatarUrlFromName(avatar: string): string {
  return getAvatarUrl(avatar);
}

export interface RankingUser {
  position: number;
  positionChange: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  courseId?: number;
  courseName?: string;
  questionsTotal: number;
  questionsCorrect: number;
  questionsWrong: number;
  flashcardsTotal: number;
  summariesRead: number;
  qualityScore: number;
  consistencyScore: number;
  volumeScore: number;
  finalScore: number;
  accuracy: number;
  isCurrentUser?: boolean;
  isDemo?: boolean;
}

export interface WeeklyChallenge {
  id: string;
  title: string;
  description?: string;
  courseId?: number;
  weekNumber: number;
  year: number;
  targetQuestions: number;
  targetFlashcards: number;
  targetSummaries: number;
  minAccuracy: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  questionsDone: number;
  questionsCorrect: number;
  flashcardsDone: number;
  summariesDone: number;
  weeklyScore: number;
  accuracy: number;
  rankPosition: number;
  badges: string[];
  isCompleted: boolean;
  isCurrentUser?: boolean;
}

type RankingPeriod = 'all' | 'weekly' | 'monthly';
type RankingType = 'general' | 'course';

export function useRanking(
  userId?: string,
  courseId?: string | null,
  period: RankingPeriod = 'weekly',
  type: RankingType = 'general'
) {
  const today = getStudyDate();
  const startDate = getRankingStartDate(period);
  return useQuery({
    queryKey: ['ranking', userId, type, courseId, period, today],
    queryFn: async (): Promise<RankingUser[]> => {
      let { data: users, error: profilesError } = await supabase.from('public_profiles')
        .select('id, full_name, nickname, avatar, avatar_url, course_id');
      if (profilesError?.code === 'PGRST205') {
        const fallback = await supabase.from('profiles').select('id, full_name, nickname, avatar, avatar_url, course_id');
        users = fallback.data;
        profilesError = fallback.error;
      }
      if (profilesError) throw profilesError;
      const participants = (users || []).filter(profile => !courseId || profile.course_id === Number(courseId));
      if (!participants.length) return [];
      const participantIds = new Set(participants.map(profile => profile.id));
      const productivity: any[] = [];
      for (let page = 0; ; page++) {
        let query = supabase.from('user_daily_productivity')
          .select('id, user_id, productivity_date, questions_answered, questions_correct, questions_wrong, flashcards_reviewed, summaries_read')
          .lte('productivity_date', today).order('id').range(page * 1000, (page + 1) * 1000 - 1);
        if (startDate) query = query.gte('productivity_date', startDate);
        const { data, error } = await query;
        if (error) throw error;
        productivity.push(...(data || []).filter(row => participantIds.has(row.user_id)));
        if (!data || data.length < 1000) break;
      }
      const byUser = new Map<string, typeof productivity>();
      for (const row of productivity) {
        const rows = byUser.get(row.user_id) || [];
        rows.push(row);
        byUser.set(row.user_id, rows);
      }
      return participants.map((profile): RankingUser => {
        const rows = byUser.get(profile.id) || [];
        const sum = (key: string) => rows.reduce((total, row) => total + (row[key] || 0), 0);
        const questionsTotal = sum('questions_answered');
        const questionsCorrect = sum('questions_correct');
        const questionsWrong = sum('questions_wrong');
        const flashcardsTotal = sum('flashcards_reviewed');
        const summariesRead = sum('summaries_read');
        const activeDays = new Set(rows.filter(row => row.questions_answered + row.flashcards_reviewed + row.summaries_read > 0)
          .map(row => row.productivity_date)).size;
        const qualityScore = Math.max(0, questionsCorrect * 10 + flashcardsTotal * 8 + summariesRead * 3 - questionsWrong * 5);
        const consistencyScore = activeDays * 3;
        const volumeScore = (questionsTotal + flashcardsTotal + summariesRead) * 2;
        return { position: 0, positionChange: 0, userId: profile.id,
          userName: profile.nickname || profile.full_name || 'Usuário',
          userAvatar: profile.avatar ? getAvatarUrlFromName(profile.avatar) : profile.avatar_url || undefined,
          questionsTotal, questionsCorrect, questionsWrong, flashcardsTotal, summariesRead,
          qualityScore, consistencyScore, volumeScore, finalScore: qualityScore + consistencyScore + volumeScore,
          accuracy: questionsTotal > 0 ? Math.round(questionsCorrect / questionsTotal * 100) : 0,
          isCurrentUser: profile.id === userId };
      }).sort((a, b) => b.finalScore - a.finalScore || a.userId.localeCompare(b.userId))
        .map((entry, index) => ({ ...entry, position: index + 1 }));
    },
    staleTime: 1000 * 10,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    enabled: !!userId,
  });
}

export function useWeeklyChallenge(userId?: string, courseId?: string | null) {
  const currentYear = new Date().getFullYear();
  const currentWeek = getWeekNumber(new Date());

  return useQuery({
    queryKey: ['weeklyChallenge', courseId, currentWeek, currentYear],
    queryFn: async (): Promise<WeeklyChallenge | null> => {
      let query = supabase
        .from('weekly_challenges')
        .select('*')
        .eq('week_number', currentWeek)
        .eq('year', currentYear)
        .eq('is_active', true)
        .maybeSingle();

      if (courseId) {
        query = supabase
          .from('weekly_challenges')
          .select('*')
          .eq('course_id', parseInt(courseId))
          .eq('week_number', currentWeek)
          .eq('year', currentYear)
          .eq('is_active', true)
          .maybeSingle();
      }

      const { data, error } = await query;

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return {
        id: data.id,
        title: data.title,
        description: data.description,
        courseId: data.course_id,
        weekNumber: data.week_number,
        year: data.year,
        targetQuestions: data.target_questions,
        targetFlashcards: data.target_flashcards,
        targetSummaries: data.target_summaries,
        minAccuracy: data.min_accuracy,
        isActive: data.is_active,
        startDate: data.start_date,
        endDate: data.end_date,
      };
    },
    enabled: !!userId,
  });
}

export function useChallengeParticipants(challengeId?: string, userId?: string) {
  return useQuery({
    queryKey: ['challengeParticipants', challengeId],
    queryFn: async (): Promise<ChallengeParticipant[]> => {
      if (!challengeId) return [];

      const { data, error } = await supabase
        .from('challenge_participants')
        .select('*')
        .eq('challenge_id', challengeId)
        .order('weekly_score', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map(p => ({
        id: p.id,
        challengeId: p.challenge_id,
        userId: p.user_id,
        questionsDone: p.questions_done,
        questionsCorrect: p.questions_correct,
        flashcardsDone: p.flashcards_done,
        summariesDone: p.summaries_done,
        weeklyScore: p.weekly_score,
        accuracy: p.accuracy,
        rankPosition: p.rank_position || 0,
        badges: p.badges || [],
        isCompleted: p.is_completed,
        isCurrentUser: p.user_id === userId,
      }));
    },
    enabled: !!challengeId,
  });
}

export function useUpdateRanking() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      courseId?: number;
      period: string;
      questionsAnswered?: number;
      questionsCorrect?: number;
      questionsWrong?: number;
      flashcardsReviewed?: number;
      summariesRead?: number;
    }) => {
      const currentYear = new Date().getFullYear();
      const currentWeek = getWeekNumber(new Date());
      const today = new Date().toISOString().split('T')[0];

      // Buscar dados existentes
      const { data: existing } = await supabase
        .from('ranking_global')
        .select('*')
        .eq('user_id', params.userId)
        .eq('period', params.period)
        .eq('week_number', currentWeek)
        .eq('year', currentYear)
        .maybeSingle();

      // Calcular scores
      const qualityScore = ((params.questionsCorrect || 0) * 10) + 
                          ((params.flashcardsReviewed || 0) * 8) + 
                          ((params.summariesRead || 0) * 3) - 
                          ((params.questionsWrong || 0) * 5);

      const dataToSave = {
        user_id: params.userId,
        course_id: params.courseId,
        period: params.period,
        week_number: currentWeek,
        month: new Date().getMonth() + 1,
        year: currentYear,
        
        questions_total: (existing?.questions_total || 0) + (params.questionsAnswered || 0),
        questions_correct: (existing?.questions_correct || 0) + (params.questionsCorrect || 0),
        questions_wrong: (existing?.questions_wrong || 0) + (params.questionsWrong || 0),
        flashcards_total: (existing?.flashcards_total || 0) + (params.flashcardsReviewed || 0),
        summaries_read: (existing?.summaries_read || 0) + (params.summariesRead || 0),
        
        quality_score: qualityScore,
        raw_score: (existing?.raw_score || 0) + (params.questionsAnswered || 0) + (params.flashcardsReviewed || 0) + (params.summariesRead || 0),
        
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from('ranking_global')
          .update(dataToSave)
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ranking_global')
          .insert(dataToSave);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ranking'] });
    },
  });
}

export function useJoinChallenge() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { challengeId: string; userId: string }) => {
      const { error } = await supabase
        .from('challenge_participants')
        .insert({
          challenge_id: params.challengeId,
          user_id: params.userId,
          questions_done: 0,
          questions_correct: 0,
          flashcards_done: 0,
          summaries_done: 0,
          weekly_score: 0,
          accuracy: 0,
        });

      if (error && error.code !== 'PGRST116') throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challengeParticipants'] });
    },
  });
}

// Função auxiliar para obter número da semana
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function calculateFinalScore(
  questionsCorrect: number,
  questionsWrong: number,
  flashcardsReviewed: number,
  summariesRead: number,
  daysStudied: number,
  totalActivities: number
): number {
  // Quality Score: acertos×10 + flashcards×8 + resumos×3 - erros×5
  const qualityScore = Math.max(0, 
    (questionsCorrect * 10) + 
    (flashcardsReviewed * 8) + 
    (summariesRead * 3) - 
    (questionsWrong * 5)
  );

  // Consistency Score: dias únicos × 3
  const consistencyScore = daysStudied * 3;

  // Volume Score: total atividades × 2
  const volumeScore = totalActivities * 2;

  // Final Score: soma direta
  return qualityScore + consistencyScore + volumeScore;
}

export function getAccuracyBadge(accuracy: number): string {
  if (accuracy >= 90) return '🏆';
  if (accuracy >= 80) return '🥇';
  if (accuracy >= 70) return '🥈';
  if (accuracy >= 60) return '🥉';
  return '📚';
}

export function getPositionEmoji(position: number): string {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return `${position}`;
}
