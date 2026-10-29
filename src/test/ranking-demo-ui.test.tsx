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
  it.each([7, 87291])('shows course %s as Ranking simulado with 78 samples and no per-profile labels or selector', courseId => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'real', courseId } } as ReturnType<typeof useAuth>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Perfil virtual')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(79);
    expect(screen.getByText('Participante real')).toBeInTheDocument();
    expect(screen.queryByText(/Comparação ilustrativa|Os perfis fictícios/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ranking simulado' })).toBeInTheDocument();

    const profile = createDemoRanking(String(courseId), 'weekly')[0];
    expect(screen.getByRole('img', { name: profile.userName })).toHaveAttribute('src', profile.userAvatar);

    fireEvent.click(screen.getByRole('button', { name: 'Mensal' }));
    expect(screen.getByRole('heading', { name: 'Ranking simulado' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(79);
    expect(screen.getByRole('img', { name: profile.userName })).toHaveAttribute('src', profile.userAvatar);
    fireEvent.click(screen.getByRole('button', { name: 'Geral' }));
    expect(screen.getByRole('heading', { name: 'Ranking simulado' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(79);
    expect(screen.getByRole('img', { name: profile.userName })).toHaveAttribute('src', profile.userAvatar);
  });

  it('keeps sample controls unavailable without a selected course', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'real' } } as ReturnType<typeof useAuth>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ranking simulado' })).not.toBeInTheDocument();
    expect(screen.queryAllByText('Perfil virtual')).toHaveLength(0);
  });

  it('shows a loading state while fetching actual activity, even with the comparison enabled', () => {
    vi.mocked(useRanking).mockReturnValue({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof useRanking>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando ranking');
    expect(screen.queryAllByText('Perfil virtual')).toHaveLength(0);
  });

  it('does not replace a failed real ranking request with sample participants', () => {
    vi.mocked(useRanking).mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useRanking>);
    render(<MemoryRouter><RankingPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o ranking');
    expect(screen.queryAllByText('Perfil virtual')).toHaveLength(0);
  });

  it('uses only Ranking simulado to identify the compact simulated ranking', () => {
    render(<MiniRanking ranking={createDemoRanking('7', 'weekly').slice(0, 5)} />);
    expect(screen.getByText('Ranking simulado')).toBeInTheDocument();
    expect(screen.queryByText('Perfil virtual')).not.toBeInTheDocument();
    for (const profile of createDemoRanking('7', 'weekly').slice(0, 5)) {
      expect(screen.getByText(profile.userName)).toBeInTheDocument();
    }
  });

  it('renders every entry with only the Ranking simulado title when the podium is disabled', () => {
    render(<RankingCard ranking={createDemoRanking('7', 'weekly')} showPodio={false} />);
    expect(screen.getByRole('heading', { name: 'Ranking simulado' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(78);
    expect(screen.queryByText('Perfil virtual')).not.toBeInTheDocument();
    expect(screen.queryByText(/Comparação ilustrativa|Os perfis fictícios/)).not.toBeInTheDocument();
  });
});
