import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as mentoriaService from '@/services/mentoriaService';
import { supabase } from '@/lib/supabase';

// Hooks para o Aluno
export function useMentoriaStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ['mentoria_status', userId],
    queryFn: () => userId ? mentoriaService.getMyMentoriaStatus(userId) : null,
    enabled: !!userId,
  });
}

export function useMentoriaDiagnostico(userId: string | undefined) {
  return useQuery({
    queryKey: ['mentoria_diagnostico', userId],
    queryFn: () => userId ? mentoriaService.getDiagnostico(userId) : null,
    enabled: !!userId,
  });
}

export function useMentoriaEstrategia(userId: string | undefined) {
  return useQuery({
    queryKey: ['mentoria_estrategia', userId],
    queryFn: () => userId ? mentoriaService.getEstrategia(userId) : null,
    enabled: !!userId,
  });
}

// Tarefas da data X à data Y (Ex: Semanal ou Diário)
export function useMentoriaTasks(userId: string | undefined, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['mentoria_tasks', userId, startDate, endDate],
    queryFn: () => (userId && startDate && endDate) ? mentoriaService.getTasksByDateRange(userId, startDate, endDate) : [],
    enabled: !!userId && !!startDate && !!endDate,
  });
}

export function useCheckInTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (props: { taskId: string, userId: string, payload: Partial<mentoriaService.MentoriaTarefa> }) => 
      mentoriaService.checkInTask(props.taskId, props.userId, props.payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['mentoria_tasks', variables.userId] });
    }
  });
}

export function useStudentAlerts(userId: string | undefined) {
  return useQuery({
    queryKey: ['mentoria_alerts', userId],
    queryFn: () => userId ? mentoriaService.getStudentAlerts(userId) : [],
    enabled: !!userId,
  });
}

export function useStudentInterventions(userId: string | undefined) {
  return useQuery({
    queryKey: ['mentoria_interventions', userId],
    queryFn: () => userId ? mentoriaService.getStudentInterventions(userId) : [],
    enabled: !!userId,
  });
}

// Hooks para o Administrador (Mentor)
export function useAdminMentoringStudents() {
  return useQuery({
    queryKey: ['admin_mentoring_students'],
    queryFn: () => mentoriaService.getMentoringStudents(),
  });
}

export function useAdminUpsertDiagnostico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<mentoriaService.MentoriaDiagnostico>) => mentoriaService.upsertDiagnostico(data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mentoria_diagnostico', data.user_id] });
    }
  });
}

export function useAdminUpsertEstrategia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<mentoriaService.MentoriaEstrategia>) => mentoriaService.upsertEstrategia(data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mentoria_estrategia', data.user_id] });
    }
  });
}

export function useAdminSaveTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tasks: Omit<mentoriaService.MentoriaTarefa, 'id' | 'created_at' | 'updated_at' | 'completed_at'>[]) => 
      mentoriaService.adminSaveTasks(tasks),
    onSuccess: (_, variables) => {
      if (variables.length > 0) {
        qc.invalidateQueries({ queryKey: ['mentoria_tasks', variables[0].user_id] });
      }
    }
  });
}

export function useAdminRegisterIntervention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (props: { userId: string, mentorId: string, reason: string, action_taken: string }) => 
      mentoriaService.registrarIntervencao(props.userId, props.mentorId, props.reason, props.action_taken),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['mentoria_interventions', variables.userId] });
    }
  });
}

export function useAdminActivateMentoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (props: { userId: string, mentorId: string }) => 
      mentoriaService.activateMentoria(props.userId, props.mentorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_mentoring_students'] });
    }
  });
}

export function useApplyMentoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (props: {
      userId: string;
      diagForm: Partial<mentoriaService.MentoriaDiagnostico>;
      subjects?: mentoriaService.PlanSubjectInput[];
    }) => {
      // Extrair courseId ANTES de qualquer operação no banco (não é coluna do DB)
      const { courseId: _courseId, ...diagFormClean } = props.diagForm as any;
      const courseId = String(_courseId || '');

      // 1. Ativar mentoria do aluno
      const { error: alError } = await supabase
        .from('mentoria_alunos')
        .upsert({ user_id: props.userId, status: 'active' }, { onConflict: 'user_id' });
      if (alError) throw alError;

      // 2a. Salvar colunas base do diagnóstico (sempre existem no banco)
      const basePayload = {
        user_id:                 props.userId,
        objective:               diagFormClean.objective,
        exam_date:               diagFormClean.exam_date || null,
        daily_available_minutes: diagFormClean.daily_available_minutes,
        strong_subjects:         diagFormClean.strong_subjects,
        weak_subjects:           diagFormClean.weak_subjects,
        history_report:          diagFormClean.history_report,
        method_style:            diagFormClean.method_style,
        mentor_notes:            diagFormClean.mentor_notes || '',
        updated_at:              new Date().toISOString(),
      };
      const { error: diagError } = await supabase
        .from('mentoria_diagnosticos')
        .upsert(basePayload, { onConflict: 'user_id' });
      if (diagError) throw diagError;

      // 2b. Tentar salvar colunas novas (só existem após a migration SQL)
      try {
        const newColPayload = {
          user_id:                   props.userId,
          study_days_of_week:        diagFormClean.study_days_of_week,
          preferred_period:          diagFormClean.preferred_period,
          preparation_level:         diagFormClean.preparation_level,
          include_simulations:       diagFormClean.include_simulations,
          simulation_frequency_days: diagFormClean.simulation_frequency_days,
          review_frequency:          diagFormClean.review_frequency,
          current_focus:             diagFormClean.current_focus,
          schedule_notes:            diagFormClean.schedule_notes,
        };
        await supabase.from('mentoria_diagnosticos').update(newColPayload).eq('user_id', props.userId);
      } catch (e) {
        console.warn('[useApplyMentoria] colunas novas não salvas (execute o SQL de migração):', e);
      }

      // 3. Buscar matérias+temas do banco e gerar plano
      let planSubjects: mentoriaService.PlanSubjectInput[] = props.subjects || [];
      if (courseId && courseId !== 'undefined' && courseId !== '0') {
        try {
          const withTopics = await mentoriaService.getSubjectsWithTopicsForCourse(courseId);
          if (withTopics.length > 0) planSubjects = withTopics;
        } catch (e) {
          console.warn('[useApplyMentoria] falha ao buscar temas:', e);
        }
      }

      if (planSubjects.length > 0) {
        const tasksCreated = await mentoriaService.generateStudyPlan({
          userId:      props.userId,
          subjects:    planSubjects,
          diagnostico: diagFormClean,
        });
        return { tasksCreated };
      }

      console.warn('[useApplyMentoria] subjects vazio — courseId configurado?');
      return { tasksCreated: 0 };
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['mentoria_status', variables.userId] });
      qc.invalidateQueries({ queryKey: ['mentoria_diagnostico', variables.userId] });
      qc.invalidateQueries({ queryKey: ['mentoria_estrategia', variables.userId] });
      qc.invalidateQueries({ queryKey: ['mentoria_tasks', variables.userId] });
    }
  });
}


/** Hook para re-gerar o plano (re-diagnóstico): deleta pendentes futuros e re-cria */
export function useReDiagnostico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (props: {
      userId: string;
      diagForm: Partial<mentoriaService.MentoriaDiagnostico>;
      subjects: mentoriaService.PlanSubjectInput[];
    }) => {
      // Extrair courseId ANTES de qualquer operação no banco
      const { courseId: _courseId, ...diagFormClean } = props.diagForm as any;
      const courseId = String(_courseId || '');

      await mentoriaService.upsertDiagnostico({ ...diagFormClean, user_id: props.userId });
      await mentoriaService.deletePendingFutureTasks(props.userId);

      let planSubjects: mentoriaService.PlanSubjectInput[] = props.subjects || [];
      if (courseId && courseId !== 'undefined' && courseId !== '0') {
        try {
          const withTopics = await mentoriaService.getSubjectsWithTopicsForCourse(courseId);
          if (withTopics.length > 0) planSubjects = withTopics;
        } catch (e) { console.warn('[useReDiagnostico] falha ao buscar temas:', e); }
      }

      const tasksCreated = await mentoriaService.generateStudyPlan({
        userId: props.userId, subjects: planSubjects, diagnostico: diagFormClean,
      });
      return { tasksCreated };
    },

    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['mentoria_diagnostico', variables.userId] });
      qc.invalidateQueries({ queryKey: ['mentoria_estrategia', variables.userId] });
      qc.invalidateQueries({ queryKey: ['mentoria_tasks', variables.userId] });
    }
  });
}

export function useAdminGenerateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tasks: Omit<mentoriaService.MentoriaTarefa, 'id' | 'created_at' | 'updated_at' | 'completed_at'>[]) => {
      return mentoriaService.adminSaveTasks(tasks);
    },
    onSuccess: (_, variables) => {
      if (variables.length > 0) {
        qc.invalidateQueries({ queryKey: ['mentoria_tasks', variables[0].user_id] });
        qc.invalidateQueries({ queryKey: ['admin_mentoring_tasks', variables[0].user_id] });
      }
    }
  });
}

export function useAdminStudentTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin_mentoring_tasks', userId],
    queryFn: () => userId ? mentoriaService.getAllStudentTasks(userId) : [],
    enabled: !!userId
  });
}

export function useAdminDeleteIntervencao(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mentoriaService.deleteIntervencao(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentoria_interventions', userId] });
    }
  });
}

export function useAdminUpdateIntervencao(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; reason: string; action_taken: string }) => 
      mentoriaService.updateIntervencao(p.id, p.reason, p.action_taken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentoria_interventions', userId] });
    }
  });
}

export function useAdminDeleteTask(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mentoriaService.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_mentoring_tasks', userId] });
      qc.invalidateQueries({ queryKey: ['mentoria_tasks', userId] });
    }
  });
}

export function useAdminUpdateTask(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; title?: string; description?: string; planned_minutes?: number; planned_date?: string }) => 
      mentoriaService.updateTask(p.id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_mentoring_tasks', userId] });
      qc.invalidateQueries({ queryKey: ['mentoria_tasks', userId] });
    }
  });
}
