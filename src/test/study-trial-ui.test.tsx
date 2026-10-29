import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuestoesPage from '@/pages/Questoes';
import FlashcardsPage from '@/pages/Flashcards';
import { useAccessStatus } from '@/hooks/useAccessStatus';
import type { StudyFeedback } from '@/services/studyAccessService';
import type { Question } from '@/types/study';

const state = vi.hoisted(() => ({ user: { id: 'student', courseId: 1, role: 'student', isApproved: false },
  answer: vi.fn(), reveal: vi.fn(), readAccess: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, isAdmin: false, loading: false }) }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/services/studyAccessService', () => ({
  getStudyAccess: () => state.readAccess(),
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
  useRecordFlashcardReview: () => ({ mutate: vi.fn() }),
  useRecordAnswer: () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (args: unknown) => state.answer(args) as Promise<StudyFeedback>,
      onSuccess: data => { qc.setQueryData(['studyAccess', 'student'], data); } });
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
});
afterEach(() => { cleanup(); qc.clear(); });

describe('lifetime trial interface', () => {
  it('keeps the complete catalog selectable even after the lifetime trial is exhausted', async () => {
    state.readAccess.mockResolvedValue(exhausted);
    render(<QuestoesPage />, { wrapper: Wrapper });
    questionCatalog();
    expect(screen.getByRole('button', { name: /Constituição 12 qsts/ })).toBeInTheDocument();
    await waitFor(() => expect(qc.getQueryData(['studyAccess', 'student'])).toEqual(exhausted));
    expect(screen.queryByText('Seu teste gratuito acabou')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Constituição/ }));
    expect(screen.getByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(state.answer).not.toHaveBeenCalled();
  });
  it('shows the tenth question correction and blocks only when advancing', async () => {
    render(<QuestoesPage />, { wrapper: Wrapper });
    questionCatalog();
    fireEvent.click(screen.getByRole('button', { name: /Constituição/ }));
    fireEvent.click(screen.getByRole('button', { name: /Alternativa A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }));
    expect(await screen.findByText('Correção da décima questão')).toBeInTheDocument();
    expect(screen.queryByText('Seu teste gratuito acabou')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(screen.getByText('Seu teste gratuito acabou')).toBeInTheDocument();
    expect(state.answer).toHaveBeenCalledTimes(1);
  });
  it('keeps the tenth flashcard back visible, then blocks the next reveal', async () => {
    render(<FlashcardsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Direito/ }));
    fireEvent.click(screen.getByRole('button', { name: /Constituição/ }));
    fireEvent.click(screen.getByRole('button', { name: /Revelar Resposta/ }));
    expect(await screen.findByText('Verso da décima utilização')).toBeInTheDocument();
    expect(screen.queryByText('Seu teste gratuito acabou')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bom' }));
    expect(screen.getByText('Seu teste gratuito acabou')).toBeInTheDocument();
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
});
