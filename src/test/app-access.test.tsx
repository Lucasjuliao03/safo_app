import { useEffect, type ReactNode } from 'react';
import { render, cleanup, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const state = vi.hoisted(() => ({ readAccess: vi.fn(), mounted: vi.fn(), unmounted: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'student' }, isAuthenticated: true, loading: false, isAdmin: false }) }));
vi.mock('@/services/studyAccessService', () => ({ getStudyAccess: () => state.readAccess() }));
let client: QueryClient;
const trial = { entitled: false, used: 9, limit: 10, remaining: 1 };
const exhausted = { ...trial, used: 10, remaining: 0 };
function Module() {
  useEffect(() => { state.mounted(); return () => state.unmounted(); }, []);
  return <div>Conteúdo do módulo</div>;
}
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.readAccess.mockReset().mockResolvedValue(exhausted);
  state.mounted.mockReset(); state.unmounted.mockReset();
});
afterEach(() => { cleanup(); client.clear(); });

describe('global app access', () => {
  it.each(['/', '/questoes', '/flashcards', '/resumos', '/estudos', '/ranking', '/medalhas',
    '/mentoria', '/mentoria/execucao', '/mentoria/relatorios', '/patrulhamento', '/patrulhamento/fase/7'])('never mounts the blocked module at %s', async path => {
    render(<MemoryRouter initialEntries={[path]}><ProtectedRoute><Module /></ProtectedRoute></MemoryRouter>, { wrapper: Wrapper });
    expect(await screen.findByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(state.mounted).not.toHaveBeenCalled();
  });
  it.each(['/perfil', '/assinar'])('keeps %s available even when validation is unavailable', async path => {
    state.readAccess.mockRejectedValue(new Error('Servidor indisponível'));
    render(<MemoryRouter initialEntries={[path]}><ProtectedRoute><Module /></ProtectedRoute></MemoryRouter>, { wrapper: Wrapper });
    expect(screen.getByText('Conteúdo do módulo')).toBeInTheDocument();
    expect(state.readAccess).not.toHaveBeenCalled();
  });
  it('waits for fresh validation before mounting a module even with a cached paid profile', async () => {
    let finish!: (value: typeof exhausted) => void;
    client.setQueryData(['studyAccess', 'student'], { ...trial, entitled: true });
    state.readAccess.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter><ProtectedRoute><Module /></ProtectedRoute></MemoryRouter>, { wrapper: Wrapper });
    expect(state.mounted).not.toHaveBeenCalled();
    await act(async () => { finish(exhausted); });
    expect(await screen.findByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(state.mounted).not.toHaveBeenCalled();
  });
  it('unmounts a live module and clears cached content when the last use is consumed', async () => {
    state.readAccess.mockResolvedValue(trial);
    render(<MemoryRouter><ProtectedRoute><Module /></ProtectedRoute></MemoryRouter>, { wrapper: Wrapper });
    expect(await screen.findByText('Conteúdo do módulo')).toBeInTheDocument();
    client.setQueryData(['mentoria', 'student'], { secret: 'cached' });
    act(() => { client.setQueryData(['studyAccess', 'student'], exhausted); });
    await screen.findByText('Seu teste gratuito acabou');
    await waitFor(() => expect(state.unmounted).toHaveBeenCalledOnce());
    expect(client.getQueryData(['mentoria', 'student'])).toBeUndefined();
    expect(screen.queryByText('Conteúdo do módulo')).not.toBeInTheDocument();
  });
  it('revalidates navigation from profile instead of trusting an earlier grant', async () => {
    client.setQueryData(['studyAccess', 'student'], trial);
    render(<MemoryRouter initialEntries={['/perfil']}><Link to="/ranking">Abrir ranking</Link><Routes>
      <Route path="/perfil" element={<ProtectedRoute><div>Perfil</div></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><Module /></ProtectedRoute>} />
    </Routes></MemoryRouter>, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('Abrir ranking'));
    expect(await screen.findByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(state.mounted).not.toHaveBeenCalled();
  });
  it('releases modules when payment is confirmed by the server', async () => {
    state.readAccess.mockResolvedValue({ ...exhausted, entitled: true, remaining: null });
    render(<MemoryRouter><ProtectedRoute><Module /></ProtectedRoute></MemoryRouter>, { wrapper: Wrapper });
    expect(await screen.findByText('Conteúdo do módulo')).toBeInTheDocument();
  });
  it('fails closed on a validation error without claiming the trial is exhausted', async () => {
    state.readAccess.mockRejectedValue(new Error('Servidor indisponível'));
    render(<MemoryRouter><ProtectedRoute><Module /></ProtectedRoute></MemoryRouter>, { wrapper: Wrapper });
    expect(await screen.findByRole('alert', {}, { timeout: 2500 })).toHaveTextContent('Servidor indisponível');
    expect(state.mounted).not.toHaveBeenCalled();
    expect(screen.queryByText('Seu teste gratuito acabou')).not.toBeInTheDocument();
  });
});
