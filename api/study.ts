import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySameOriginCors, isUuid } from '../server/httpSecurity.js';
import { authenticateBearer, getSupabaseAdmin } from '../server/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let rpc = '';
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!applySameOriginCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const user = await authenticateBearer(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    const db = getSupabaseAdmin();
    let args: Record<string, unknown>;
    if (req.method === 'GET') {
      rpc = 'get_study_access';
      args = { p_user_id: user.id };
    } else {
      const body = req.body;
      if (!body || !isUuid(body.requestId) || !['questions', 'flashcards', 'flashcard_review', 'summary_read'].includes(body.type)
        || !Number.isSafeInteger(body.id) || body.id <= 0
        || (body.type === 'questions' && (typeof body.selectedOption !== 'string' || !/^[abcdevf]$/i.test(body.selectedOption)))
        || (body.type === 'flashcard_review' && !['wrong', 'hard', 'good', 'easy'].includes(body.rating))) {
        return res.status(400).json({ error: 'Requisição de estudo inválida' });
      }
      if (body.type === 'flashcard_review') {
        rpc = 'record_study_review';
        args = { p_user_id: user.id, p_request_id: body.requestId, p_flashcard_id: body.id, p_rating: body.rating };
      } else if (body.type === 'summary_read') {
        rpc = 'record_summary_read';
        args = { p_user_id: user.id, p_request_id: body.requestId, p_summary_id: body.id };
      } else {
        rpc = 'complete_study_use';
        args = { p_user_id: user.id, p_request_id: body.requestId, p_content_type: body.type,
          p_content_id: body.id, p_answer_key: body.type === 'questions' ? body.selectedOption.toLowerCase() : '' };
      }
    }
    const { data, error } = await db.rpc(rpc, args);
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('Invalid study RPC result');
    if (data.error) {
      if (data.error === 'summary_limit') return res.status(403).json({
        error: 'Seu teste gratuito de resumos terminou. Ative sua conta para continuar.', code: 'summary_limit',
      });
      if (data.error === 'trial_exhausted') return res.status(403).json({
        ...data, error: 'Seu teste gratuito de 10 questões e flashcards terminou. Ative sua conta para continuar.', code: 'trial_exhausted',
      });
      const status = data.error === 'request_conflict' ? 409
        : ['invalid_answer', 'invalid_request'].includes(data.error) ? 400 : 403;
      return res.status(status).json({ error: 'Este conteúdo não está disponível para sua conta.', code: data.error });
    }
    return res.status(200).json(data);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'message' in error && error.message === 'account_blocked') {
      return res.status(403).json({ error: 'Acesso suspenso. Entre em contato com o suporte.', code: 'account_blocked' });
    }
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown';
    console.error('[study] request failed', { rpc, code });
    // Missing migration/network/database errors must never grant an extra use.
    return res.status(503).json({ error: 'Não foi possível validar seu acesso de estudo. Tente novamente.',
      code: ['PGRST202', '42883', '42P01'].includes(code) ? 'study_setup_required' : 'study_unavailable' });
  }
}
