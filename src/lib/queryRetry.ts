/** Permission/session errors need a fix or renewed access, not repeated reads. */
export function retryAppQuery(failureCount: number, error: unknown): boolean {
  if (error && typeof error === 'object') {
    const { status, code } = error as { status?: number; code?: string };
    if (status && status >= 400 && status < 500) return false;
    if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code ?? '')) return false;
  }
  return failureCount < 1;
}
