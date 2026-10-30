import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { rememberLastStudyFeedback } from '@/lib/lastStudyFeedback';
import QuestoesPage from '@/pages/Questoes';
import FlashcardsPage from '@/pages/Flashcards';
import { useAccessStatus } from '@/hooks/useAccessStatus';
import type { StudyFeedback } from '@/services/studyAccessService';
import type { Question } from '@/types/study';
import { ApiResponseError } from '@/lib/apiJson';

const state = vi.hoisted(() => ({ user: { id: 'student', courseId: 1, role: 'student', isApproved: false },
  answer: vi.fn(), reveal: vi.fn(), review: vi.fn(), readAccess: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, isAdmin: false, loading: false, isAuthenticated: true }) }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/services/studyAccessService', () => ({
  getStudyAccess: () => state.readAccess(),
  recordStudyFlashcardReview: (id: number, result: string, requestId: string) => state.review({ flashcardId: id, result, requestId }),
  revealStudyFlashcard: (...args: unknown[]) => state.reveal(...args),
  isStudyLimitError: () => false,
}));
vi.mock('@/hooks/useStudyData', () => ({
  SUBJECT_UI_MAP: {},
  useActiveLawIdsForCourse: () => ({ data: [] }),
  useSubjects: () => ({ data: [{ id: '1', name: 'Direito', questionCount: 12 }] }),
  useTopics: () => ({ data: [{ id: 1, name: 'Constituição', subject_id: 1 }] }),
  useQuestions: () => ({ data: Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1), subjectId: '1', topicId: '1', statement: `Enunciado ${i + 1}`,
    format: 'multiple_choice', board: 'BANCA', difficulty: 'fácil', year: 2026,
    options: [{ id: 'a', text: 'Alternativa A' }, { id: 'b', text: 'Alternativa B' }],
    correctOption: '', explanation: '',
  } as Question)) }),
  useFlashcards: () => ({ data: [1, 2].map(id => ({ id: String(id), subjectId: '1', topicId: '1', front: `Frente ${id}`, back: '' })) }),
  useUserQuestionStats: () => ({ data: [] }),
  useUserFlashcardReviews: () => ({ data: [] }),
  useRecordFlashcardReview: () => ({ mutateAsync: (args: unknown) => state.review(args) }),
  useRecordAnswer: () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (args: unknown) => state.answer(args) as Promise<StudyFeedback>,
      onSuccess: (data, args) => { const vars = args as { questionId: number; requestId: string }; rememberLastStudyFeedback(qc, 'student', { type: 'questions', id: vars.questionId, requestId: vars.requestId, feedback: data }); qc.setQueryData(['studyAccess', 'student'], data); } });
  },
}));

let qc: QueryClient;
const exhausted = { entitled: false, used: 10, remaining: 0, limit: 10 };
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}
function questionCatalog() {
  fireEvent.click(screen.getByRole('button', { name: /Múltipla Escolha/ }));
  fireEvent.click(screen.getByRole('button', { name: /VARIADAS/ }));
  fireEvent.click(screen.getByRole('button', { name: /Direito/ }));
}
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.user = { id: 'student', courseId: 1, role: 'student', isApproved: false };
  state.readAccess.mockReset().mockResolvedValue({ entitled: false, used: 9, remaining: 1, limit: 10 });
  state.answer.mockReset().mockResolvedValue({ ...exhausted, correctOption: 'a', isCorrect: true,
    explanation: 'Correção da décima questão', replayed: false });
  state.reveal.mockReset().mockResolvedValue({ ...exhausted, back: 'Verso da décima utilização', replayed: false });
  state.review.mockReset().mockResolvedValue({ ...exhausted, replayed: false });
});
afterEach(() => { cleanup(); qc.clear(); });

describe('lifetime trial interface', () => {
  it('blocks the complete catalog after the lifetime trial is exhausted', async () => {
    state.readAccess.mockResolvedValue(exhausted);
    render(<ProtectedRoute><QuestoesPage /></ProtectedRoute>, { wrapper: Wrapper });
    expect(await screen.findByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^M.*Escolha/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Meu perfil' })).toBeInTheDocument();
    expect(state.answer).not.toHaveBeenCalled();
  });
  it('keeps the tenth correction in the global blocked screen', async () => {
    render(<ProtectedRoute><QuestoesPage /></ProtectedRoute>, { wrapper: Wrapper });
    await screen.findByRole('button', { name: /Escolha/ });
    questionCatalog();
    fireEvent.click(screen.getByRole('button', { name: /Constitui/ }));
    fireEvent.click(screen.getByRole('button', { name: /Alternativa A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }));
    expect(await screen.findByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(screen.getByText(/Corre.*quest/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pr.xima/ })).not.toBeInTheDocument();
    expect(state.answer).toHaveBeenCalledTimes(1);
  });
  it('saves the tenth flashcard review inside the blocked screen', async () => {
    render(<ProtectedRoute><FlashcardsPage /></ProtectedRoute>, { wrapper: Wrapper });
    await screen.findByRole('button', { name: /Direito/ });
    fireEvent.click(screen.getByRole('button', { name: /Direito/ }));
    fireEvent.click(screen.getByRole('button', { name: /Constitui/ }));
    fireEvent.click(screen.getByRole('button', { name: /Revelar Resposta/ }));
    expect(await screen.findByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(screen.getByText(/Verso da/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bom' }));
    await waitFor(() => expect(screen.queryByText(/Verso da/)).not.toBeInTheDocument());
    expect(state.reveal).toHaveBeenCalledTimes(1);
    expect(state.review).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String), result: 'good' }));
  });
  it('preserves a revealed card and retries the same review when saving fails', async () => {
    state.readAccess.mockResolvedValue({ entitled: true, used: 0, remaining: null, limit: 10 });
    state.reveal.mockResolvedValue({ entitled: true, used: 0, remaining: null, limit: 10, back: 'Verso persistente', replayed: false });
    state.review.mockRejectedValueOnce(new Error('Falha temporária')).mockResolvedValue({ entitled: true, used: 0, remaining: null, limit: 10, replayed: false });
    render(<FlashcardsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Direito/ }));
    fireEvent.click(screen.getByRole('button', { name: /Constituição/ }));
    fireEvent.click(screen.getByRole('button', { name: /Revelar Resposta/ }));
    expect(await screen.findByText('Verso persistente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bom' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bom' })).not.toBeDisabled());
    expect(screen.getByText('Card 1 de 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bom' }));
    await waitFor(() => expect(screen.getByText('Card 2 de 2')).toBeInTheDocument());
    expect(state.review.mock.calls[1][0].requestId).toBe(state.review.mock.calls[0][0].requestId);
    expect(state.reveal).toHaveBeenCalledTimes(1);
  });
  it('uses server activation and lifetime usage even if the cached profile still says approved', async () => {
    state.user.isApproved = true;
    state.readAccess.mockResolvedValue(exhausted);
    const { result } = renderHook(useAccessStatus, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.reason).toBe('trial_exhausted'));
    expect(result.current.canAccess).toBe(false);
    act(() => { qc.setQueryData(['studyAccess', 'student'], { ...exhausted, entitled: true, remaining: null }); });
    await waitFor(() => expect(result.current.reason).toBe('paid'));
    expect(result.current.canAccess).toBe(true);
  });
  it('denies expired accounts even with unused trial quota', async () => {
    state.readAccess.mockResolvedValue({ entitled: false, used: 1, remaining: 9, limit: 10, expired: true });
    const { result } = renderHook(useAccessStatus, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.reason).toBe('expired'));
    expect(result.current.canAccess).toBe(false);
  });
  it('distinguishes an unavailable server from an exhausted trial or expired subscription', async () => {
    state.readAccess.mockRejectedValue(new Error('Serviço indisponível'));
    const { result } = renderHook(useAccessStatus, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.reason).toBe('unavailable'), { timeout: 2500 });
    expect(result.current.isOnTrial).toBe(false);
    expect(result.current.canAccess).toBe(false);
  });
  it('does not repeatedly retry a missing database setup', async () => {
    state.readAccess.mockRejectedValue(new ApiResponseError('Serviço indisponível',503,'study_setup_required'));
    const { result } = renderHook(useAccessStatus, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.reason).toBe('unavailable'));
    expect(state.readAccess).toHaveBeenCalledTimes(1);
  });
});
