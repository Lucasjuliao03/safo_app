import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/study';

const state = vi.hoisted(() => ({
  user: { id: '00000000-0000-4000-8000-000000000001' } as { id: string } | null,
  rpc: vi.fn(),
}));
vi.mock('../../server/supabaseAdmin.js', () => ({
  authenticateBearer: async () => state.user,
  getSupabaseAdmin: () => ({ rpc: state.rpc }),
}));
const body = { type: 'questions', id: 1, selectedOption: 'b', requestId: '00000000-0000-4000-8000-000000000002' };
async function request(method = 'POST', input = body) {
  let code = 200;
  let response: Record<string, any> = {};
  const res = { setHeader: vi.fn(), status: (n: number) => { code = n; return res; },
    json: (value: Record<string, any>) => { response = value; return res; } };
  await handler({ method, headers: {}, body: input } as VercelRequest, res as unknown as VercelResponse);
  return { code, response };
}
beforeEach(() => {
  process.env.APP_URL = 'http://localhost:8080';
  state.user = { id: '00000000-0000-4000-8000-000000000001' };
  state.rpc.mockReset().mockResolvedValue({ data: { used: 1, entitled: false, remaining: 9, correctOption: 'a', isCorrect: false }, error: null });
});

describe('authenticated study API', () => {
  it('binds quota to the verified session and ignores forged user/role/usage/activation fields', async () => {
    const result = await request('POST', { ...body, userId: 'other', entitled: true, used: 0, is_active: true } as typeof body);
    expect(result.code).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('consume_study_use', {
      p_user_id: state.user!.id, p_request_id: body.requestId, p_content_type: 'questions', p_content_id: 1, p_answer_key: 'b',
    });
    expect(result.response.isCorrect).toBe(false);
  });
  it('blocks the eleventh use without returning a correction', async () => {
    state.rpc.mockResolvedValue({ data: { error: 'trial_exhausted', used: 10, remaining: 0 }, error: null });
    const result = await request();
    expect(result.code).toBe(403);
    expect(result.response.code).toBe('trial_exhausted');
    expect(result.response).not.toHaveProperty('correctOption');
  });
  it('fails closed if the database/migration is unavailable', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'function missing' } });
    expect((await request()).code).toBe(503);
  });
  it('rejects clients without a valid session before calling the database', async () => {
    state.user = null;
    expect((await request()).code).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('requires a valid idempotency key and valid answer', async () => {
    expect((await request('POST', { ...body, requestId: 'new' })).code).toBe(400);
    expect((await request('POST', { ...body, selectedOption: 'correct' })).code).toBe(400);
    expect((await request('POST', { ...body, selectedOption: ['a'] } as unknown as typeof body)).code).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('reads lifetime status from the protected database instead of browser counters', async () => {
    expect((await request('GET')).code).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('get_study_access', { p_user_id: state.user!.id });
  });
});
