import type { ReactNode } from 'react';
import { render, renderHook, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import MentoriaExecucao from '@/pages/mentoria/MentoriaExecucao';
import { useMentoriaTasks } from '@/hooks/useMentoriaData';

const state = vi.hoisted(() => ({ tasks: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'student' } }) }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/services/mentoriaService', () => ({ getTasksByDateRange: (...args: unknown[]) => state.tasks(...args),
  getMyMentoriaStatus: async () => ({ status: 'active' }) }));
let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: 5, retryDelay: 10 } } });
  state.tasks.mockReset().mockResolvedValue([]);
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('mentoring task loading', () => {
  it('does not repeatedly retry a PostgREST permission failure', async () => {
    state.tasks.mockRejectedValue({ code: '42501', message: 'permission denied for function can_access_subject' });
    const { result } = renderHook(() => useMentoriaTasks('student', '2026-10-30', '2026-10-30'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(state.tasks).toHaveBeenCalledTimes(1);
  });
  it('shows a loading failure instead of claiming the saved plan is empty', async () => {
    state.tasks.mockRejectedValue({ code: '42501', message: 'permission denied' });
    render(<MentoriaExecucao />, { wrapper: Wrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar suas tarefas');
    expect(screen.queryByText(/Nenhuma tarefa/)).not.toBeInTheDocument();
  });
  it('uses the Brazilian study date even when UTC is already the following day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T01:30:00Z'));
    state.tasks.mockResolvedValue([{ id: 'saved', title: 'Tarefa salva do plano', task_type: 'theory', status: 'pending',
      planned_date: '2026-10-30', planned_minutes: 30, subjects: { name: 'Direito' } }]);
    render(<MentoriaExecucao />, { wrapper: Wrapper });
    expect(await screen.findByText('Tarefa salva do plano')).toBeInTheDocument();
    expect(state.tasks).toHaveBeenCalledWith('student', '2026-10-30', '2026-10-30');
  });
});
