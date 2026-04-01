import { useEffect, useMemo } from "react";
import { Target, Play, Clock, BookOpen, Layers, FileText, CheckCircle, Sparkles, Check, Trophy, Calendar, TrendingUp, Flame } from "lucide-react";
import { DailyMission, MissionProgress, MissionStep } from "@/hooks/useMission";

interface NextMissionCardProps {
  mission: DailyMission | null;
  isLoading?: boolean;
  progress: MissionProgress;
  nextStep: MissionStep;
  isCompleted: boolean;
  hasStarted: boolean;
  onStart: () => void;
  streakDays?: number;
  totalDays?: number;
}

interface StepItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  stepProgress: MissionProgress;
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
}

function StepItem({ icon, title, description, stepProgress, isActive, isCompleted, onClick }: StepItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={isCompleted}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
        isCompleted
          ? 'bg-success/10 border-success/30 opacity-70'
          : isActive
          ? 'bg-background/80 border-primary/50 hover:bg-background hover:border-primary'
          : 'bg-background/40 border-border/50 opacity-50'
      }`}
    >
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg border ${
        isCompleted
          ? 'bg-success/20 border-success/40 text-success'
          : isActive
          ? 'bg-primary/20 border-primary/40 text-primary'
          : 'bg-muted border-border text-muted-foreground'
      }`}>
        {isCompleted ? <Check className="h-5 w-5" /> : icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className={`text-sm font-medium ${isCompleted ? 'text-success' : 'text-foreground'}`}>
            {title}
          </p>
          <span className={`text-xs ${isCompleted ? 'text-success' : 'text-muted-foreground'}`}>
            {stepProgress.completed}/{stepProgress.total}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              isCompleted ? 'bg-success' : 'bg-primary'
            }`}
            style={{ width: `${stepProgress.percentage}%` }}
          />
        </div>
      </div>
    </button>
  );
}

// Mensagens motivacionais variadas por dia da semana
const MOTIVATIONAL_MESSAGES = [
  {
    dayOfWeek: 0, // Domingo
    messages: [
      "Seu esforço de hoje constrói o sucesso de amanhã!",
      "Cada minuto de estudo conta na jornada da aprovação!",
      "Domingo de estudo é sinal de determinação!",
    ],
  },
  {
    dayOfWeek: 1, // Segunda
    messages: [
      "Comece a semana com o pé direito - missão cumprida!",
      "Segunda-feira vencedora! Continue assim!",
      "Você já provou que merece essa aprovação!",
    ],
  },
  {
    dayOfWeek: 2, // Terça
    messages: [
      "Terça-feira de vitória! Seu comprometimento é admirável!",
      "Cada questão respondida te aproxima do objetivo!",
      "A persistência é a chave do sucesso!",
    ],
  },
  {
    dayOfWeek: 3, // Quarta
    messages: [
      "Metade da semana e você já está vencendo!",
      "Quarta-feira de conquistador! Parabéns!",
      "Seu esforço de hoje é o prêmio de amanhã!",
    ],
  },
  {
    dayOfWeek: 4, // Quinta
    messages: [
      "Quase lá! Sua dedicação está dando frutos!",
      "Quinta-feira de guerreiro! Continue firme!",
      "Você está mais perto do que imagina!",
    ],
  },
  {
    dayOfWeek: 5, // Sexta
    messages: [
      "Sextou com missão cumprida! O fim de semana agradece!",
      "Sexta-feira de celebração! Você merece!",
      "Que tal descansar sabendo que você venceu hoje?",
    ],
  },
  {
    dayOfWeek: 6, // Sábado
    messages: [
      "Sábado de vitória! Seu futuro está sendo construído!",
      "Enquanto outros descansam, você conquista!",
      "Fim de semana começando com moral alta!",
    ],
  },
];

function getMotivationalMessage(): string {
  const dayOfWeek = new Date().getDay();
  const dayConfig = MOTIVATIONAL_MESSAGES.find(m => m.dayOfWeek === dayOfWeek);
  const messages = dayConfig?.messages || MOTIVATIONAL_MESSAGES[0].messages;
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

export function NextMissionCard({
  mission,
  isLoading,
  progress,
  nextStep,
  isCompleted,
  hasStarted,
  onStart,
  streakDays = 0,
  totalDays = 0,
}: NextMissionCardProps) {
  // Garantir que tenha missão ao carregar
  useEffect(() => {
    if (!isLoading && !mission) {
      onStart();
    }
  }, [isLoading, mission, onStart]);

  const motivationalMessage = useMemo(() => getMotivationalMessage(), []);

  // Estado: Carregando
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-5 shadow-lg shadow-primary/5">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-5 w-5 text-primary" />
            <div className="h-6 w-32 bg-muted/50 rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-16 bg-muted/30 rounded-xl animate-pulse" />
          <div className="h-16 bg-muted/30 rounded-xl animate-pulse" />
          <div className="h-16 bg-muted/30 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Verificar se a missão é do dia atual
  const today = new Date().toISOString().split('T')[0];
  const isMissionToday = mission?.mission_date === today;

  // Calcular se todas as etapas estão completas
  const allStepsCompleted = mission
    ? mission.questions_completed >= (mission.questions_count || 0) &&
      mission.flashcards_completed >= (mission.flashcards_count || 0) &&
      mission.summary_completed >= (mission.summary_count || 0)
    : false;

  // Estado: Missão Concluída - Mostrar mensagem motivacional
  // Verifica se é do dia atual E (status completed OU todas as etapas feitas)
  const showCompleted = isMissionToday && mission && (isCompleted || allStepsCompleted);

  if (showCompleted) {
    const completedTime = mission.completed_at 
      ? new Date(mission.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <div className="rounded-2xl bg-gradient-to-br from-success/15 to-success/5 border border-success/20 p-5 shadow-lg shadow-success/5">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-5 w-5 text-success" />
            <h3 className="font-bold text-foreground text-lg">Missão Cumprida!</h3>
          </div>
          <p className="text-sm text-muted-foreground ml-7">Parabéns pelo esforço de hoje!</p>
        </div>

        <div className="text-center py-4">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
                <Trophy className="h-10 w-10 text-success" />
              </div>
              <Sparkles className="h-6 w-6 text-yellow-400 absolute -top-1 -right-1 animate-pulse" />
            </div>
          </div>
          
          <p className="text-base font-medium text-foreground mb-2">
            "{motivationalMessage}"
          </p>
          
          <p className="text-sm text-muted-foreground mb-3">
            Excelente trabalho. Sua missão de hoje foi concluída.
          </p>
          
          {completedTime && (
            <p className="text-xs text-muted-foreground">
              Concluída às {completedTime}
            </p>
          )}
          
          {/* Info de sequência */}
          {streakDays > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex justify-center gap-6 text-xs">
                <div className="flex items-center gap-1 text-accent">
                  <Flame className="h-4 w-4" />
                  <span className="font-semibold">{streakDays} dias seguidos</span>
                </div>
                {totalDays > 0 && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{totalDays} dias no total</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Volte amanhã para uma nova missão
            </p>
            <div className="mt-2 flex justify-center gap-1">
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    i === new Date().getDay() 
                      ? 'bg-primary' 
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calcular progresso de cada etapa
  const questionsProgress: MissionProgress = {
    total: mission?.questions_count || 0,
    completed: mission?.questions_completed || 0,
    percentage: mission?.questions_count 
      ? Math.round(((mission?.questions_completed || 0) / mission.questions_count) * 100) 
      : 0,
    remaining: (mission?.questions_count || 0) - (mission?.questions_completed || 0),
  };

  const flashcardsProgress: MissionProgress = {
    total: mission?.flashcards_count || 0,
    completed: mission?.flashcards_completed || 0,
    percentage: mission?.flashcards_count 
      ? Math.round(((mission?.flashcards_completed || 0) / mission.flashcards_count) * 100) 
      : 0,
    remaining: (mission?.flashcards_count || 0) - (mission?.flashcards_completed || 0),
  };

  const summaryProgress: MissionProgress = {
    total: mission?.summary_count || 0,
    completed: mission?.summary_completed || 0,
    percentage: mission?.summary_count 
      ? Math.round(((mission?.summary_completed || 0) / mission.summary_count) * 100) 
      : 0,
    remaining: (mission?.summary_count || 0) - (mission?.summary_completed || 0),
  };

  const questionsDone = questionsProgress.completed >= questionsProgress.total;
  const flashcardsDone = flashcardsProgress.completed >= flashcardsProgress.total;
  const summaryDone = summaryProgress.completed >= summaryProgress.total;

  // Estado: Missão Pendente/Em Progresso (só mostra se não estiver completa)
  if (!showCompleted && mission) {
    return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-5 shadow-lg shadow-primary/5">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground text-lg">Próxima Missão</h3>
        </div>
        <p className="text-sm text-muted-foreground ml-7">
          {hasStarted ? `Progresso: ${progress.completed}/${progress.total}` : 'Sua melhor ação agora'}
        </p>
      </div>

      {/* Barra de progresso geral */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Progresso total</span>
          <span>{progress.percentage}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Etapas da missão */}
      <div className="space-y-2.5 mb-5">
        <StepItem
          icon={<BookOpen className="h-5 w-5" />}
          title="Questões"
          description={questionsDone ? 'Concluído!' : nextStep === 'questions' ? 'Em andamento' : 'A fazer'}
          stepProgress={questionsProgress}
          isActive={nextStep === 'questions' && !questionsDone}
          isCompleted={questionsDone}
          onClick={() => window.location.href = '/questoes'}
        />

        <StepItem
          icon={<Layers className="h-5 w-5" />}
          title="Flashcards"
          description={flashcardsDone ? 'Concluído!' : nextStep === 'flashcards' ? 'Em andamento' : 'A fazer'}
          stepProgress={flashcardsProgress}
          isActive={nextStep === 'flashcards' && !flashcardsDone}
          isCompleted={flashcardsDone}
          onClick={() => window.location.href = '/flashcards'}
        />

        <StepItem
          icon={<FileText className="h-5 w-5" />}
          title="Resumo"
          description={summaryDone ? 'Concluído!' : nextStep === 'summary' ? 'Em andamento' : 'A fazer'}
          stepProgress={summaryProgress}
          isActive={nextStep === 'summary' && !summaryDone}
          isCompleted={summaryDone}
          onClick={() => window.location.href = '/resumos'}
        />
      </div>

      {/* Rodapé */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span className="text-sm">
            {progress.remaining > 0 
              ? `${progress.remaining} itens restantes`
              : 'Missão completa!'
            }
          </span>
        </div>
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.97] transition-all shadow-lg shadow-primary/20"
        >
          <Play className="h-4 w-4" fill="currentColor" />
          {nextStep === 'questions' ? 'Iniciar Questões' : 
           nextStep === 'flashcards' ? 'Continuar Flashcards' :
           nextStep === 'summary' ? 'Ler Resumo' : 'Concluir'}
        </button>
      </div>
    </div>
    );
  }

  // Estado: Sem missão (criar nova)
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-5 shadow-lg shadow-primary/5">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground text-lg">Nova Missão</h3>
        </div>
      </div>
      <div className="text-center py-6">
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.97] transition-all shadow-lg shadow-primary/20 mx-auto"
        >
          <Play className="h-4 w-4" fill="currentColor" />
          Iniciar Missão de Hoje
        </button>
      </div>
    </div>
  );
}
