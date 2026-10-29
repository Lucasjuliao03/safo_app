// Explicitly authorized live test. Uses a real temporary account and always
// revokes its session, deletes the account, and checks for remaining test rows.
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveVercelRewrite } from './helpers/vercelRewrite';

describe.skipIf(process.env.SAFO_LIVE_E2E !== '1')('CHO real student and mentoring lifecycle', () => {
  const runId = randomUUID();
  const originalFetch = globalThis.fetch;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let admin: SupabaseClient;
  let student: SupabaseClient;
  let server: Server;
  let testUserId: string | undefined;
  let baseUrl: string;
  let courseId: number;
  let editalId: number;
  let tablesWithUserId: string[] = [];

  beforeAll(async () => {
    config({ quiet: true });
    const url = process.env.SUPABASE_URL!;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const publicKey = process.env.VITE_SUPABASE_ANON_KEY!;
    expect(url).toBeTruthy();
    expect(secret).toBeTruthy();
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', publicKey);
    admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

    const schemaResponse = await originalFetch(`${url}/rest/v1/`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
    });
    expect(schemaResponse.status).toBe(200);
    const schema = await schemaResponse.json();
    tablesWithUserId = Object.entries(schema.definitions ?? {})
      .filter(([, definition]) => !!(definition as { properties?: Record<string, unknown> }).properties?.user_id)
      .map(([name]) => name);

    const courses = await admin.from('courses').select('id').eq('name', 'CHO').eq('is_active', true).single();
    if (courses.error) throw courses.error;
    courseId = Number(courses.data.id);
    const edicts = await admin.from('edicts').select('id').eq('course_id', courseId)
      .eq('is_active', true).order('year', { ascending: false }).order('id', { ascending: false }).limit(1).single();
    if (edicts.error) throw edicts.error;
    editalId = Number(edicts.data.id);

    const contentHandler = (await import('../../api/content')).default;
    const enrollmentHandler = (await import('../../api/mentoria/enroll')).default;
    server = createServer(async (incoming, outgoing) => {
      try {
        const originalUrl = new URL(incoming.url!, 'http://127.0.0.1');
        const rewrite = resolveVercelRewrite(originalUrl.pathname);
        const url = rewrite ? new URL(rewrite, originalUrl) : originalUrl;
        const req = incoming as VercelRequest;
        req.query = { ...Object.fromEntries(originalUrl.searchParams), ...Object.fromEntries(url.searchParams) };
        const res = outgoing as VercelResponse;
        res.status = code => { res.statusCode = code; return res; };
        res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };
        if (url.pathname === '/api/content') await contentHandler(req, res);
        else if (url.pathname === '/api/mentoria/enroll') await enrollmentHandler(req, res);
        else res.status(404).json({ error: 'Route not found' });
      } catch {
        outgoing.statusCode = 500;
        outgoing.end(JSON.stringify({ error: 'Test HTTP adapter failed' }));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server failed to bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
    vi.stubEnv('APP_URL', baseUrl);
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => originalFetch(
      typeof input === 'string' && input.startsWith('/api/') ? `${baseUrl}${input}` : input, init,
    ));

    const email = `safo-cho-e2e-${runId}@example.invalid`;
    const password = `${randomUUID()}Aa1!`;
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { safo_e2e_run: runId },
      user_metadata: { full_name: 'SAFO teste temporário CHO', course_id: courseId },
    });
    if (created.error) throw created.error;
    testUserId = created.data.user.id;
    console.log(JSON.stringify({ stage: 'temporary_account_created', testUserId, runId }));
    const setup = await admin.from('profiles').update({ course_id: courseId, edital_id: editalId, is_active: false })
      .eq('id', testUserId).select('id').single();
    if (setup.error) throw setup.error;

    student = (await import('@/lib/supabase')).supabase;
    const login = await student.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    expect(login.data.user.id).toBe(testUserId);
    console.log(JSON.stringify({ stage: 'real_student_login', success: true, courseId, editalId }));
  }, 90_000);

  it('loads materials and generates, persists, activates and reads the complete plan', async () => {
    const profile = await student.from('profiles').select('course_id,edital_id,role,is_active').eq('id', testUserId!).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({ course_id: courseId, edital_id: editalId, role: 'student', is_active: false });
    const { fetchSecureContent } = await import('@/services/secureContentService');
    const counts: Record<string, number> = {};
    for (const type of ['subjects', 'topics', 'questions', 'flashcards', 'summaries'] as const) {
      const rows = await fetchSecureContent<{ id: number }>(type, { courseId });
      expect(rows.length, type).toBeGreaterThan(0);
      if (type === 'questions') {
        expect(rows.length).toBeGreaterThan(10);
        expect(rows.every(row => !('correct_option' in row))).toBe(true);
      }
      counts[type] = rows.length;
    }
    console.log(JSON.stringify({ stage: 'real_student_materials', counts }));

    const { useApplyMentoria } = await import('@/hooks/useMentoriaData');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useApplyMentoria(), { wrapper });
    let generated = 0;
    await act(async () => {
      const saved = await result.current.mutateAsync({
        userId: testUserId!,
        diagForm: {
          courseId: String(courseId), objective: 'Teste temporário CHO', exam_date: null,
          daily_available_minutes: 120, study_days_of_week: [1, 2, 3, 4, 5], preferred_period: 'noite',
          preparation_level: 'intermediario', weak_subjects: [], strong_subjects: [],
          method_style: 'misto', current_focus: 'misto', review_frequency: 'semanal',
          include_simulations: false, simulation_frequency_days: 14,
          schedule_notes: `Teste autorizado ${runId}`, history_report: 'Teste automatizado temporário', mentor_notes: '',
        } as Parameters<typeof result.current.mutateAsync>[0]['diagForm'],
      });
      generated = saved.tasksCreated;
    });
    expect(generated).toBe(80);
    const { getMyMentoriaStatus, getDiagnostico, getEstrategia, getTasksByDateRange } = await import('@/services/mentoriaService');
    const end = new Date(); end.setUTCDate(end.getUTCDate() + 70);
    const [status, diagnosis, strategy, tasks] = await Promise.all([
      getMyMentoriaStatus(testUserId!), getDiagnostico(testUserId!), getEstrategia(testUserId!),
      getTasksByDateRange(testUserId!, new Date().toISOString().slice(0, 10), end.toISOString().slice(0, 10)),
    ]);
    expect(status?.status).toBe('active');
    expect(diagnosis?.plan_generated).toBe(true);
    expect(diagnosis?.plan_version).toBe(1);
    expect(strategy?.weekly_questions_target).toBe(80);
    expect(Object.keys(strategy.focus_areas)).toHaveLength(counts.subjects);
    expect(tasks).toHaveLength(generated);
    expect(new Set(tasks.map(task => task.subject_id)).size).toBe(counts.subjects);
    expect(tasks.every(task => task.subjects?.name)).toBe(true);
    const versions = await student.from('mentoria_plan_versions').select('id').eq('user_id', testUserId!);
    expect(versions.error).toBeNull();
    expect(versions.data).toHaveLength(1);
    console.log(JSON.stringify({ stage: 'complete_mentoring_verified', tasks: generated, status: status.status,
      diagnosisSaved: true, strategySaved: true, versionSaved: true, subjectNamesReadable: true }));
  }, 120_000);

  afterAll(async () => {
    cleanup();
    queryClient.clear();
    try {
      if (student) {
        const signout = await student.auth.signOut({ scope: 'global' });
        if (signout.error) console.error('Test session revocation:', signout.error.message);
        student.auth.stopAutoRefresh();
      }
      if (testUserId && admin) {
        const owner = await admin.auth.admin.getUserById(testUserId);
        if (owner.data.user?.app_metadata?.safo_e2e_run !== runId) {
          throw new Error(`Refusing cleanup: test marker mismatch for ${testUserId}`);
        }
        const removed = await admin.auth.admin.deleteUser(testUserId);
        if (removed.error) throw removed.error;
        // Cascade handles normal relationships; remove any test-only rows on
        // tables lacking a FK and then verify the exact UUID is absent.
        for (const table of tablesWithUserId) {
          let check = await admin.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', testUserId);
          if (check.error) throw new Error(`Cleanup check ${table}: ${check.error.message}`);
          if (check.count) {
            const remaining = await admin.from(table).delete().eq('user_id', testUserId);
            if (remaining.error) throw new Error(`Cleanup ${table}: ${remaining.error.message}`);
            check = await admin.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', testUserId);
            if (check.error) throw check.error;
          }
          expect(check.count, `remaining rows in ${table}`).toBe(0);
        }
        for (const table of ['profiles', 'public_profile_directory']) {
          const check = await admin.from(table).select('id', { count: 'exact', head: true }).eq('id', testUserId);
          if (check.error) throw check.error;
          expect(check.count, table).toBe(0);
        }
        const authCheck = await admin.auth.admin.getUserById(testUserId);
        expect(authCheck.data.user).toBeNull();
        console.log(JSON.stringify({ stage: 'cleanup_verified', testUserId, authDeleted: true,
          profileDeleted: true, mentoringDeleted: true, tablesChecked: tablesWithUserId.length }));
      }
    } finally {
      if (server) await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  }, 120_000);
});
