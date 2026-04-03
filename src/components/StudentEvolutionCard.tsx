// StudentEvolutionCard.tsx - Card de Evolução do Aluno para a página inicial

import { useState, useMemo } from "react";
import { Target, Calendar, BookOpen, Layers, FileText, TrendingUp, Award, Edit2, Check, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { StudentEvolution, getDailyMotivationalPhrase, useUpdateExamDate } from "@/hooks/useStudentEvolution";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface StudentEvolutionCardProps {
  evolution: StudentEvolution | undefined;
  isLoading?: boolean;
}

export function StudentEvolutionCard({ evolution, isLoading }: StudentEvolutionCardProps) {
  const dailyPhrase = useMemo(() => getDailyMotivationalPhrase(), []);
  const { user } = useAuth();
  const updateExamDate = useUpdateExamDate();
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");

  const handleSaveDate = () => {
    if (!user?.id || !dateInput) return;
    updateExamDate.mutate(
      { userId: user.id, examDate: dateInput },
      {
        onSuccess: () => {
          toast.success("Data da prova salva com sucesso!");
          setIsEditingDate(false);
        },
        onError: () => {
          toast.error("Erro ao salvar a data da prova.");
        },
      }
    );
  };

  const handleClearDate = () => {
    if (!user?.id) return;
    updateExamDate.mutate(
      { userId: user.id, examDate: null },
      {
        onSuccess: () => {
          toast.success("Data da prova removida.");
          setIsEditingDate(false);
          setDateInput("");
        },
      }
    );
  };

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
        
        {/* Exam date section - mesmo sem dados */}
        <div className="mb-4 p-3 rounded-xl bg-card/80 border border-border">
          {isEditingDate ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Informe a data da sua prova:</p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="flex-1 text-sm rounded-lg border border-border bg-background px-3 py-1.5 text-foreground"
                />
                <button onClick={handleSaveDate} disabled={!dateInput || updateExamDate.isPending} className="p-1.5 rounded-lg bg-success/20 text-success hover:bg-success/30">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setIsEditingDate(false)} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : evolution?.examDate ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {evolution.examPassed ? (
                  <span className="text-sm font-medium text-destructive">A data da prova já passou</span>
                ) : evolution.daysUntilExam !== null && evolution.daysUntilExam > 0 ? (
                  <span className="text-sm text-muted-foreground">Prova em:</span>
                ) : (
                  <span className="text-sm font-medium text-warning">Prova é hoje! Boa sorte!</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!evolution.examPassed && evolution.daysUntilExam !== null && evolution.daysUntilExam > 0 && (
                  <div className="text-right">
                    <span className="text-lg font-bold text-primary">{evolution.daysUntilExam} dias</span>
                    <span className="text-xs text-muted-foreground ml-1">({evolution.examDateFormatted})</span>
                  </div>
                )}
                <button onClick={() => { setDateInput(evolution.examDate || ""); setIsEditingDate(true); }} className="p-1 text-muted-foreground hover:text-primary">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingDate(true)}
              className="w-full flex items-center gap-3 text-left group"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary group-hover:underline">Cadastre a data da sua prova</p>
                <p className="text-[10px] text-muted-foreground">Acompanhe seu progresso até a aprovação!</p>
              </div>
            </button>
          )}
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

      {/* Contagem regressiva / Data da Prova */}
      <div className="mb-4 p-3 rounded-xl bg-card/80 border border-border">
        {isEditingDate ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Informe a data da sua prova:</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="flex-1 text-sm rounded-lg border border-border bg-background px-3 py-1.5 text-foreground"
              />
              <button onClick={handleSaveDate} disabled={!dateInput || updateExamDate.isPending} className="p-1.5 rounded-lg bg-success/20 text-success hover:bg-success/30">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => setIsEditingDate(false)} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">
                <X className="h-4 w-4" />
              </button>
              {evolution.examDate && (
                <button onClick={handleClearDate} className="text-[10px] text-destructive hover:underline">Remover</button>
              )}
            </div>
          </div>
        ) : evolution.examDate ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {evolution.examPassed ? (
                <span className="text-sm font-medium text-destructive">A data da prova já passou</span>
              ) : evolution.daysUntilExam !== null && evolution.daysUntilExam > 0 ? (
                <span className="text-sm text-muted-foreground">Prova em:</span>
              ) : (
                <span className="text-sm font-medium text-warning">Prova é hoje! Boa sorte!</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!evolution.examPassed && evolution.daysUntilExam !== null && evolution.daysUntilExam > 0 && (
                <div className="text-right">
                  <span className="text-lg font-bold text-primary">{evolution.daysUntilExam} dias</span>
                  <span className="text-xs text-muted-foreground ml-1">({evolution.examDateFormatted})</span>
                </div>
              )}
              <button onClick={() => { setDateInput(evolution.examDate || ""); setIsEditingDate(true); }} className="p-1 text-muted-foreground hover:text-primary">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsEditingDate(true)}
            className="w-full flex items-center gap-3 text-left group"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary group-hover:underline">Cadastre a data da sua prova</p>
              <p className="text-[10px] text-muted-foreground">Acompanhe seu progresso até a aprovação!</p>
            </div>
          </button>
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
