import { useAuth } from '@/contexts/AuthContext';
import { pendingPaymentOrder } from '@/services/paymentService';
import { usePaymentConfirmation } from '@/hooks/usePaymentConfirmation';

/** Recover a checkout even if its browser return or webhook was interrupted. */
export function PaymentRecovery() {
  const { user } = useAuth();
  usePaymentConfirmation(pendingPaymentOrder(user?.id));
  return null;
}
