import type { VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { isAppAccessSnapshot, canUseApp } from '../src/lib/appAccess.js';

/** The private lifetime counter, never browser/profile metadata, grants access. */
export async function requireAppAccess(userId: string, res: VercelResponse): Promise<boolean> {
  res.setHeader('Cache-Control', 'private, no-store');
  const { data, error } = await getSupabaseAdmin().rpc('get_study_access', { p_user_id: userId });
  if (error || !isAppAccessSnapshot(data)) {
    res.status(503).json({ error: 'Não foi possível validar seu acesso. Tente novamente.', code: 'study_unavailable' });
    return false;
  }
  if (!canUseApp(data)) {
    res.status(403).json({ error: data.expired ? 'Seu acesso expirou. Renove seu plano.'
      : 'Seu teste gratuito acabou. Escolha um plano para continuar.',
    code: data.expired ? 'access_expired' : 'trial_exhausted' });
    return false;
  }
  return true;
}
