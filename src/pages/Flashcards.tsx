import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Layers, CheckCircle2, XCircle, ChevronLeft, BookOpen, BookOpenIcon, X, HelpCircle, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessContent, isUserActive } from "@/services/accessService";
import { useSubjects, useFlashcards, useRecordFlashcardReview, useUserProductivity, useTopics, useUserFlashcardReviews, SUBJECT_UI_MAP, useActiveLawIdsForCourse } from "@/hooks/useStudyData";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { Flashcard } from "@/types/study";

function FlashcardViewer({ card, onRate }: {
  card: Flashcard;
  onRate: (rating: "wrong" | "hard" | "good" | "easy") => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const { data: subjects = [] } = useSubjects();
  const subject = subjects.find((s) => s.id === card.subjectId);

  const SubjectIcon = subject?.icon;
  
  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
          {SubjectIcon && <SubjectIcon className="h-3.5 w-3.5 inline mr-1" />}
          {subject?.name ?? "Geral"}
        </Badge>
        <Badge variant="outline" className="text-xs border-border text-muted-foreground">
          {card.topic}
        </Badge>
        {card.lawReferenceName && (
          <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400 bg-violet-500/5">
            ⚖️ {card.lawReferenceName}
          </Badge>
        )}
      </div>

      <button onClick={() => setFlipped(!flipped)}
        className="w-full min-h-[280px] rounded-2xl border border-border bg-card p-6 text-left transition-all active:scale-[0.98] relative overflow-hidden">
        <div className="absolute top-3 right-3">
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {flipped ? "VERSO" : "FRENTE"} · toque para virar
          </span>
        </div>
        {!flipped ? (
          <div className="flex items-center justify-center h-full pt-4">
            <p className="text-base font-medium text-foreground leading-relaxed text-center">{card.front}</p>
          </div>
        ) : (
          <div className="pt-4 animate-flip-in">
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{card.back}</p>
          </div>
        )}
      </button>

      {flipped ? (
        <div className="space-y-2 animate-slide-up">
          <p className="text-xs text-center text-muted-foreground">Como foi?</p>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => onRate("wrong")} className="flex flex-col items-center gap-1.5 rounded-xl bg-destructive/10 border border-destructive/20 py-3 active:scale-[0.95] transition-all">
              <X className="h-5 w-5 text-destructive" />
              <span className="text-xs font-medium text-destructive">Errei</span>
            </button>
            <button onClick={() => onRate("hard")} className="flex flex-col items-center gap-1.5 rounded-xl bg-warning/10 border border-warning/20 py-3 active:scale-[0.95] transition-all">
              <HelpCircle className="h-5 w-5 text-warning" />
              <span className="text-xs font-medium text-warning">Difícil</span>
            </button>
            <button onClick={() => onRate("good")} className="flex flex-col items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 py-3 active:scale-[0.95] transition-all">
              <Check className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium text-primary">Bom</span>
            </button>
            <button onClick={() => onRate("easy")} className="flex flex-col items-center gap-1.5 rounded-xl bg-success/10 border border-success/20 py-3 active:scale-[0.95] transition-all">
              <Check className="h-5 w-5 text-success" />
              <span className="text-xs font-medium text-success">Fácil</span>
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setFlipped(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-semibold text-sm text-primary-foreground active:scale-[0.98] transition-all">
          <RotateCcw className="h-4 w-4" /> Revelar Resposta
        </button>
      )}
    </div>
  );
}

export default function FlashcardsPage() {
  const { user, isApproved, isAdmin } = useAuth();
  const courseId = user?.courseId ? String(user.courseId) : null;
  const courseIdNum = user?.courseId ? Number(user.courseId) : null;
  const editalIdNum = user?.editalId ? Number(user.editalId) : null;

  // Busca as leis ativas do edital do usuário
  const { data: activeLawIds } = useActiveLawIdsForCourse(
    isAdmin ? null : courseIdNum,
    isAdmin ? null : editalIdNum
  );

  const { data: subjects = [], isLoading: loadingSub } = useSubjects(isAdmin ? undefined : courseId);
  const { data: topics = [], isLoading: loadingTop } = useTopics(isAdmin ? undefined : courseId);
  const { data: flashcards = [], isLoading: loadingF } = useFlashcards(
    isAdmin ? undefined : courseId,
    isAdmin ? null : activeLawIds
  );
  const { data: userReviews = [], isLoading: loadingStats } = useUserFlashcardReviews(user?.id);
  const { data: todayProd } = useUserProductivity(user?.id);
  
  const recordReview = useRecordFlashcardReview();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionQueue, setSessionQueue] = useState<typeof flashcards>([]);
  const [isFinished, setIsFinished] = useState(false);

  // Mostrar apenas matérias que tenham pelo menos 1 flashcard disponível para o curso
  const filteredSubjects = subjects.filter(sub => flashcards.some(f => f.subjectId === sub.id));
  // Temas da matéria selecionada com pelo menos 1 flashcard — sem disabled, sem 0
  const filteredTopics = topics
    .filter(t => String(t.subject_id) === selectedSubjectId)
    .filter(t => flashcards.some(f => f.topicId === String(t.id)));

  // Triggered when a topic is chosen: build the queue ONCE so it doesn't shuffle mid-session
  const startSession = (topicId: string) => {
    setSelectedTopicId(topicId);
    setCurrentIndex(0);
    setIsFinished(false);

    const topicCards = flashcards.filter(f => 
      topicId === "general" ? f.subjectId === selectedSubjectId : 
      f.topicId === topicId || f.subjectId === selectedSubjectId && !f.topicId
    );

    const sorted = [...topicCards].sort((a, b) => {
      const statA = userReviews.find(s => String(s.flashcard_id) === a.id);
      const statB = userReviews.find(s => String(s.flashcard_id) === b.id);

      const getPriority = (stat: any) => {
        if (!stat) return 1; 
        if (stat.last_review_result === 'wrong') return 2; 
        return 3; 
      };

      const pA = getPriority(statA);
      const pB = getPriority(statB);

      if (pA !== pB) return pA - pB;

      if (statA && statB) {
        const timeA = new Date(statA.last_reviewed_at || 0).getTime();
        const timeB = new Date(statB.last_reviewed_at || 0).getTime();
        return timeA - timeB; 
      }
      return 0;
    });

    setSessionQueue(sorted);
  };

  const answeredCount = todayProd?.questions_answered ?? 0;
  const flashcardsCount = todayProd?.flashcards_reviewed ?? 0;
  const totalUsage = answeredCount + flashcardsCount;
  const active = isUserActive(user);
  const limitReached = !canAccessContent(user, totalUsage);

  if (!active) {
    return <AppLayout><BlockedOverlay reason="expired" /></AppLayout>;
  }

  if (limitReached && !isApproved) {
    return <AppLayout><BlockedOverlay answeredCount={totalUsage} reason="limit_reached" /></AppLayout>;
  }

  if (!isAdmin && !courseId) {
    return (
      <AppLayout>
        <div className="p-8 text-center mt-10 animate-fade-in">
          <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground text-sm">Você precisa ter um curso vinculado à sua conta para acessar os flashcards. Entre em contato com a equipe.</p>
        </div>
      </AppLayout>
    );
  }

  if (loadingF || loadingSub || loadingTop || loadingStats) {
    return <AppLayout><div className="p-8 text-center text-muted-foreground">Carregando flashcards...</div></AppLayout>;
  }

  // --- SELECTION SCREENS ---

  if (!selectedSubjectId) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-6 animate-fade-in pb-20">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2 mb-2"><Layers className="h-5 w-5 text-accent" /> Matéria (Flashcards)</h1>
            <p className="text-sm text-muted-foreground">Selecione a matéria para revisar seus flashcards.</p>
          </div>
          <div className="space-y-3">
            {filteredSubjects.map(sub => {
              const IconComponent = SUBJECT_UI_MAP[sub.name]?.icon || BookOpenIcon;
              const color = SUBJECT_UI_MAP[sub.name]?.color || "hsl(217 91% 60%)";
              const count = flashcards.filter(f => f.subjectId === sub.id).length;
              return (
                <button key={sub.id} onClick={() => setSelectedSubjectId(sub.id)}
                  className="w-full flex items-center gap-4 rounded-2xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl"
                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                    <IconComponent className="h-6 w-6" style={{ color }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{sub.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{count} {count === 1 ? 'card' : 'cards'}</p>
                  </div>
                </button>
              );
            })}
            {filteredSubjects.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum flashcard cadastrado ainda.</p>
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
            <p className="text-sm text-muted-foreground">Filtre os flashcards pelo tema específico.</p>
          </div>
          <div className="space-y-3">
            {filteredTopics.map(topic => {
              const count = flashcards.filter(f => f.topicId === String(topic.id)).length;
              return (
                <button key={topic.id} onClick={() => startSession(String(topic.id))}
                  className="w-full p-4 rounded-xl bg-card border border-border text-left flex justify-between items-center hover:border-primary/50 transition-all active:scale-[0.98]">
                  <span className="font-medium text-sm text-foreground">{topic.name}</span>
                  <Badge variant="secondary">{count} cards</Badge>
                </button>
              );
            })}
            {(() => {
              const generalCount = flashcards.filter(f => f.subjectId === selectedSubjectId).length;
              if (generalCount === 0) return null;
              return (
                <button onClick={() => startSession("general")}
                    className="w-full p-4 rounded-xl bg-card border border-border text-left flex justify-between items-center hover:border-primary/50 transition-all active:scale-[0.98]">
                  <span className="font-medium text-sm text-foreground">Todos os tópicos / Geral</span>
                  <Badge variant="secondary">{generalCount} cards</Badge>
                </button>
              );
            })()}
            {filteredTopics.length === 0 && flashcards.filter(f => f.subjectId === selectedSubjectId).length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum tema com flashcards disponíveis.</p>
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
          <p className="text-muted-foreground">Nenhum flashcard encontrado para este tema.</p>
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
            <Check className="h-10 w-10 text-success" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Tema Concluído!</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Você revisou todos os flashcards deste tema. Ótimo trabalho!
            </p>
          </div>
          
          <div className="space-y-3 w-full max-w-sm mt-8">
            <button onClick={() => setSelectedTopicId(null)}
              className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]">
              Escolher Outro Tema
            </button>
            <button onClick={() => startSession(selectedTopicId)}
              className="w-full bg-secondary text-secondary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]">
              Revisar Novamente
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const handleRate = (rating: "wrong" | "hard" | "good" | "easy") => {
    if (user && sessionQueue[currentIndex]) {
      recordReview.mutate({
        userId: user.id,
        flashcardId: parseInt(sessionQueue[currentIndex].id),
        result: rating,
      });
    }

    if (currentIndex + 1 >= sessionQueue.length) {
      setIsFinished(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const currentFlashcard = sessionQueue[currentIndex];

  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-4 pb-20">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedTopicId(null)} className="text-primary pr-4 text-sm font-medium hover:underline truncate max-w-[200px]">
             &larr; Voltar
          </button>
          <button onClick={() => { setSelectedTopicId(null); setSelectedSubjectId(null); }} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
            <Layers className="h-3.5 w-3.5" /> Trocar
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Card {currentIndex + 1} de {sessionQueue.length}</span>
          <span>·</span>
          <span className="text-primary font-medium cursor-help" title="Cards separados por: 1º Novos, 2º Errados, 3º Antigos corretos">Algoritmo Inteligente</span>
        </div>

        <FlashcardViewer
          key={currentFlashcard.id}
          card={currentFlashcard}
          onRate={handleRate}
        />
      </div>
    </AppLayout>
  );
}
