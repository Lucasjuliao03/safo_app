import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getStudyAccess } from '@/services/studyAccessService';

export function useStudyAccess() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['studyAccess', user?.id], queryFn: getStudyAccess,
    enabled: !!user, staleTime: 0, refetchOnWindowFocus: true, retry: 1 });
}
