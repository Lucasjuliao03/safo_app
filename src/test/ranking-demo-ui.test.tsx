import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RankingPage from '@/pages/Ranking';
import { MiniRanking, RankingCard } from '@/components/RankingCard';
import { createDemoRanking } from '@/lib/rankingDemo';
import { useAuth } from '@/contexts/AuthContext';
import { useRanking } from '@/hooks/useRanking';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useRanking', () => ({
  useRanking: vi.fn(),
  useWeeklyChallenge: () => ({ data: null }),
  useChallengeParticipants: () => ({ data: [] }),
}));
vi.mock('@/hooks/useStudyData', () => ({ useUserProductivity: () => ({ data: null }) }));
vi.mock('@/hooks/useAvatar', () => ({ getAvatarUrl: () => '/avatar/default.svg' }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/WeeklyChallengeCard', () => ({ WeeklyChallengeCard: () => <div>Desafio</div> }));

const realParticipant = {
  ...createDemoRanking('7', 'weekly')[0],
  userId: 'real', userName: 'Participante real', isDemo: false, position: 1,
};

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'real', courseId: 7 } } as ReturnType<typeof useAuth>);
  vi.mocked(useRanking).mockReturnValue({
    data: [realParticipant], isLoading: false, isError: false,
  } as ReturnType<typeof useRanking>);
});
afterEach(cleanup);

describe('transparent ranking comparison', () => {
  it.each([7, 87291])('shows 78 labelled samples by default for existing or new course %s, with an option to hide them', courseId => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'real', courseId } } as ReturnType<typeof useAuth>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    const toggle = screen.getByRole('switch', { name: 'Comparar com 78 perfis de demonstração' });
    expect(toggle).toBeChecked();
    expect(screen.getAllByText('Demonstração')).toHaveLength(78);
    expect(screen.getByText('Participante real')).toBeInTheDocument();
    expect(screen.getByText(/1 participante real nesta lista e 78 perfis de demonstração/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comparação com demonstração' })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.queryAllByText('Demonstração')).toHaveLength(0);

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getAllByText('Demonstração')).toHaveLength(78);

    fireEvent.click(screen.getByRole('button', { name: 'Mensal' }));
    expect(screen.getAllByText('Demonstração')).toHaveLength(78);
    fireEvent.click(toggle);
    expect(screen.queryAllByText('Demonstração')).toHaveLength(0);
    expect(screen.getAllByRole('heading', { name: 'Ranking Mensal' })).toHaveLength(2);
  });

  it('keeps sample controls unavailable without a selected course', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'real' } } as ReturnType<typeof useAuth>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Demonstração')).toHaveLength(0);
  });

  it('shows a loading state while fetching actual activity, even with the comparison enabled', () => {
    vi.mocked(useRanking).mockReturnValue({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof useRanking>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando ranking');
    expect(screen.queryAllByText('Demonstração')).toHaveLength(0);
  });

  it('does not replace a failed real ranking request with sample participants', () => {
    vi.mocked(useRanking).mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useRanking>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o ranking');
    expect(screen.queryAllByText('Demonstração')).toHaveLength(0);
  });

  it('identifies samples in the compact ranking too', () => {
    render(<MiniRanking ranking={createDemoRanking('7', 'weekly').slice(0, 5)} />);
    expect(screen.getAllByText('Demonstração')).toHaveLength(5);
  });

  it('renders every entry with labels when the podium is disabled', () => {
    render(<RankingCard ranking={createDemoRanking('7', 'weekly')} showPodio={false} />);
    expect(screen.getAllByText('Demonstração')).toHaveLength(78);
  });
});
