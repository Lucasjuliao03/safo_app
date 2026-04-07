// useRanking.ts - Hook para gerenciar ranking

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getAvatarUrl, AVAILABLE_AVATARS } from './useAvatar';

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
  const currentYear = new Date().getFullYear();
  const currentWeek = getWeekNumber(new Date());
  const currentMonth = new Date().getMonth() + 1;

  return useQuery({
    queryKey: ['ranking', type, courseId, period, period === 'monthly' ? currentMonth : currentWeek, currentYear],
    queryFn: async (): Promise<RankingUser[]> => {
      // Primeiro tenta buscar do ranking_global
      let query = supabase
        .from('ranking_global')
        .select('*')
        .eq('period', period)
        .eq('week_number', currentWeek)
        .eq('year', currentYear)
        .order('final_score', { ascending: false })
        .limit(100);

      if (type === 'course' && courseId) {
        query = query.eq('course_id', parseInt(courseId));
      }

      const { data: rankingData, error } = await query;

      // Se não tem dados no ranking_global, calcular dinamicamente
      if (!rankingData || rankingData.length === 0) {
        console.log('[useRanking] No ranking data, calculating dynamically...');
        
        // Buscar usuários
        const { data: users, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, nickname, avatar, avatar_url, course_id');
        
        console.log('[useRanking] total users:', users?.length, 'error:', usersError);
        
        if (!users || users.length === 0) return [];

        // Filtrar por curso se aplicável
        let usersToProcess = users;
        if (type === 'course' && courseId) {
          const targetCourseId = parseInt(courseId);
          usersToProcess = users.filter(u => u.course_id === targetCourseId);
          console.log('[useRanking] users in course:', usersToProcess.length, 'courseId:', targetCourseId);
        } else if (type === 'general' && courseId) {
          // Se não especificou 'course', ainda filtrar pelo curso do usuário
          const targetCourseId = parseInt(courseId);
          usersToProcess = users.filter(u => u.course_id === targetCourseId);
        }

        // Para cada usuário, calcular score baseado no período
        let startDate: Date | null = null;
        
        if (period === 'weekly') {
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
        } else if (period === 'monthly') {
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 1);
        }
        // period === 'all' -> sem filtro de data
        
        const startDateStr = startDate ? startDate.toISOString().split('T')[0] : null;
        console.log('[useRanking] period:', period, 'startDate:', startDateStr);
        
        // Primeiro verificar todos os dados sem filtro
        const { data: allProdCheck } = await supabase
          .from('user_daily_productivity')
          .select('user_id, productivity_date, questions_answered');
        
        console.log('[useRanking] all prod check:', allProdCheck?.map(p => ({ 
          user: p.user_id?.slice(0, 8), 
          date: p.productivity_date, 
          q: p.questions_answered 
        })));
        
        // Buscar com paginação - SEM filtro de data para pegar tudo
        let allProdData: any[] = [];
        let page = 0;
        const pageSize = 1000;
        
        while (true) {
          const { data: prodPage } = await supabase
            .from('user_daily_productivity')
            .select('*')
            .order('productivity_date', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (!prodPage || prodPage.length === 0) break;
          allProdData = [...allProdData, ...prodPage];
          page++;
          if (prodPage.length < pageSize) break;
        }
        
        console.log('[useRanking] prodData count (all):', allProdData.length);

        const ranking: RankingUser[] = [];
        
        // Debug: mostrar dados por usuário
        for (const user of usersToProcess) {
          // Filtrar dados por período
          let userProd = allProdData.filter(p => p.user_id === user.id);
          
          if (startDateStr) {
            userProd = userProd.filter(p => p.productivity_date >= startDateStr);
          }
          
          console.log('[useRanking] user:', user.full_name?.slice(0,10), 'prod records:', userProd.length, 'dates:', userProd.map(p => p.productivity_date));
          
          // NÃO pular se não tem atividade - mostrar com 0 pontos
          
          // NÃO pular se não tem atividade - mostrar com 0 pontos
          const questionsTotal = userProd.reduce((sum, p) => sum + (p.questions_answered || 0), 0);
          const questionsCorrect = userProd.reduce((sum, p) => sum + (p.questions_correct || 0), 0);
          const questionsWrong = userProd.reduce((sum, p) => sum + (p.questions_wrong || 0), 0);
          const flashcardsTotal = userProd.reduce((sum, p) => sum + (p.flashcards_reviewed || 0), 0);
          const summariesRead = userProd.reduce((sum, p) => sum + (p.summaries_read || 0), 0);
          
          // Fórmula fixa independente do período - apenas valoriza atividades feitas
          const qualityScore = Math.max(0, 
            questionsCorrect * 10 + 
            flashcardsTotal * 8 + 
            summariesRead * 3 - 
            questionsWrong * 5
          );
          
          // Consistência = dias únicos estudados × 3 pontos fixos
          const daysStudied = userProd.length > 0 ? new Set(userProd.map(p => p.productivity_date)).size : 0;
          const consistencyScore = daysStudied * 3;
          
          // Volume = total de atividades × 2 pontos fixos
          const totalActivities = questionsTotal + flashcardsTotal + summariesRead;
          const volumeScore = totalActivities * 2;
          
          // Score final = soma direta (sem percentuais baseados em tempo)
          const finalScore = qualityScore + consistencyScore + volumeScore;
          
          // Usar nickname ou primeiro nome ou "Usuário" como fallback
          const userName = (user.nickname && user.nickname.length > 0) 
            ? user.nickname 
            : (user.full_name && user.full_name.length > 0) 
              ? user.full_name 
              : 'Usuário';
          
          console.log(`[Ranking] ${userName} - period: ${period} | q: ${questionsTotal}, correct: ${questionsCorrect}, days: ${daysStudied}, totalActivities: ${totalActivities} | quality: ${qualityScore}, consistency: ${Math.round(consistencyScore)}, volume: ${Math.round(volumeScore)} | final: ${Math.round(finalScore)}`);
          
          ranking.push({
            position: 0,
            positionChange: 0,
            userId: user.id,
            userName: userName,
            userAvatar: user.avatar 
              ? getAvatarUrlFromName(user.avatar)
              : (user.avatar_url || undefined),
            questionsTotal,
            questionsCorrect,
            questionsWrong,
            flashcardsTotal,
            summariesRead,
            qualityScore,
            consistencyScore,
            volumeScore,
            finalScore: Math.round(finalScore),
            accuracy: questionsTotal > 0 ? Math.round((questionsCorrect / questionsTotal) * 100) : 0,
            isCurrentUser: user.id === userId,
          });
        }
        
        // Ordenar por score
        ranking.sort((a, b) => b.finalScore - a.finalScore);
        
        // Atribuir posições
        ranking.forEach((r, i) => r.position = i + 1);
        
        console.log('[useRanking] final ranking:', ranking.length, 'users');
        console.log('[useRanking] top users:', ranking.slice(0, 3).map(r => ({ name: r.userName, score: r.finalScore })));
        
        return ranking;
      }

      // Se tem dados, usar o ranking_global
      const ranking: RankingUser[] = (rankingData || []).map((r, index) => ({
        position: index + 1,
        positionChange: r.position_change || 0,
        userId: r.user_id,
        userName: '', // Precisa buscar do profile
        questionsTotal: r.questions_total || 0,
        questionsCorrect: r.questions_correct || 0,
        questionsWrong: r.questions_wrong || 0,
        flashcardsTotal: r.flashcards_total || 0,
        summariesRead: r.summaries_read || 0,
        qualityScore: r.quality_score || 0,
        consistencyScore: r.consistency_score || 0,
        volumeScore: r.raw_score || 0,
        finalScore: r.final_score || 0,
        accuracy: r.questions_total > 0 
          ? Math.round((r.questions_correct / r.questions_total) * 100) 
          : 0,
        isCurrentUser: r.user_id === userId,
      }));

      // Buscar nomes dos usuários
      if (ranking.length > 0) {
        const userIds = ranking.map(r => r.userId);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, nickname, avatar, avatar_url')
          .in('id', userIds);

        if (profiles) {
          ranking.forEach(r => {
            const profile = profiles.find(p => p.id === r.userId);
            if (profile) {
              r.userName = profile.nickname || profile.full_name || 'Usuário';
              r.userAvatar = profile.avatar 
                ? getAvatarUrlFromName(profile.avatar)
                : (profile.avatar_url || undefined);
            }
          });
        }
      }

      return ranking;
    },
    staleTime: 1000 * 10,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // Atualiza a cada 30 segundos
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
        .single();

      if (courseId) {
        query = supabase
          .from('weekly_challenges')
          .select('*')
          .eq('course_id', parseInt(courseId))
          .eq('week_number', currentWeek)
          .eq('year', currentYear)
          .eq('is_active', true)
          .single();
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