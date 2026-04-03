// StudentEvolutionCard.tsx - Card de Evolução do Aluno para a página inicial

import { useMemo } from "react";
import { Target, Calendar, BookOpen, Layers, FileText, TrendingUp, Award } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { StudentEvolution, getDailyMotivationalPhrase } from "@/hooks/useStudentEvolution";

interface StudentEvolutionCardProps {
  evolution: StudentEvolution | undefined;
  isLoading?: boolean;
}

export function StudentEvolutionCard({ evolution, isLoading }: StudentEvolutionCardProps) {
  const dailyPhrase = useMemo(() => getDailyMotivationalPhrase(), []);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-5 shadow-lg shadow-primary/5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <div className="h-6 w-32 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-muted/30 rounded-xl animate-pulse" />
          <div className="h-16 bg-muted/30 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Se não tem evolução ou dados básicos, mostrar estado vazio
  const hasData = evolution && (evolution.questionsTotal > 0 || evolution.flashcardsTotal > 0 || evolution.summariesTotal > 0);
  
  if (!evolution || !hasData) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-5 shadow-lg shadow-primary/5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground text-lg">Sua Jornada</h3>
        </div>
        
        <div className="p-3 rounded-xl bg-card/80 border border-border mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Data da prova não cadastrada</span>
          </div>
        </div>

        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">Continue estudando para acompanhar sua evolução!</p>
        </div>

        <div className="pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground italic text-center">"{dailyPhrase}"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-5 shadow-lg shadow-primary/5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground text-lg">Sua Jornada</h3>
      </div>

      {/* Contagem regressiva */}
      <div className="mb-4 p-3 rounded-xl bg-card/80 border border-border">
        {evolution.examDate ? (
          evolution.examPassed ? (
            <div className="flex items-center gap-2 text-destructive">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">A data da prova já passou</span>
            </div>
          ) : evolution.daysUntilExam !== null && evolution.daysUntilExam > 0 ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Prova em {evolution.examDate}:</span>
              </div>
              <span className="text-lg font-bold text-primary">{evolution.daysUntilExam} dias</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-warning">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">Prova é hoje! Boa sorte!</span>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Data da prova não cadastrada</span>
          </div>
        )}
      </div>

      {/* Progresso geral */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">Progresso Geral</span>
          <span className="font-medium text-primary text-lg">
            {evolution.overallPercent}%
          </span>
        </div>
        <Progress value={evolution.overallPercent} className="h-2 bg-muted [&>div]:bg-primary" />
        
        {/* Totais disponíveis */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="text-center p-2 rounded-lg bg-primary/5 border border-primary/10">
            <BookOpen className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-xs font-bold text-primary">{evolution.questionsDone} <span className="font-normal text-muted-foreground">/ {evolution.questionsTotal}</span></p>
            <p className="text-[10px] text-muted-foreground">Questões</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-accent/5 border border-accent/10">
            <Layers className="h-4 w-4 text-accent mx-auto mb-1" />
            <p className="text-xs font-bold text-accent">{evolution.flashcardsDone} <span className="font-normal text-muted-foreground">/ {evolution.flashcardsTotal}</span></p>
            <p className="text-[10px] text-muted-foreground">Cards</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-xp/5 border border-xp/10">
            <FileText className="h-4 w-4 text-xp mx-auto mb-1" />
            <p className="text-xs font-bold text-xp">{evolution.summariesDone} <span className="font-normal text-muted-foreground">/ {evolution.summariesTotal}</span></p>
            <p className="text-[10px] text-muted-foreground">Resumos</p>
          </div>
        </div>
      </div>

      {/* Frase motivacional */}
      <div className="pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground italic text-center">"{dailyPhrase}"</p>
      </div>
    </div>
  );
}
