// accessService.ts — Supabase-backed access control
// Access is now derived from the user object in AuthContext

import { User } from "@/types/study";

export const FREE_USAGE_LIMIT = 10; // 10 questões + flashcards combinados
export const FREE_SUMMARY_LIMIT = 2;

export function isUserActive(user: User | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.accessBlocked) return false;
  if (user.activeUntil) {
    const expiry = new Date(user.activeUntil).getTime();
    if (Date.now() > expiry) return false;
  }
  return true;
}

/**
 * Verifica se o usuário pode acessar questões/flashcards.
 * @param usageCount - total combinado de questões respondidas + flashcards revisados
 */
export function canAccessContent(user: User | null, usageCount: number): boolean {
  if (!user) return false;
  if (!isUserActive(user)) return false;
  if (user.role === "admin" || user.isApproved) return true;
  return usageCount < FREE_USAGE_LIMIT;
}

export function getRemainingUsage(user: User | null, usageCount: number): number {
  if (!user) return 0;
  if (!isUserActive(user)) return 0;
  if (user.role === "admin" || user.isApproved) return Infinity;
  return Math.max(0, FREE_USAGE_LIMIT - usageCount);
}

export function canAccessSummaries(user: User | null, readCount: number): boolean {
  if (!user) return false;
  if (!isUserActive(user)) return false;
  if (user.role === "admin" || user.isApproved) return true;
  return readCount < FREE_SUMMARY_LIMIT;
}

// Backwards compat aliases:
export function canAccessQuestions(user: User | null, answeredCount: number): boolean {
  return canAccessContent(user, answeredCount);
}
export function getRemainingQuestions(user: User | null, answeredCount: number): number {
  return getRemainingUsage(user, answeredCount);
}
export function canAnswer(user: User | null): boolean {
  return isUserActive(user);
}
export function getRemainingFreeQuestions(user: User | null, answeredCount: number): number {
  return getRemainingUsage(user, Math.min(answeredCount, FREE_USAGE_LIMIT));
}

