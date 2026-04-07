// WeeklyChallengeCard.tsx - Componente de Desafios Semanais

import { useState } from 'react';
import { Flame, Target, BookOpen, Layers, FileText, Award, Calendar, CheckCircle2, Clock, Users, Gift } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WeeklyChallenge, ChallengeParticipant, calculateFinalScore } from '@/hooks/useRanking';

interface WeeklyChallengeCardProps {
  challenge: WeeklyChallenge | null;
  participants: ChallengeParticipant[];
  currentUserId?: string;
  userProgress?: {
    questionsDone: number;
    questionsCorrect: number;
    flashcardsDone: number;
    summariesDone: number;
    daysStudied: number;
  };
  onJoin?: () => void;
}

export function WeeklyChallengeCard({ 
  challenge, 
  participants, 
  currentUserId,
  userProgress,
  onJoin 
}: WeeklyChallengeCardProps) {
  const currentUser = participants.find(p => p.userId === currentUserId);
  const podium = participants.slice(0, 3);

  if (!challenge) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5 border border-accent/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="h-5 w-5 text-accent" />
          <h3 className="font-bold text-foreground">Desafio da Semana</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Nenhum desafio ativo nesta semana.
        </p>
      </div>
    );
  }

  const progressPercent = userProgress 
    ? Math.min(100, Math.round((
      (userProgress.questionsDone / challenge.targetQuestions) * 50 +
      (userProgress.flashcardsDone / challenge.targetFlashcards) * 30 +
      (userProgress.summariesDone / challenge.targetSummaries) * 20
    )))
    : 0;

  const accuracy = userProgress && userProgress.questionsDone > 0
    ? Math.round((userProgress.questionsCorrect / userProgress.questionsDone) * 100)
    : 0;

  const isCompleted = progressPercent >= 100 && accuracy >= challenge.minAccuracy;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5 border border-accent/20 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-accent/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-accent" />
            <h3 className="font-bold text-foreground">{challenge.title}</h3>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Semana {challenge.weekNumber}</span>
          </div>
        </div>
        {challenge.description && (
          <p className="text-xs text-muted-foreground">{challenge.description}</p>
        )}
      </div>

      {/* Metas */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-primary/10">
            <BookOpen className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-xs font-bold text-primary">{userProgress?.questionsDone || 0}/{challenge.targetQuestions}</p>
            <p className="text-[10px] text-muted-foreground">Questões</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-accent/10">
            <Layers className="h-4 w-4 text-accent mx-auto mb-1" />
            <p className="text-xs font-bold text-accent">{userProgress?.flashcardsDone || 0}/{challenge.targetFlashcards}</p>
            <p className="text-[10px] text-muted-foreground">Flashcards</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-xp/10">
            <FileText className="h-4 w-4 text-xp mx-auto mb-1" />
            <p className="text-xs font-bold text-xp">{userProgress?.summariesDone || 0}/{challenge.targetSummaries}</p>
            <p className="text-[10px] text-muted-foreground">Resumos</p>
          </div>
        </div>

        {/* Progresso geral */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium text-accent">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2 bg-muted [&>div]:bg-accent" />
        </div>

        {/* Acurácia */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Acurácia mínima: {challenge.minAccuracy}%</span>
          <span className={cn(
            "font-bold",
            accuracy >= challenge.minAccuracy ? "text-success" : "text-warning"
          )}>
            {accuracy}%
          </span>
        </div>

        {isCompleted && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 text-success text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Desafio concluído!</span>
          </div>
        )}
      </div>

      {/* Participantes / Podio */}
      {participants.length > 0 && (
        <div className="p-4 border-t border-accent/20 bg-accent/5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Top 3</span>
          </div>

          <div className="flex items-end justify-center gap-3">
            {podium[1] && (
              <div className="flex flex-col items-center">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-accent/20 text-accent">
                    {podium[1].userId.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium mt-1">2º</span>
              </div>
            )}
            {podium[0] && (
              <div className="flex flex-col items-center -mb-1">
                <Award className="h-6 w-6 text-yellow-500" />
                <Avatar className="h-10 w-10 ring-2 ring-yellow-500">
                  <AvatarFallback className="text-sm bg-accent text-accent-foreground">
                    {podium[0].userId.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-bold mt-1">1º</span>
              </div>
            )}
            {podium[2] && (
              <div className="flex flex-col items-center">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-accent/20 text-accent">
                    {podium[2].userId.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium mt-1">3º</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sua posição */}
      {currentUser && (
        <div className="p-3 border-t border-accent/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Sua posição: #{currentUser.rankPosition}</span>
            </div>
            <span className="text-sm font-bold text-primary">{currentUser.weeklyScore} pts</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Badge de conquista
interface BadgeProps {
  name: string;
  icon: string;
  earned: boolean;
}

export function ChallengeBadge({ name, icon, earned }: BadgeProps) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded-full text-xs",
      earned ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"
    )}>
      <span>{icon}</span>
      <span>{name}</span>
    </div>
  );
}

// Lista de badges disponíveis
export const CHALLENGE_BADGES = [
  { id: 'consistent', name: 'Consistente', icon: '🔥', description: 'Estudou todos os dias' },
  { id: 'precision', name: 'Precisão', icon: '🎯', description: 'Acurácia >= 90%' },
  { id: 'marathon', name: 'Maratonista', icon: '🏃', description: '50+ questões na semana' },
  { id: 'reviewer', name: 'Revisor', icon: '📚', description: '30+ flashcards revisados' },
  { id: 'reader', name: 'Leitor', icon: '📖', description: '5+ resumos lidos' },
  { id: 'champion', name: 'Campeão', icon: '🏆', description: '1º lugar no ranking' },
];