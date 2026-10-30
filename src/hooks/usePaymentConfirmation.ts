import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { clearPendingPaymentOrder, fetchPaymentStatus, isOrderId } from '@/services/paymentService';
import { getStudyAccess } from '@/services/studyAccessService';
import { ApiResponseError } from '@/lib/apiJson';

export function usePaymentConfirmation(orderId?: string | null) {
  const { user, refreshUser } = useAuth();
  const client = useQueryClient();
  const refresh = useRef(refreshUser);
  refresh.current = refreshUser;
  const started = useRef(Date.now());
  const completed = useRef<string>();
  useEffect(() => { started.current = Date.now(); completed.current = undefined; }, [orderId, user?.id]);
  const query = useQuery({ queryKey: ['paymentConfirmation', user?.id, orderId],
    queryFn: () => fetchPaymentStatus(orderId!), enabled: !!user && isOrderId(orderId), staleTime: 0,
    retry: (count, error) => count < 1 && !(error instanceof ApiResponseError && [400, 401, 403, 404].includes(error.status)),
    retryDelay: 1000, refetchOnWindowFocus: true,
    refetchInterval: query => Date.now() - started.current > 60_000
      || ['approved', 'refunded', 'charged_back', 'cancelled'].includes(query.state.data?.order.status ?? '') ? false : 3000,
  });
  useEffect(() => {
    const result = query.data;
    if (!user || !orderId || !result?.access.entitled || result.order.status !== 'approved'
      || !result.order.fulfilled_at || completed.current === orderId) return;
    completed.current = orderId;
    void Promise.all([refresh.current(), getStudyAccess().then(access => client.setQueryData(['studyAccess', user.id], access))])
      .then(() => { clearPendingPaymentOrder(user.id, orderId); void client.invalidateQueries({ queryKey: ['userProfile', user.id] }); })
      .catch(() => { completed.current = undefined; });
  }, [query.data, user, orderId, client]);
  return { ...query, checkAgain: () => { started.current = Date.now(); return query.refetch(); } };
}
