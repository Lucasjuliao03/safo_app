import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/content';
import enroll from '../../api/mentoria/enroll';

const state = vi.hoisted(() => ({
  user: { id: 'student' } as { id: string } | null,
  profile: { course_id: 1 as number | null, edital_id: 3, role: 'student', is_active: false },
  usageError: false,
  enrollment: null as { user_id: string; status: string } | null,
  savedPlan: true,
  writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

const topics = [
  { id: 1, subject_id: 1, target_course_ids: [1] },
  { id: 2, subject_id: 2, target_course_ids: ['1'] },
  { id: 3, subject_id: 3, target_course_ids: [] },
  { id: 4, subject_id: 4, target_course_ids: [2] },
];

vi.mock('../../server/supabaseAdmin.js', () => ({
  authenticateBearer: vi.fn(async () => state.user),
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let from = 0, to = 999, single = false, head = false;
      let payload: Record<string, unknown> | undefined;
      const query = {
        select: (_?: string, options?: { head?: boolean }) => { head = !!options?.head; return query; },
        eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
        range: (start: number, end: number) => { from = start; to = end; return query; },
        order: () => query,
        limit: (n: number) => { to = n - 1; return query; },
        single: () => { single = true; return query; },
        maybeSingle: () => { single = true; return query; },
        insert: (data: Record<string, unknown>) => { payload = data; return query; },
        upsert: (data: Record<string, unknown>) => { payload = data; return query; },
        update: (data: Record<string, unknown>) => { payload = data; return query; },
        then: (resolve: (result: unknown) => unknown) => {
          if (payload) state.writes.push({ table, payload });
          if (table === 'profiles') return Promise.resolve({ data: state.profile, error: null }).then(resolve);
          if (state.usageError && table === 'user_daily_productivity') {
            return Promise.resolve({ data: null, error: { message: 'usage unavailable' } }).then(resolve);
          }
          const rows: Record<string, unknown>[] = table === 'topics' ? topics
            : table === 'subjects' ? [1, 2, 3, 4].map(id => ({ id, name: `Matéria ${id}`, topics: [topics[id - 1]] }))
            : table === 'edicts' ? [{ id: 3, course_id: 1, is_active: true, year: 2027 }]
            : table === 'edital_law_references' ? [{ edital_id: 3, law_reference_id: 7 }]
            : table === 'questions' ? Array.from({ length: 24 }, (_, i) => ({
              id: i + 1, topics: topics[i % 4], law_reference_id: i < 20 ? 7 : 99,
              correct_option: 'a', explanation: 'Resposta protegida',
              is_active: true, status: 'published',
            }))
            : table === 'mentoria_alunos' ? (payload ? [{ user_id: 'student', ...payload }] : state.enrollment ? [state.enrollment] : [])
            : table === 'mentoria_diagnosticos' || table === 'mentoria_tarefas_diarias'
              ? (state.savedPlan ? [{ id: 'plan', user_id: 'student' }] : []) : [];
          const selected = rows.filter(row => filters.every(([key, val]) => row[key] === val)).slice(from, to + 1);
          return Promise.resolve({ data: head ? null : single ? selected[0] ?? null : selected, count: selected.length, error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

function response() {
  const result = { code: 200, body: {} as { data?: Array<{ id: number }>; error?: string } };
  const res = {
    setHeader: vi.fn(),
    status: (code: number) => { result.code = code; return res; },
    json: (body: typeof result.body) => { result.body = body; return res; },
    end: vi.fn(),
  };
  return { result, res: res as unknown as VercelResponse };
}

async function request(type: string, extra: Record<string, string> = {}) {
  const { result, res } = response();
  await handler({ method: 'GET', headers: {}, query: { type, ...extra } } as unknown as VercelRequest, res);
  return result;
}

beforeEach(() => {
  process.env.APP_URL = 'http://localhost:8080';
  state.user = { id: 'student' };
  state.profile.course_id = 1;
  state.usageError = false;
  state.enrollment = null;
  state.savedPlan = true;
  state.writes = [];
});

describe('course catalog for a new CHO student', () => {
  it('returns course subjects even before subscription activation', async () => {
    const result = await request('subjects');
    expect(result.code).toBe(200);
    expect(result.body.data?.map(row => row.id)).toEqual([1, 2, 3]);
  });
  it('normalizes course IDs and keeps global topics', async () => {
    expect((await request('topics')).body.data?.map(row => row.id)).toEqual([1, 2, 3]);
  });
  it('ignores a forged course parameter', async () => {
    expect((await request('subjects', { courseId: '2' })).body.data?.map(row => row.id)).toEqual([1, 2, 3]);
  });
  it('returns the complete course catalog without exposing corrections', async () => {
    const standard = await request('questions');
    const forged = await request('questions', { courseId: '2', lawIds: '99' });
    expect(standard.body.data).toHaveLength(15);
    expect(standard.body.data?.every(row => !('correct_option' in row) && !('explanation' in row))).toBe(true);
    expect(forged.body.data).toEqual(standard.body.data);
  });
  it('allows selection anywhere in the catalog without revealing its correction', async () => {
    const result = await request('questions', { ids: '19' });
    expect(result.body.data?.map(row => row.id)).toEqual([19]);
    expect(result.body.data?.[0]).not.toHaveProperty('correct_option');
  });
  it('rejects users without a course', async () => {
    state.profile.course_id = null;
    expect((await request('questions')).code).toBe(403);
  });
  it('rejects unauthenticated users', async () => {
    state.user = null;
    expect((await request('subjects')).code).toBe(401);
  });
  it('rejects prototype names as content types', async () => {
    expect((await request('toString')).code).toBe(404);
  });
  it('keeps catalog browsing available independently of quota writes', async () => {
    state.usageError = true;
    expect((await request('questions')).code).toBe(200);
  });
});

describe('mentoring activation', () => {
  async function activate() {
    const { result, res } = response();
    // Body user_id must never select whose mentoring will be activated.
    await enroll({ method: 'POST', headers: {}, body: { user_id: 'someone-else' } } as VercelRequest, res);
    return result;
  }
  it('activates only the authenticated owner after saving their plan', async () => {
    expect((await activate()).code).toBe(200);
    expect(state.writes).toContainEqual({ table: 'mentoria_alunos', payload: { user_id: 'student', status: 'active' } });
    expect(state.writes.find(row => row.table === 'mentoria_estrategias')?.payload.user_id).toBe('student');
  });
  it('requires a saved diagnosis and tasks', async () => {
    state.savedPlan = false;
    expect((await activate()).code).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it('requires authentication before activating a plan', async () => {
    state.user = null;
    expect((await activate()).code).toBe(401);
    expect(state.writes).toEqual([]);
  });
  it('preserves a mentor pause', async () => {
    state.enrollment = { user_id: 'student', status: 'paused' };
    expect((await activate()).code).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it('does not duplicate an active enrollment', async () => {
    state.enrollment = { user_id: 'student', status: 'active' };
    expect((await activate()).code).toBe(200);
    expect(state.writes.filter(row => row.table === 'mentoria_alunos')).toEqual([]);
  });
});
