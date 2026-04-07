// Ranking.tsx - Página de Ranking

import { useState } from 'react';
import { Trophy, Flame, Award, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { RankingCard } from '@/components/RankingCard';
import { WeeklyChallengeCard } from '@/components/WeeklyChallengeCard';
import { useAuth } from '@/contexts/AuthContext';
import { useRanking, useWeeklyChallenge, useChallengeParticipants } from '@/hooks/useRanking';
import { useUserProductivity } from '@/hooks/useStudyData';

export default function RankingPage() {
  const { user } = useAuth();
  const courseId = user?.courseId ? String(user.courseId) : null;
  const rankingType = courseId ? 'course' : 'general';
  
  const [rankingPeriod, setRankingPeriod] = useState<'weekly' | 'monthly' | 'all'>('weekly');
  
  const { data: ranking = [], isLoading } = useRanking(user?.id, courseId, rankingPeriod, rankingType);
  const { data: challenge } = useWeeklyChallenge(user?.id, courseId);
  const { data: participants = [] } = useChallengeParticipants(challenge?.id, user?.id);
  const { data: todayProd } = useUserProductivity(user?.id);
  
  const [activeTab, setActiveTab] = useState<'ranking' | 'challenge'>('ranking');

  const currentYear = new Date().getFullYear();
  const currentWeek = getWeekNumber(new Date());
  const currentMonth = new Date().getMonth() + 1;
  const daysStudiedThisWeek = 0;

  const periodTitles = {
    weekly: 'Ranking Semanal',
    monthly: 'Ranking Mensal',
    all: 'Ranking Geral'
  };

  const periodDescriptions = {
    weekly: `Semana ${currentWeek} de ${currentYear}`,
    monthly: `${currentMonth}/${currentYear}`,
    all: 'Todo o período'
  };

  const userProgress = {
    questionsDone: todayProd?.questions_answered || 0,
    questionsCorrect: todayProd?.questions_correct || 0,
    flashcardsDone: todayProd?.flashcards_reviewed || 0,
    summariesDone: todayProd?.summaries_read || 0,
    daysStudied: daysStudiedThisWeek,
  };

  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-6 w-6 text-warning" />
              {periodTitles[rankingPeriod]}
            </h1>
            <p className="text-sm text-muted-foreground">
              {periodDescriptions[rankingPeriod]}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-muted/50 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('ranking')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'ranking' 
                ? 'bg-warning text-warning-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Trophy className="h-4 w-4" />
            Ranking
          </button>
          <button
            onClick={() => setActiveTab('challenge')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'challenge' 
                ? 'bg-accent text-accent-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Award className="h-4 w-4" />
            Desafio
          </button>
        </div>

        {activeTab === 'ranking' ? (
          <RankingCard 
            ranking={ranking} 
            currentUserId={user?.id}
            title={periodTitles[rankingPeriod]}
            showPodio={true}
            activePeriod={rankingPeriod}
            onPeriodChange={setRankingPeriod}
          />
        ) : (
          <WeeklyChallengeCard
            challenge={challenge || null}
            participants={participants}
            currentUserId={user?.id}
            userProgress={userProgress}
          />
        )}

        {/* Como funciona */}
        <div className="rounded-xl bg-muted/30 p-4">
          <h3 className="font-bold text-foreground text-sm mb-2">Como funciona a pontuação?</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">Qualidade</span>
              <span>Acertos×10 + Flashcards×8 + Resumos×3 - Erros×5</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-accent">Consistência</span>
              <span>Dias únicos × 3</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-xp">Volume</span>
              <span>Total de atividades × 2</span>
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-muted">
              <span className="font-medium text-warning">Pontuação Final</span>
              <span>Qualidade + Consistência + Volume</span>
            </div>
          </div>
        </div>

        {/* Link para medalhas */}
        <Link 
          to="/medalhas"
          className="flex items-center justify-between rounded-xl bg-warning/10 border border-warning/20 p-4 hover:bg-warning/20 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 text-warning" />
            <div>
              <p className="font-semibold text-foreground">Minhas Conquistas</p>
              <p className="text-xs text-muted-foreground">Veja suas medalhas e badges</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-warning" />
        </Link>
      </div>
    </AppLayout>
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}