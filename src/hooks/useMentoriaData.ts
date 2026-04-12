import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as mentoriaService from '@/services/mentoriaService';

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
