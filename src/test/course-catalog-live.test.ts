// Opt-in, read-only integration check. No account, enrollment or task is created.
// Authentication is stubbed; profile authorization and database reads are real.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import handler from '../../api/content';

const live = vi.hoisted(() => ({ db: null as SupabaseClient | null, userId: '' }));
vi.mock('../../server/supabaseAdmin.js', () => ({
  authenticateBearer: async () => ({ id: live.userId }),
  getSupabaseAdmin: () => live.db,
}));

describe.skipIf(process.env.SAFO_LIVE_READONLY !== '1')('live CHO catalog (read only)', () => {
  beforeAll(async () => {
    config({ quiet: true });
    live.db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    process.env.APP_URL = 'http://localhost:8080';
    const { data, error } = await live.db.from('profiles').select('id,course_id')
      .order('created_at', { ascending: false }).limit(1).single();
    if (error) throw error;
    expect(data.course_id).toBe(1);
    live.userId = data.id;
  });

  for (const type of ['subjects', 'topics', 'questions', 'flashcards', 'summaries']) {
    it(`reads ${type} for the newest CHO profile`, async () => {
      let code = 200;
      let body: { data?: unknown[]; error?: string } = {};
      const res = {
        setHeader: () => undefined,
        status: (value: number) => { code = value; return res; },
        json: (value: typeof body) => { body = value; return res; },
      } as unknown as VercelResponse;
      await handler({ method: 'GET', headers: {}, query: { type, courseId: '2' } } as unknown as VercelRequest, res);
      expect(code, body.error).toBe(200);
      expect(body.data?.length).toBeGreaterThan(0);
      if (type === 'questions') expect(body.data!.length).toBeLessThanOrEqual(10);
      console.log(JSON.stringify({ type, status: code, visibleRows: body.data?.length }));
    }, 20_000);
  }
});
