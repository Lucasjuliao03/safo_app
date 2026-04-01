// useUserStreakStats.ts - Hook para gerenciar estatísticas de sequência do usuário

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface StreakStats {
  currentStreak: number;
  totalDays: number;
  lastActivityDate: string | null;
  hasActivityToday: boolean;
}

export function useUserStreakStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['userStreakStats', userId],
    queryFn: async (): Promise<StreakStats> => {
      if (!userId) {
        return { currentStreak: 0, totalDays: 0, lastActivityDate: null, hasActivityToday: false };
      }

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Buscar todos os dias com atividade (questões, flashcards, resumos)
      const { data: productivityDays } = await supabase
        .from('user_daily_productivity')
        .select('productivity_date')
        .eq('user_id', userId)
        .order('productivity_date', { ascending: false });

      // Buscar todos os dias com resumos visualizados
      const { data: summaryDays } = await supabase
        .from('user_summary_views')
        .select('viewed_date')
        .eq('user_id', userId)
        .order('viewed_date', { ascending: false });

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

      // Calcular sequência atual (dias consecutivos)
      let currentStreak = 0;
      let checkDate = hasActivityToday ? todayStr : yesterdayStr;
      
      // Se não tem atividade hoje nem ontem, sequência é 0
      if (!hasActivityToday && !activityDates.has(yesterdayStr)) {
        currentStreak = 0;
      } else {
        // Contar dias consecutivos a partir de hoje (se tem atividade) ou ontem
        let currentDate = new Date(checkDate);
        
        // Se estamos começando por ontem, não conta hoje ainda
        if (!hasActivityToday) {
          currentStreak = 0;
        } else {
          currentStreak = 1; // Hoje conta
        }
        
        // Verificar dias anteriores
        currentDate.setDate(currentDate.getDate() - 1);
        
        while (activityDates.has(currentDate.toISOString().split('T')[0])) {
          currentStreak++;
          currentDate.setDate(currentDate.getDate() - 1);
        }
      }

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
  return async (userId: string, summaryId: string) => {
    const today = new Date().toISOString().split('T')[0];
    
    // Inserir registro de visualização
    await supabase.from('user_summary_views').insert({
      user_id: userId,
      summary_id: summaryId,
      viewed_date: today,
    });
  };
}
