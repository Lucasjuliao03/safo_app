import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getStudyAccess } from '@/services/studyAccessService';
import { ApiResponseError } from '@/lib/apiJson';

export function useStudyAccess(enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ['studyAccess', user?.id], queryFn: getStudyAccess,
    enabled: !!user && enabled, staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 15_000,
    retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiResponseError
      && (error.code === 'study_setup_required' || [401, 403].includes(error.status))),
    retryDelay: 500 });
}
