import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Question } from "@/types/study";
import { CheckCircle2, XCircle, ChevronRight, Filter, BookOpen, BookOpenIcon, Sparkles, Building2, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { isUserActive } from "@/services/accessService";
import { useSubjects, useQuestions, useRecordAnswer, useTopics, useUserQuestionStats, SUBJECT_UI_MAP, useActiveLawIdsForCourse } from "@/hooks/useStudyData";
import { useMemo } from "react";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { StudyLoadError } from "@/components/StudyLoadError";
import { useStudyAccess } from '@/hooks/useStudyAccess';
import { isStudyLimitError, type StudyFeedback } from '@/services/studyAccessService';
import { toast } from 'sonner';

function QuestionCard({ question, subjectName, subjectIcon: SubjectIcon, onNext, onAnswer }: {
  question: Question;
  subjectName?: string;
  subjectIcon?: React.ComponentType<{ className?: string }>;
  onNext: () => void;
  onAnswer: (selectedOption: string, requestId: string) => Promise<StudyFeedback>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState<StudyFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const isCorrect = feedback?.isCorrect === true;

  const handleConfirm = async () => {
    if (!selected || submitting || confirmed) return;
    setSubmitting(true);
    try {
      const response = await onAnswer(selected, requestId);
      setFeedback(response);
      setConfirmed(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível confirmar sua resposta.');
    } finally { setSubmitting(false); }
  };

  const handleNext = () => {
    setSelected(null);
    setConfirmed(false);
    setFeedback(null);
    onNext();
  };

  const difficultyColor = {
    fácil: "bg-success/15 text-success border-success/20",
    média: "bg-warning/15 text-warning border-warning/20",
    difícil: "bg-destructive/15 text-destructive border-destructive/20",
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
          {SubjectIcon && <SubjectIcon className="h-3.5 w-3.5 inline mr-1" />}
          {subjectName}
        </Badge>
        <Badge variant="outline" className={cn("text-xs", difficultyColor[question.difficulty])}>
          {question.difficulty}
        </Badge>
        <Badge variant="outline" className="text-xs border-border text-muted-foreground">
          {question.board} · {question.year}
        </Badge>
        {question.lawReferenceName && (
          <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400 bg-violet-500/5">
            ⚖️ {question.lawReferenceName}
          </Badge>
        )}
      </div>

      <div className="rounded-2xl bg-card border border-border p-4">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{question.statement}</p>
      </div>

      <div className="space-y-2">
        {question.options.map((opt, index) => {
          const letter = question.format === 'true_false' ? opt.id.toUpperCase() : ['A', 'B', 'C', 'D', 'E'][index] || '?';
          const isSelected = selected === opt.id;
          const isRight = opt.id === feedback?.correctOption;
          let optStyle = "bg-card border-border hover:border-primary/40";
          if (confirmed) {
            if (isRight) optStyle = "bg-success/10 border-success/40";
            else if (isSelected && !isRight) optStyle = "bg-destructive/10 border-destructive/40";
            else optStyle = "bg-card border-border opacity-50";
          } else if (isSelected) {
            optStyle = "bg-primary/10 border-primary/50 ring-1 ring-primary/30";
          }

          return (
            <button key={opt.id} onClick={() => !confirmed && setSelected(opt.id)} disabled={confirmed}
              className={cn("w-full flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all active:scale-[0.98]", optStyle)}>
              <span className={cn("flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold",
                confirmed && isRight ? "bg-success text-success-foreground" :
                confirmed && isSelected && !isRight ? "bg-destructive text-destructive-foreground" :
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {confirmed && isRight ? <CheckCircle2 className="h-4 w-4" /> :
                 confirmed && isSelected && !isRight ? <XCircle className="h-4 w-4" /> : letter}
              </span>
              <span className="text-sm text-foreground leading-relaxed flex-1 whitespace-pre-wrap text-left">{opt.text}</span>
            </button>
          );
        })}
      </div>

      {!confirmed ? (
        <button onClick={handleConfirm} disabled={!selected || submitting}
          className={cn("w-full rounded-xl py-3.5 font-semibold text-sm transition-all",
            selected ? "bg-primary text-primary-foreground active:scale-[0.98]" : "bg-muted text-muted-foreground cursor-not-allowed"
          )}>
          {submitting ? 'Confirmando...' : 'Confirmar Resposta'}
        </button>
      ) : (
        <div className="space-y-3 animate-slide-up">
          <div className={cn("rounded-xl p-4 border", isCorrect ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30")}>
            <div className="flex items-center gap-2 mb-2">
              {isCorrect ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
              <span className={cn("font-bold text-sm", isCorrect ? "text-success" : "text-destructive")}>
                {isCorrect ? "Resposta Correta!" : "Resposta Incorreta"}
              </span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{feedback?.explanation}</p>
          </div>
          <button onClick={handleNext}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-semibold text-sm text-primary-foreground active:scale-[0.98] transition-all">
            Próxima Questão <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function QuestoesPage() {
  const { user, isAdmin } = useAuth();
  const courseId = user?.courseId ? String(user.courseId) : null;
  const courseIdNum = user?.courseId ? Number(user.courseId) : null;
  const editalIdNum = user?.editalId ? Number(user.editalId) : null;
  
  // Busca as leis ativas do edital do aluno (ou o mais recente do curso)
  const { data: activeLawIds } = useActiveLawIdsForCourse(
    isAdmin ? null : courseIdNum,
    isAdmin ? null : editalIdNum
  );
  
  const { data: subjects = [], isLoading: loadingSub, error: subjectsError } = useSubjects(isAdmin ? undefined : courseId);
  const { data: topics = [], isLoading: loadingTop, error: topicsError } = useTopics(isAdmin ? undefined : courseId);
  // Passa activeLawIds para filtrar questoes do edital do usuario
  const { data: questions = [], isLoading: loadingQ, error: questionsError } = useQuestions(
    isAdmin ? undefined : courseId,
    isAdmin ? null : activeLawIds
  );
  const { data: qStats = [], isLoading: loadingStats } = useUserQuestionStats(user?.id);
  const recordAnswer = useRecordAnswer();
  const { data: access, error: accessError } = useStudyAccess();
  const [serverBlocked, setServerBlocked] = useState(false);
  const [answeredCurrent, setAnsweredCurrent] = useState(false);

  const [selectedFormat, setSelectedFormat] = useState<"multiple_choice" | "true_false" | null>(null);
  const [selectedSource, setSelectedSource] = useState<"all" | "ia" | "banca" | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionQueue, setSessionQueue] = useState<typeof questions>([]);
  const [isFinished, setIsFinished] = useState(false);

  // Filter questions by format and source
  const sourceFilteredQuestions = questions.filter(q => {
    if (selectedFormat === "true_false") {
      return q.format === "true_false";
    }
    if (q.format === "true_false") return false; // multiple_choice selecionado
    if (selectedSource === "all") return true;
    if (selectedSource === "ia") return q.organ === "IA";
    if (selectedSource === "banca") return q.organ !== "IA";
    return true;
  });

  // Mostrar apenas matérias que tenham pelo menos 1 questão disponível (curso + filtro de formato/origem)
  const filteredSubjects = subjects.filter(sub =>
    sourceFilteredQuestions.some(q => q.subjectId === sub.id)
  );

  // Temas da matéria selecionada que tenham pelo menos 1 questão — sem disabled, sem 0
  const filteredTopics = topics
    .filter(t => String(t.subject_id) === selectedSubjectId)
    .filter(t => sourceFilteredQuestions.some(q => q.topicId === String(t.id)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const startSession = (topicId: string) => {
    setAnsweredCurrent(false);
    setSelectedTopicId(topicId);
    setCurrentIndex(0);
    setIsFinished(false);

    const topicQuestions = sourceFilteredQuestions.filter(q => 
      topicId === "general" ? q.subjectId === selectedSubjectId : 
      q.topicId === topicId || q.subjectId === selectedSubjectId && !q.topicId
    );

    const sorted = [...topicQuestions].sort((a, b) => {
      const statA = qStats.find(s => String(s.question_id) === a.id);
      const statB = qStats.find(s => String(s.question_id) === b.id);

      const getPriority = (stat: any) => {
        if (!stat) return 1; 
        if (stat.last_is_correct === false) return 2; 
        return 3; 
      };

      const pA = getPriority(statA);
      const pB = getPriority(statB);

      if (pA !== pB) return pA - pB;

      if (statA && statB) {
        const timeA = new Date(statA.last_answered_at || 0).getTime();
        const timeB = new Date(statB.last_answered_at || 0).getTime();
        return timeA - timeB; 
      }
      return 0;
    });

    setSessionQueue(sorted);
  };

  const active = isUserActive(user);

  const handleAnswer = async (selectedOption: string, requestId: string) => {
    if (user && sessionQueue[currentIndex]) {
      try {
        const response = await recordAnswer.mutateAsync({ userId: user.id,
          questionId: parseInt(sessionQueue[currentIndex].id), selectedOption, requestId });
        setAnsweredCurrent(true);
        return response;
      } catch (error) {
        if (isStudyLimitError(error)) setServerBlocked(true);
        throw error;
      }
    }
    throw new Error('Selecione uma questão para continuar.');
  };

  const handleNext = () => {
    setAnsweredCurrent(false);
    if (currentIndex + 1 >= sessionQueue.length) {
      setIsFinished(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  if (!active) {
    return <AppLayout><BlockedOverlay reason="expired" /></AppLayout>;
  }
  
  if (selectedTopicId && !answeredCurrent && !recordAnswer.isPending && ((serverBlocked && !access?.entitled) || (access && !access.entitled && access.remaining === 0))) {
    return <AppLayout><BlockedOverlay answeredCount={access?.used ?? 10} reason="limit_reached" /></AppLayout>;
  }
  if (selectedTopicId && accessError) {
    return <AppLayout><StudyLoadError error={accessError} /></AppLayout>;
  }

  if (!isAdmin && !courseId) {
    return (
      <AppLayout>
        <div className="p-8 text-center mt-10 animate-fade-in">
          <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground text-sm">Você precisa ter um curso vinculado à sua conta para acessar as questões. Entre em contato com a equipe.</p>
        </div>
      </AppLayout>
    );
  }

  if (subjectsError || topicsError || questionsError) {
    return <AppLayout><StudyLoadError error={subjectsError || topicsError || questionsError} /></AppLayout>;
  }
  if (loadingQ || loadingSub || loadingTop || loadingStats) {
    return <AppLayout><div className="p-8 text-center text-muted-foreground">Carregando questões...</div></AppLayout>;
  }

  // --- SELECTION SCREENS ---

  if (!selectedFormat) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-6 animate-fade-in pb-20">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2 mb-2"><Filter className="h-5 w-5 text-primary" /> Formato da Questão</h1>
            <p className="text-sm text-muted-foreground">Escolha o formato que deseja resolver agora.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setSelectedFormat("multiple_choice")}
              className="flex flex-col items-center justify-center p-5 rounded-2xl bg-card border border-border text-center hover:border-primary/50 transition-all active:scale-[0.98]">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 mb-3">
                <BookOpenIcon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold text-foreground text-base mb-1">Múltipla Escolha</h3>
              <p className="text-xs text-muted-foreground leading-tight">Alternativas</p>
            </button>
            <button onClick={() => { setSelectedFormat("true_false"); setSelectedSource("all"); }}
              className="flex flex-col items-center justify-center p-5 rounded-2xl bg-card border border-border text-center hover:border-primary/50 transition-all active:scale-[0.98]">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 border border-accent/20 mb-3">
                <CheckCircle2 className="h-7 w-7 text-accent" />
              </div>
              <h3 className="font-bold text-foreground text-base mb-1">Verdadeiro/Falso</h3>
              <p className="text-xs text-muted-foreground leading-tight">Certo ou Errado</p>
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (selectedFormat === "multiple_choice" && !selectedSource) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-6 animate-fade-in pb-20">
          <div>
            <button onClick={() => setSelectedFormat(null)} className="text-primary text-sm font-medium mb-3 hover:underline">
              &larr; Voltar para Formatos
            </button>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2 mb-2"><Filter className="h-5 w-5 text-primary" /> Origem das Questões</h1>
            <p className="text-sm text-muted-foreground">Escolha o tipo de questão que deseja resolver agora.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => setSelectedSource("ia")}
              className="flex flex-col items-center justify-center p-5 rounded-2xl bg-card border border-border text-center hover:border-primary/50 transition-all active:scale-[0.98]">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 mb-3">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold text-foreground text-base mb-1">IA</h3>
              <p className="text-xs text-muted-foreground leading-tight">Questões geradas por Inteligência Artificial</p>
            </button>
            <button onClick={() => setSelectedSource("banca")}
              className="flex flex-col items-center justify-center p-5 rounded-2xl bg-card border border-border text-center hover:border-primary/50 transition-all active:scale-[0.98]">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 border border-accent/20 mb-3">
                <Building2 className="h-7 w-7 text-accent" />
              </div>
              <h3 className="font-bold text-foreground text-base mb-1">BANCA</h3>
              <p className="text-xs text-muted-foreground leading-tight">Questões reais de provas anteriores</p>
            </button>
            <button onClick={() => setSelectedSource("all")}
              className="flex flex-col items-center justify-center p-5 rounded-2xl bg-card border border-border text-center hover:border-primary/50 transition-all active:scale-[0.98]">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-xp/10 border border-xp/20 mb-3">
                <Shuffle className="h-7 w-7 text-xp" />
              </div>
              <h3 className="font-bold text-foreground text-base mb-1">VARIADAS</h3>
              <p className="text-xs text-muted-foreground leading-tight">Mistura de questões IA e Banca</p>
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!selectedSubjectId) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-6 animate-fade-in pb-20">
          <div>
            <button onClick={() => {
              if (selectedFormat === "true_false") {
                setSelectedFormat(null);
                setSelectedSource(null);
              } else {
                setSelectedSource(null);
              }
            }} className="text-primary text-sm font-medium mb-3 hover:underline">
              &larr; Voltar
            </button>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2 mb-2"><BookOpen className="h-5 w-5 text-primary" /> Escolha uma Matéria</h1>
            <p className="text-sm text-muted-foreground">Selecione o que deseja estudar agora.</p>
          </div>
          <div className="space-y-3">
            {filteredSubjects.map(sub => {
              const IconComponent = SUBJECT_UI_MAP[sub.name]?.icon || BookOpenIcon;
              const color = SUBJECT_UI_MAP[sub.name]?.color || "hsl(217 91% 60%)";
              return (
                <button key={sub.id} onClick={() => setSelectedSubjectId(sub.id)}
                  className="w-full flex items-center gap-4 rounded-2xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl"
                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                    <IconComponent className="h-6 w-6" style={{ color }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{sub.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{sub.questionCount || 'Várias'} questões</p>
                  </div>
                </button>
              );
            })}
            {filteredSubjects.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhuma matéria disponível neste curso.</p>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!selectedTopicId) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-6 animate-fade-in pb-20">
          <div>
            <button onClick={() => setSelectedSubjectId(null)} className="text-primary text-sm font-medium mb-3 hover:underline">
              &larr; Matérias
            </button>
            <h1 className="text-xl font-bold text-foreground">Escolha o Tema</h1>
            <p className="text-sm text-muted-foreground">Filtre as questões pelo tema específico.</p>
          </div>
          <div className="space-y-3">
            {filteredTopics.map(topic => {
              const count = sourceFilteredQuestions.filter(q => q.topicId === String(topic.id)).length;
              return (
                <button key={topic.id} onClick={() => startSession(String(topic.id))}
                  className="w-full p-4 rounded-xl bg-card border border-border text-left flex justify-between items-center hover:border-primary/50 transition-all active:scale-[0.98]">
                  <span className="font-medium text-sm text-foreground">{topic.name}</span>
                  <Badge variant="secondary">{count} qsts</Badge>
                </button>
              );
            })}
            {(() => {
              const generalCount = sourceFilteredQuestions.filter(q => q.subjectId === selectedSubjectId).length;
              if (generalCount === 0) return null;
              return (
                <button onClick={() => startSession("general")}
                    className="w-full p-4 rounded-xl bg-card border border-border text-left flex justify-between items-center hover:border-primary/50 transition-all active:scale-[0.98]">
                  <span className="font-medium text-sm text-foreground">Todos os tópicos / Geral</span>
                  <Badge variant="secondary">{generalCount} qsts</Badge>
                </button>
              );
            })()}
            {filteredTopics.length === 0 && sourceFilteredQuestions.filter(q => q.subjectId === selectedSubjectId).length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum tema com questões disponíveis.</p>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // --- PLAYER SCREEN ---

  if (sessionQueue.length === 0) {
    return (
      <AppLayout>
        <div className="p-8 text-center space-y-4">
          <p className="text-muted-foreground">Nenhuma questão encontrada.</p>
          <button onClick={() => setSelectedTopicId(null)} className="text-primary text-sm font-medium hover:underline">
            &larr; Voltar
          </button>
        </div>
      </AppLayout>
    );
  }

  if (isFinished) {
    return (
      <AppLayout>
        <div className="px-4 pt-12 pb-20 space-y-6 text-center animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mb-2">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Tema Concluído!</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Você respondeu todas as questões deste tema. Ótimo trabalho!
            </p>
          </div>
          
          <div className="space-y-3 w-full max-w-sm mt-8">
            <button onClick={() => setSelectedTopicId(null)}
              className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]">
              Escolher Outro Tema
            </button>
            <button onClick={() => startSession(selectedTopicId)}
              className="w-full bg-secondary text-secondary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]">
              Responder Novamente
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const currentQuestion = sessionQueue[currentIndex];
  const subject = subjects.find(s => s.id === currentQuestion.subjectId);

  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-4 pb-20">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedTopicId(null)} className="text-primary pr-4 text-sm font-medium hover:underline truncate max-w-[200px]">
             &larr; Voltar
          </button>
          <button onClick={() => { setSelectedTopicId(null); setSelectedSubjectId(null); setSelectedSource(null); setSelectedFormat(null); }} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
            <Filter className="h-3.5 w-3.5" /> Trocar
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Questão {currentIndex + 1} de {sessionQueue.length}</span>
          <span>·</span>
          <span className="text-primary font-medium cursor-help" title="Questões separadas por: 1º Novas, 2º Erradas, 3º Antigas corretas">Algoritmo Inteligente</span>
        </div>

        <QuestionCard
          key={currentQuestion.id}
          question={currentQuestion}
          subjectName={subject?.name ?? "Geral"}
          subjectIcon={typeof subject?.icon === "string" ? undefined : subject?.icon}
          onNext={handleNext}
          onAnswer={handleAnswer}
        />
      </div>
    </AppLayout>
  );
}
