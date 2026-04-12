/**
 * useAccessStatus — hook que retorna o status de acesso do usuário autenticado.
 *
 * Mantém compatibilidade total com a lógica existente em accessService.ts:
 * - trial é baseado em user_daily_productivity (questões + flashcards do dia)
 * - is_active + active_until do perfil controlam o acesso pago
 */
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  canAccessContent,
  isUserActive,
  FREE_USAGE_LIMIT,
} from "@/services/accessService";
import { useUserProductivity } from "@/hooks/useStudyData";

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
  const { data: todayProd, isLoading: prodLoading } = useUserProductivity(
    user?.id
  );

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

    // Conta uso de hoje (questões + flashcards) — lógica existente
    const answeredCount = todayProd?.questions_answered ?? 0;
    const flashcardsCount = todayProd?.flashcards_reviewed ?? 0;
    const totalUsage = answeredCount + flashcardsCount;

    const active = isUserActive(user);
    const isPaid = user.isApproved; // profiles.is_active
    const accessExpiresAt = user.activeUntil ?? null;

    // Usuário pago com acesso expirado
    if (!active && isPaid) {
      return {
        canAccess: false,
        reason: "expired",
        trialRemaining: 0,
        accessExpiresAt,
        isPaid: true,
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
    const canAccess = canAccessContent(user, totalUsage);
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
  }, [user, isAdmin, authLoading, prodLoading, todayProd]);
}
