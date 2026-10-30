import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { usePatrulhamentoTrilha, useCompletarFase } from '@/hooks/usePatrulhamento';
import { useSummaries, useQuestions, useFlashcards } from '@/hooks/useStudyData';
import { ChevronLeft, Target, Award, BrainCircuit, Play, CheckCircle, XCircle, Check, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { sanitizeContentHtml } from '@/lib/sanitize';
import { answerStudyQuestion, revealStudyFlashcard, recordStudyFlashcardReview, isStudyLimitError } from '@/services/studyAccessService';
import { invalidateStudyProgress, showStudyAchievements } from '@/lib/studyProgress';
import { useQueryClient } from '@tanstack/react-query';
import { useStudyAccess } from '@/hooks/useStudyAccess';
import { BlockedOverlay } from '@/components/BlockedOverlay';

export default function PatrulhamentoFase() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const courseId = user?.courseId ? Number(user.courseId) : null;
  
  const { data: campanhas, isLoading: loadingCartography } = usePatrulhamentoTrilha(courseId);
  const { data: summaries, isLoading: loadingSummaries } = useSummaries(String(courseId));
  const { data: allQuestions, isLoading: loadingQuestions } = useQuestions(String(courseId));
  const { data: flashcards, isLoading: loadingFlashcards } = useFlashcards(String(courseId));

  const completarMutation = useCompletarFase();
  const { data: access, refetch: refreshAccess } = useStudyAccess();
  const [trialBlocked, setTrialBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  
  const [fase, setFase] = useState<any>(null);
  const [nextFaseId, setNextFaseId] = useState<number | null>(null);

  // Estados de Execução (Questões e Flashcards)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [acertos, setAcertos] = useState(0);
  const [answeredState, setAnsweredState] = useState<{ selectedOptionId?: string, isCorrect?: boolean, correctOption?: string, explanation?: string, back?: string } | null>(null);
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!campanhas || !id) return;
    const allFases: any[] = [];
    campanhas.forEach(c => c.setores?.forEach(s => s.fases?.forEach(f => allFases.push(f))));
    allFases.sort((a,b) => a.ordem_global - b.ordem_global);

    const fId = Number(id);
    const index = allFases.findIndex(f => f.id === fId);
    
    if (index !== -1) {
       setFase(allFases[index]);
       setNextFaseId(allFases[index + 1]?.id || null);
    }
  }, [campanhas, id]);

  // Carregar conteúdo real baseado no payload_json
  useEffect(() => {
    if (!fase) return;
    const topicId = fase.payload_json?.topic_id;
    const mixTopics = fase.payload_json?.mix_topic_ids;

    if (fase.tipo_fase === 'questoes' || fase.tipo_fase === 'checkpoint') {
       let filtered: any[] = [];
       const questionsList = allQuestions || [];
       const specificIds = fase.payload_json?.question_ids;

       if (specificIds && Array.isArray(specificIds) && specificIds.length > 0) {
          // Engessado pelo Admin: Puxa exatamente as questões pedidas
          filtered = questionsList.filter(q => specificIds.includes(Number(q.id)));
          // Opcional: ordenar as questões na mesma ordem do array engessado
          filtered.sort((a,b) => specificIds.indexOf(Number(a.id)) - specificIds.indexOf(Number(b.id)));
       } else if (mixTopics && mixTopics.length > 0) {
          filtered = questionsList.filter(q => q.topicId && mixTopics.includes(Number(q.topicId)));
          filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, fase.limite_itens);
       } else if (topicId) {
          filtered = questionsList.filter(q => q.topicId === String(topicId));
          filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, fase.limite_itens);
       }
       
       setItemsList(filtered);
       setCurrentIndex(0);
       setAcertos(0);
       setAnsweredState(null);
    }

    if (fase.tipo_fase === 'flashcards') {
        let filtered: any[] = [];
        const fList = flashcards || [];
        const specificIds = fase.payload_json?.question_ids; // Usando o mesmo field para praticidade no JSON

        if (specificIds && Array.isArray(specificIds) && specificIds.length > 0) {
            filtered = fList.filter(f => specificIds.includes(Number(f.id)));
        } else {
            filtered = topicId ? fList.filter(f => f.topicId === String(topicId)) : fList;
            filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, fase.limite_itens || 10);
        }
        
        setItemsList(filtered);
        setCurrentIndex(0);
    }
  }, [fase, allQuestions, flashcards]);

  const isLoading = loadingCartography || loadingSummaries || loadingQuestions || loadingFlashcards;

  const dynamicReq = useMemo(() => {
     if (!fase || !itemsList) return 0;
     if (fase.req_acertos <= 0) return 0;
     if (itemsList.length === 0) return fase.req_acertos;

     if (itemsList.length < fase.limite_itens) {
         const prop = fase.req_acertos / Math.max(fase.limite_itens, 1);
         return Math.max(1, Math.round(itemsList.length * prop));
     }
     if (itemsList.length < fase.req_acertos) {
         return itemsList.length;
     }

     return fase.req_acertos;
  }, [fase, itemsList]);

  if (isLoading) return <div className="p-8 text-center mt-20 animate-pulse text-muted-foreground font-bold tracking-widest text-xs uppercase">Carregando Instrução...</div>;
  if (!fase) return <div className="p-8 text-center text-destructive">Fase não encontrada ou acesso negado.</div>;

  const summaryMatch = fase.tipo_fase === 'teoria' 
     ? (summaries || []).find(s => s.topicId === String(fase.payload_json?.topic_id)) 
     : null;

  const currentInteractionItem = itemsList[currentIndex];

  const handleCompleteSuccess = async () => {
    try {
       await completarMutation.mutateAsync({
           userId: user!.id,
           courseId: courseId!,
           faseConcluidaId: fase.id,
           nextFaseId: nextFaseId,
           xpGanho: fase.xp_reward || 0
       });
       setShowSuccess(true);
       setTimeout(() => {
           navigate('/patrulhamento');
       }, 2500);
    } catch (e: any) {
       toast.error("Erro ao salvar progresso: " + e.message);
    }
  };

  const handleFinishTeoria = () => {
     handleCompleteSuccess();
  };

  const handleAnswerQuestion = async (optionId: string) => {
      if (answeredState || submitting) return;
      setSubmitting(true);
      try {
        const feedback = await answerStudyQuestion(Number(currentInteractionItem.id), optionId, requestId);
        setAnsweredState({ ...feedback, selectedOptionId: optionId });
        if (feedback.isCorrect) setAcertos(prev => prev + 1);
        invalidateStudyProgress(qc);
        showStudyAchievements(feedback);
        refreshAccess();
      } catch (error) {
        if (isStudyLimitError(error)) setTrialBlocked(true);
        toast.error(error instanceof Error ? error.message : 'Não foi possível confirmar a resposta.');
      } finally { setSubmitting(false); }
  };
  const handleRevealCard = async () => {
    if (answeredState || submitting) return;
    setSubmitting(true);
    try {
      const feedback = await revealStudyFlashcard(Number(currentInteractionItem.id), requestId);
      setAnsweredState(feedback);
      refreshAccess();
    } catch (error) {
      if (isStudyLimitError(error)) setTrialBlocked(true);
      toast.error(error instanceof Error ? error.message : 'Não foi possível revelar o flashcard.');
    } finally { setSubmitting(false); }
  };

  const handleNextQuestion = async () => {
      if (submitting) return;
      if (fase.tipo_fase === 'flashcards' && answeredState) {
        setSubmitting(true);
        try {
          const feedback = await recordStudyFlashcardReview(Number(currentInteractionItem.id), 'good', requestId);
          invalidateStudyProgress(qc);
          showStudyAchievements(feedback);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a revisão.');
          return;
        } finally { setSubmitting(false); }
      }
      setRequestId(crypto.randomUUID());
      if (currentIndex + 1 < itemsList.length) {
          setCurrentIndex(prev => prev + 1);
          setAnsweredState(null);
      } else {
          // Finish Logic
          if (acertos >= dynamicReq) {
              handleCompleteSuccess();
          } else {
              toast.error(`Falha na Operação. Você acertou ${acertos} de ${itemsList.length}. Necessário: ${dynamicReq}.`);
              navigate('/patrulhamento');
          }
      }
  };

  if (['questoes', 'checkpoint', 'flashcards'].includes(fase.tipo_fase) && !answeredState
    && ((trialBlocked && !access?.entitled) || (access && !access.entitled && access.remaining === 0))) {
    return <AppLayout><BlockedOverlay answeredCount={access?.used ?? 10} /></AppLayout>;
  }
  if (showSuccess) {
     return (
       <div className="fixed inset-0 bg-success/20 backdrop-blur-sm z-[100] flex flex-col items-center justify-center animate-fade-in">
          <div className="bg-card w-full max-w-sm rounded-[2rem] p-8 flex flex-col items-center text-center shadow-[0_0_50px_rgba(var(--success),0.3)] animate-slide-up border border-success/30">
             <div className="w-24 h-24 bg-success rounded-full flex flex-col items-center justify-center shadow-lg border-4 border-success/20 mb-6 animate-bounce">
                <Check className="w-12 h-12 text-success-foreground stroke-[3]" />
             </div>
             <h2 className="text-3xl font-black text-foreground mb-2">Operação Concluída!</h2>
             <p className="text-muted-foreground font-medium mb-6">Você completou a fase {fase?.titulo}</p>
             <div className="flex items-center gap-2 bg-warning/10 text-warning px-4 py-2 rounded-full font-black border border-warning/20">
                <Star className="w-5 h-5 fill-warning" /> +{fase?.xp_reward} XP
             </div>
          </div>
       </div>
     );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col items-center animate-fade-in overflow-hidden">
      {/* Header Imersivo */}
      <div className="w-full bg-card border-b border-border p-4 flex items-center justify-between shrink-0 shadow-sm z-10">
         <button onClick={() => navigate('/patrulhamento')} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-border transition active:scale-95">
            <ChevronLeft className="w-5 h-5" />
         </button>
         <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-3 py-1 rounded-full border border-border">
               {fase.tipo_fase}
            </span>
            <div className="text-sm font-black mt-1 text-foreground">{fase.titulo}</div>
         </div>
         <div className="w-10 h-10"></div>
      </div>

      <div className="w-full flex-1 flex flex-col overflow-hidden max-w-lg mx-auto bg-background">
         
         <ScrollArea className="flex-1 p-4">
             {/* FASE: TEORIA */}
             {fase.tipo_fase === 'teoria' && (
                <div className="space-y-6 pb-20">
                   {!summaryMatch ? (
                      <div className="p-6 bg-muted/30 border border-border rounded-xl text-center">
                         <BrainCircuit className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                         <p className="text-muted-foreground text-sm">Resumo não encontrado para este tema no banco de dados.</p>
                      </div>
                   ) : (
                      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-a:text-primary">
                         {summaryMatch.contentHtml ? (
                             <div dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(summaryMatch.contentHtml) }} />
                         ) : summaryMatch.contentMarkdown ? (
                             <div className="whitespace-pre-wrap">{summaryMatch.contentMarkdown}</div>
                         ) : (
                             <p>Conteúdo vazio.</p>
                         )}
                      </div>
                   )}
                </div>
             )}

             {/* FASE: QUESTOES OU CHECKPOINT */}
             {(fase.tipo_fase === 'questoes' || fase.tipo_fase === 'checkpoint') && (
                <div className="space-y-6 pb-24">
                   {itemsList.length === 0 ? (
                      <div className="p-6 bg-muted/30 border border-border rounded-xl text-center">
                         <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                         <p className="text-muted-foreground text-sm">Nenhuma questão encontrada para os temas desta fase no banco de dados.</p>
                      </div>
                   ) : (
                      currentInteractionItem && (
                         <div className="space-y-6">
                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                               <span>Alvo {currentIndex + 1} / {itemsList.length}</span>
                               <span className="text-warning">Requisito: {dynamicReq} acertos</span>
                            </div>

                            <p className="text-lg leading-relaxed text-foreground font-medium mb-6">
                               {currentInteractionItem.statement}
                            </p>

                            <div className="space-y-3">
                               {currentInteractionItem.options.map((opt: any, index: number) => {
                                  const isSelected = answeredState?.selectedOptionId === opt.id;
                                  const isCorrectOption = opt.id === answeredState?.correctOption;
                                  let btnClass = "bg-card border-border hover:border-primary/50 text-foreground";
                                  
                                  if (answeredState) {
                                      if (isCorrectOption) btnClass = "bg-success/20 border-success text-success-foreground";
                                      else if (isSelected) btnClass = "bg-destructive/20 border-destructive text-destructive-foreground";
                                      else btnClass = "bg-muted border-border opacity-50";
                                  }

                                  return (
                                     <button
                                        key={opt.id}
                                        disabled={!!answeredState || submitting}
                                        onClick={() => handleAnswerQuestion(opt.id)}
                                        className={cn(
                                           "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3",
                                           btnClass
                                        )}
                                     >
                                        <div className="w-8 h-8 rounded-full border-2 border-inherit flex items-center justify-center font-bold text-xs shrink-0">
                                           {currentInteractionItem.format === 'true_false' ? opt.id.toUpperCase() : ['A', 'B', 'C', 'D', 'E'][index]}
                                        </div>
                                        <span className="text-sm font-medium">{opt.text}</span>
                                     </button>
                                  );
                               })}
                            </div>

                            {answeredState && (
                               <div className={cn("p-4 rounded-xl border", answeredState.isCorrect ? "bg-success/10 border-success/30 text-success-foreground" : "bg-destructive/10 border-destructive/30 text-destructive-foreground")}>
                                  <h4 className="font-bold mb-1">{answeredState.isCorrect ? "Tiro Certeiro!" : "Alvo Errado"}</h4>
                                  <p className="text-sm opacity-90">{answeredState.explanation || "Sem comentários do instrutor."}</p>
                               </div>
                            )}
                         </div>
                      )
                   )}
                </div>
             )}

             {/* FASE: FLASHCARDS (simplificado) */}
             {fase.tipo_fase === 'flashcards' && (
                 <div className="space-y-6 pb-24 h-full flex flex-col justify-center">
                    {itemsList.length === 0 ? (
                       <p className="text-center text-muted-foreground">Nenhum flashcard disponível.</p>
                    ) : (
                       currentInteractionItem && (
                          <div className="flex-1 flex flex-col justify-center items-center h-64 p-6 bg-card border-2 border-border shadow-xl rounded-3xl text-center">
                             {!answeredState ? (
                                <>
                                  <h3 className="text-xs uppercase text-muted-foreground font-bold tracking-widest mb-4">Frente do Card {currentIndex + 1}/{itemsList.length}</h3>
                                  <p className="text-lg font-bold text-foreground">{currentInteractionItem.front}</p>
                                  <button disabled={submitting} onClick={handleRevealCard} className="mt-8 px-6 py-2 bg-primary/10 text-primary font-bold rounded-full text-sm">{submitting ? 'Revelando...' : 'Ver Verso'}</button>
                                </>
                             ) : (
                                <>
                                  <h3 className="text-xs uppercase text-success font-bold tracking-widest mb-4">Verso do Card</h3>
                                  <p className="text-lg font-bold text-foreground">{answeredState.back}</p>
                                </>
                             )}
                          </div>
                       )
                    )}
                 </div>
             )}

         </ScrollArea>
      </div>

      {/* FOOTER FIXO DE AÇÃO */}
      <div className="w-full bg-background/80 backdrop-blur-md p-4 border-t border-border z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] shrink-0">
          <div className="max-w-lg mx-auto">
             {fase.tipo_fase === 'teoria' && (
                <button 
                   onClick={handleFinishTeoria}
                   disabled={completarMutation.isPending}
                   className="w-full bg-primary text-primary-foreground font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
                >
                   {completarMutation.isPending ? 'Validando...' : 'COMPREENDI A INSTRUÇÃO'}
                </button>
             )}

             {(fase.tipo_fase === 'questoes' || fase.tipo_fase === 'checkpoint') && (
                <>
                   {itemsList.length > 0 ? (
                      <button 
                         onClick={handleNextQuestion}
                         disabled={!answeredState}
                         className={cn(
                             "w-full font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-2 transition-transform shadow-lg",
                             answeredState ? "bg-primary text-primary-foreground active:scale-[0.98] shadow-primary/20" : "bg-muted text-muted-foreground"
                         )}
                      >
                         {currentIndex + 1 < itemsList.length ? 'PRÓXIMO ALVO' : 'FINALIZAR MISSÃO'}
                      </button>
                   ) : (
                      <button onClick={() => navigate('/patrulhamento')} className="w-full bg-muted text-foreground py-4 rounded-xl font-bold">Voltar</button>
                   )}
                </>
             )}
             
             {fase.tipo_fase === 'flashcards' && (
                 <>
                   {itemsList.length > 0 ? (
                      <button 
                         onClick={handleNextQuestion}
                         disabled={!answeredState}
                         className={cn(
                             "w-full font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-2 transition-transform shadow-lg",
                             answeredState ? "bg-primary text-primary-foreground active:scale-[0.98] shadow-primary/20" : "bg-muted text-muted-foreground opacity-0"
                         )}
                      >
                         {currentIndex + 1 < itemsList.length ? 'PRÓXIMO CARD' : 'FINALIZAR REVISÃO'}
                      </button>
                   ) : (
                      <button onClick={() => navigate('/patrulhamento')} className="w-full bg-muted text-foreground py-4 rounded-xl font-bold">Voltar</button>
                   )}
                </>
             )}

             <p className="text-center text-[10px] font-bold text-muted-foreground uppercase mt-3 flex items-center justify-center gap-1">
                <Award className="w-3 h-3" /> Recompensa: {fase.xp_reward} XP
             </p>
          </div>
      </div>
    </div>
  );
}
