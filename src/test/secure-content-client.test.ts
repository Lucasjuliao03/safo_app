import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: {
    user: { id: 'student' }, access_token: 'test-token', expires_at: Math.floor(Date.now() / 1000) + 3600,
  } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('study content client', () => {
  it('rejects and never caches an HTML fallback instead of turning it into empty material', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 1 }] }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const { fetchSecureContent } = await import('@/services/secureContentService');
    await expect(fetchSecureContent('questions', { courseId: 1 })).rejects.toMatchObject({ name: 'SecureContentError', status: 502 });
    expect(await fetchSecureContent('questions', { courseId: 1 })).toEqual([{ id: 1 }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it('requires an array of content rather than silently accepting a wrong JSON endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })));
    const { fetchSecureContent } = await import('@/services/secureContentService');
    await expect(fetchSecureContent('questions')).rejects.toMatchObject({ status: 502 });
  });
  it('refreshes a genuinely expired session once and accepts the valid response', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: {
      user: { id: 'student' }, access_token: 'refreshed-token', expires_at: Math.floor(Date.now() / 1000) + 3600,
    } }, error: null });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Sessão expirada' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 2 }] }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const { fetchSecureContent } = await import('@/services/secureContentService');
    expect(await fetchSecureContent('flashcards')).toEqual([{ id: 2 }]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer refreshed-token');
  });
});
