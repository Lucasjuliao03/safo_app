/**
 * useAccessStatus — hook que retorna o status de acesso do usuário autenticado.
 *
 * O servidor é a fonte do acesso e da quota:
 * - trial usa o contador privado vitalício do servidor (questões + flashcards)
 * - is_active + active_until do perfil controlam o acesso pago
 */
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FREE_USAGE_LIMIT } from "@/services/accessService";
import { useStudyAccess } from './useStudyAccess';

export type AccessReason =
  | "admin"
  | "paid"
  | "trial"
  | "trial_exhausted"
  | "expired"
  | "loading";

export interface AccessStatus {
  canAccess: boolean;
  reason: AccessReason;
  trialRemaining: number;
  accessExpiresAt: string | null;
  isPaid: boolean;
  isOnTrial: boolean;
  isLoading: boolean;
}

export function useAccessStatus(): AccessStatus {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { data: access, isLoading: prodLoading } = useStudyAccess();

  return useMemo<AccessStatus>(() => {
    const isLoading = authLoading || prodLoading;

    if (isLoading) {
      return {
        canAccess: false,
        reason: "loading",
        trialRemaining: 0,
        accessExpiresAt: null,
        isPaid: false,
        isOnTrial: false,
        isLoading: true,
      };
    }

    if (!user) {
      return {
        canAccess: false,
        reason: "expired",
        trialRemaining: 0,
        accessExpiresAt: null,
        isPaid: false,
        isOnTrial: false,
        isLoading: false,
      };
    }

    // Admin sempre tem acesso total
    if (isAdmin) {
      return {
        canAccess: true,
        reason: "admin",
        trialRemaining: 999,
        accessExpiresAt: null,
        isPaid: true,
        isOnTrial: false,
        isLoading: false,
      };
    }

    // Resumos têm limite próprio; a quota de estudo é independente da produtividade.
    const totalUsage = access?.used ?? FREE_USAGE_LIMIT;

    const isPaid = access?.entitled === true;
    const accessExpiresAt = user.activeUntil ?? null;

    // Usuário pago com acesso expirado
    if (access?.expired) {
      return {
        canAccess: false,
        reason: "expired",
        trialRemaining: 0,
        accessExpiresAt,
        isPaid: false,
        isOnTrial: false,
        isLoading: false,
      };
    }

    // Usuário pago com acesso ativo
    if (isPaid) {
      return {
        canAccess: true,
        reason: "paid",
        trialRemaining: 0,
        accessExpiresAt,
        isPaid: true,
        isOnTrial: false,
        isLoading: false,
      };
    }

    // Usuário no trial
    const canAccess = !!access && totalUsage < FREE_USAGE_LIMIT;
    const trialRemaining = Math.max(0, FREE_USAGE_LIMIT - totalUsage);

    return {
      canAccess,
      reason: canAccess ? "trial" : "trial_exhausted",
      trialRemaining,
      accessExpiresAt: null,
      isPaid: false,
      isOnTrial: true,
      isLoading: false,
    };
  }, [user, isAdmin, authLoading, prodLoading, access]);
}
