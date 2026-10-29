// useMission.ts — Hook para gerenciar missão diária com progresso

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchSecureContent } from '@/services/secureContentService';

export interface DailyMission {
  id: string;
  user_id: string;
  mission_date: string;
  status: 'pending' | 'in_progress' | 'completed';
  questions_count: number;
  flashcards_count: number;
  summary_count: number;
  questions_completed: number;
  flashcards_completed: number;
  summary_completed: number;
  estimated_minutes: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type MissionStep = 'questions' | 'flashcards' | 'summary' | null;

export interface MissionProgress {
  total: number;
  completed: number;
  percentage: number;
  remaining: number;
}

export function useDailyMission(userId: string | undefined, courseId: string | null) {
  const queryClient = useQueryClient();

  // Buscar missão do dia
  const { data: mission, isLoading, refetch } = useQuery({
    queryKey: ['daily-mission', userId, courseId],
    queryFn: async (): Promise<DailyMission | null> => {
      if (!userId) return null;
      
      const today = new Date().toISOString().split('T')[0];
      
      // Tentar buscar missão existente
      const { data, error } = await supabase
        .from('daily_missions')
        .select('*')
        .eq('user_id', userId)
        .eq('mission_date', today)
        .maybeSingle();
      
      if (error) {
        console.error('[useMission] Erro ao buscar missão:', error);
        return null;
      }
      
      // Se não existir, criar nova
      if (!data) {
        const newMission = await createMission(userId, courseId);
        return newMission;
      }
      
      return data as DailyMission;
    },
    enabled: !!userId,
    staleTime: 1000 * 30, // 30 segundos
  });

  // Criar missão
  const createMission = async (uid: string, courseId: string | null): Promise<DailyMission> => {
    const today = new Date().toISOString().split('T')[0];
    
    const [questions, flashcards] = await Promise.all([
      fetchSecureContent<{ id: number }>('questions', { courseId }),
      fetchSecureContent<{ id: number }>('flashcards', { courseId }),
    ]);

    const { data, error } = await supabase
      .from('daily_missions')
      .insert({
        user_id: uid,
        mission_date: today,
        status: 'pending',
        questions_count: Math.min(questions.length, 10),
        flashcards_count: Math.min(flashcards.length, 5),
        summary_count: 1,
        questions_completed: 0,
        flashcards_completed: 0,
        summary_completed: 0,
        estimated_minutes: 20,
      })
      .select()
      .single();

    if (error) throw error;
    return data as DailyMission;
  };

  // Atualizar progresso de uma etapa
  const updateProgressMutation = useMutation({
    mutationFn: async ({ step, completed }: { step: MissionStep; completed: number }) => {
      if (!userId || !mission || !step) throw new Error('Missing data');
      
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      
      if (step === 'questions') {
        updates.questions_completed = completed;
        updates.status = 'in_progress';
        if (!updates.started_at) updates.started_at = new Date().toISOString();
      } else if (step === 'flashcards') {
        updates.flashcards_completed = completed;
      } else if (step === 'summary') {
        updates.summary_completed = completed;
      }

      const { error } = await supabase
        .from('daily_missions')
        .update(updates)
        .eq('user_id', userId)
        .eq('mission_date', mission.mission_date);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-mission', userId] });
    },
  });

  // Marcar etapa como concluída
  const completeStepMutation = useMutation({
    mutationFn: async ({ step, total }: { step: MissionStep; total: number }) => {
      if (!userId || !mission || !step) throw new Error('Missing data');
      
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      
      if (step === 'questions') {
        updates.questions_completed = total;
        updates.status = 'in_progress';
        if (!updates.started_at) updates.started_at = new Date().toISOString();
      } else if (step === 'flashcards') {
        updates.flashcards_completed = total;
      } else if (step === 'summary') {
        updates.summary_completed = total;
      }

      const { error } = await supabase
        .from('daily_missions')
        .update(updates)
        .eq('user_id', userId)
        .eq('mission_date', mission.mission_date);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-mission', userId] });
    },
  });

  // Completar missão
  const completeMissionMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !mission) throw new Error('Missing data');
      
      const { error } = await supabase
        .from('daily_missions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('mission_date', mission.mission_date);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-mission', userId] });
    },
  });

  // Calcular progresso geral
  const calculateProgress = (): MissionProgress => {
    if (!mission) return { total: 0, completed: 0, percentage: 0, remaining: 0 };
    
    const total = mission.questions_count + mission.flashcards_count + mission.summary_count;
    const completed = mission.questions_completed + mission.flashcards_completed + mission.summary_completed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return {
      total,
      completed,
      percentage,
      remaining: total - completed,
    };
  };

  // Obter próxima etapa a fazer
  const getNextStep = (): MissionStep => {
    if (!mission) return null;
    
    if (mission.questions_completed < mission.questions_count) {
      return 'questions';
    }
    if (mission.flashcards_completed < mission.flashcards_count) {
      return 'flashcards';
    }
    if (mission.summary_completed < mission.summary_count) {
      return 'summary';
    }
    return null;
  };

  // Obter progresso de uma etapa específica
  const getStepProgress = (step: MissionStep): MissionProgress => {
    if (!mission || !step) return { total: 0, completed: 0, percentage: 0, remaining: 0 };
    
    let total = 0;
    let completed = 0;
    
    if (step === 'questions') {
      total = mission.questions_count;
      completed = mission.questions_completed;
    } else if (step === 'flashcards') {
      total = mission.flashcards_count;
      completed = mission.flashcards_completed;
    } else if (step === 'summary') {
      total = mission.summary_count;
      completed = mission.summary_completed;
    }
    
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, percentage, remaining: total - completed };
  };

  // Reiniciar missão do dia
  const resetMission = async () => {
    if (!userId || !mission) return;
    
    await supabase
      .from('daily_missions')
      .update({
        status: 'pending',
        questions_completed: 0,
        flashcards_completed: 0,
        summary_completed: 0,
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mission.id);
    
    queryClient.invalidateQueries({ queryKey: ['daily-mission', userId] });
  };

  // Iniciar missão (ir para próxima etapa)
  const startMission = async () => {
    // Se missão já está completada, resetar e navegar para questões
    if (mission?.status === 'completed') {
      await resetMission();
      window.location.href = '/questoes';
      return;
    }
    
    const nextStep = getNextStep();
    
    // Marcar como em progresso se ainda não começou
    if (mission && mission.status === 'pending') {
      await supabase
        .from('daily_missions')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('mission_date', mission.mission_date);
      
      queryClient.invalidateQueries({ queryKey: ['daily-mission', userId] });
    }
    
    // Navegar para a próxima etapa
    if (nextStep === 'questions') {
      window.location.href = '/questoes';
    } else if (nextStep === 'flashcards') {
      window.location.href = '/flashcards';
    } else if (nextStep === 'summary') {
      window.location.href = '/resumos';
    }
  };

  // Atualizar progresso de uma etapa
  const updateProgress = async (step: MissionStep, completed: number) => {
    await updateProgressMutation.mutateAsync({ step, completed });
  };

  // Marcar etapa como concluída
  const completeStep = async (step: MissionStep) => {
    if (!mission) return;
    
    let total = 0;
    if (step === 'questions') total = mission.questions_count;
    else if (step === 'flashcards') total = mission.flashcards_count;
    else if (step === 'summary') total = mission.summary_count;
    
    await completeStepMutation.mutateAsync({ step, total });
    
    // Verificar se toda a missão foi concluída
    const nextStep = getNextStep();
    if (!nextStep) {
      await completeMissionMutation.mutateAsync();
    }
  };

  // Verificar status
  const progress = calculateProgress();
  const nextStep = getNextStep();
  const isCompleted = mission?.status === 'completed';
  const isInProgress = mission?.status === 'in_progress';
  const hasStarted = mission?.status !== 'pending' || mission?.questions_completed > 0;
  const allStepsCompleted = nextStep === null;

  return {
    mission,
    isLoading,
    progress,
    nextStep,
    isCompleted,
    isInProgress,
    hasStarted,
    allStepsCompleted,
    getStepProgress,
    startMission,
    resetMission,
    updateProgress,
    completeStep,
    refetch,
  };
}
