// useUserStreakStats.ts - Hook para gerenciar estatísticas de sequência do usuário

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStudyDate, countStudyStreak } from '@/lib/studyDate';
import { recordSummaryRead } from '@/services/studyAccessService';
import { invalidateStudyProgress } from '@/lib/studyProgress';
import { supabase } from '@/lib/supabase';

export interface StreakStats {
  currentStreak: number;
  totalDays: number;
  lastActivityDate: string | null;
  hasActivityToday: boolean;
}

export function useUserStreakStats(userId: string | undefined) {
  const todayStr = getStudyDate();
  return useQuery({
    queryKey: ['userStreakStats', userId, todayStr],
    queryFn: async (): Promise<StreakStats> => {
      if (!userId) {
        return { currentStreak: 0, totalDays: 0, lastActivityDate: null, hasActivityToday: false };
      }

      // Buscar todos os dias com atividade (questões, flashcards, resumos)
      const { data: productivityDays, error: productivityError } = await supabase
        .from('user_daily_productivity')
        .select('productivity_date')
        .eq('user_id', userId)
        .order('productivity_date', { ascending: false });

      // Buscar todos os dias com resumos visualizados
      const { data: summaryDays, error: summariesError } = await supabase
        .from('user_summary_views')
        .select('viewed_date')
        .eq('user_id', userId)
        .order('viewed_date', { ascending: false });

      if (productivityError) throw productivityError;
      if (summariesError) throw summariesError;

      // Criar conjunto de datas com qualquer atividade
      const activityDates = new Set<string>();
      
      if (productivityDays) {
        productivityDays.forEach((p: any) => {
          if (p.productivity_date) {
            activityDates.add(p.productivity_date.split('T')[0]);
          }
        });
      }
      
      if (summaryDays) {
        summaryDays.forEach((s: any) => {
          if (s.viewed_date) {
            activityDates.add(s.viewed_date.split('T')[0]);
          }
        });
      }

      // Ordenar datas (mais recente primeiro)
      const sortedDates = Array.from(activityDates).sort((a, b) => b.localeCompare(a));
      const totalDays = sortedDates.length;
      const hasActivityToday = activityDates.has(todayStr);
      const lastActivityDate = sortedDates[0] || null;

      const currentStreak = countStudyStreak(activityDates, todayStr);

      return {
        currentStreak,
        totalDays,
        lastActivityDate,
        hasActivityToday,
      };
    },
    enabled: !!userId,
    staleTime: 1000 * 60, // 1 minuto
    refetchOnWindowFocus: true,
  });
}

// Hook simples para marcar visualização de resumo
export function useRecordSummaryView() {
  const client = useQueryClient();
  return async (_userId: string, summaryId: string, requestId = crypto.randomUUID()) => {
    const feedback = await recordSummaryRead(Number(summaryId), requestId);
    invalidateStudyProgress(client);
    return feedback;
  };
}
