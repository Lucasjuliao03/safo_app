export interface AppAccessSnapshot {
  entitled: boolean;
  used: number;
  limit: number;
  remaining: number | null;
  expired?: boolean;
  blocked?: boolean;
  accessExpiresAt?: string | null;
}

export function isAppAccessSnapshot(value: unknown): value is AppAccessSnapshot {
  if (!value || typeof value !== 'object') return false;
  const access = value as AppAccessSnapshot;
  return typeof access.entitled === 'boolean' && Number.isSafeInteger(access.used) && access.used >= 0
    && access.limit === 10 && (access.expired === undefined || typeof access.expired === 'boolean')
    && (access.blocked === undefined || typeof access.blocked === 'boolean')
    && (access.remaining === null || (Number.isSafeInteger(access.remaining) && access.remaining >= 0));
}

export function canUseApp(value: unknown): boolean {
  return isAppAccessSnapshot(value) && !value.blocked && !value.expired && (value.entitled || value.used < value.limit);
}
