import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getTrilhaPorCurso, 
  fetchProgresso, 
  completarFase,
  autoBuildTrilhaForCourse
} from "@/services/patrulhamentoService";

// Hook para puxar toda a hierarquia de patrulhamento
export function usePatrulhamentoTrilha(courseId?: number | null) {
  return useQuery({
    queryKey: ['patrulhamento_trilha', courseId],
    queryFn: () => getTrilhaPorCurso(Number(courseId)),
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

// Hook para buscar o progresso/save game atual
export function usePatrulhamentoProgresso(userId?: string, courseId?: number | null) {
  return useQuery({
    queryKey: ['patrulhamento_progresso', userId, courseId],
    queryFn: () => fetchProgresso(userId!, Number(courseId)),
    enabled: !!userId && !!courseId,
  });
}

// Hook para marcar fase como lida/ganha
export function useCompletarFase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completarFase,
    onSuccess: (data, variables) => {
      // Invalida o progresso atual obrigando o react a dar reflexão imediata da barra
      queryClient.invalidateQueries({ queryKey: ['patrulhamento_progresso', variables.userId, variables.courseId] });
    }
  });
}

// Admin Hook
export function useAutoBuildPatrulhamento() {
  return useMutation({
    mutationFn: (courseId: number) => autoBuildTrilhaForCourse(courseId)
  });
}
