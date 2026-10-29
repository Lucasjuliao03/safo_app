import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { StudyLoadError } from "@/components/StudyLoadError";
import { FileText, ChevronLeft, BookOpen, CheckCircle, BookOpenIcon, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useSubjects, useSummaries, useTopics, SUBJECT_UI_MAP, useActiveLawIdsForCourse } from "@/hooks/useStudyData";
import { canAccessSummaries, isUserActive } from "@/services/accessService";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { useAccessStatus } from "@/hooks/useAccessStatus";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { MarkdownRenderer } from "@/components/mdx/MarkdownRenderer";

export default function ResumosPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const courseId = user?.courseId ? String(user.courseId) : null;
  const courseIdNum = user?.courseId ? Number(user.courseId) : null;
  const editalIdNum = user?.editalId ? Number(user.editalId) : null;
  const { data: activeLawIds } = useActiveLawIdsForCourse(
    isAdmin ? null : courseIdNum,
    isAdmin ? null : editalIdNum
  );

  const { data: subjects = [], isLoading: loadingSub, error: subjectsError } = useSubjects(isAdmin ? undefined : courseId);
  const { data: topics = [], isLoading: loadingTop, error: topicsError } = useTopics(isAdmin ? undefined : courseId);
  const { data: summaries = [], isLoading: loadingSum, error: summariesError } = useSummaries(
    isAdmin ? undefined : courseId,
    isAdmin ? null : activeLawIds
  );
  const qc = useQueryClient();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);
  const [viewedSummaryIds, setViewedSummaryIds] = useState<Set<string>>(new Set());
  const [viewedSummaryCounts, setViewedSummaryCounts] = useState<Map<string, number>>(new Map());

  // Carregar resumos já visualizados do banco
  useEffect(() => {
    if (user?.id) {
      const loadViewedSummaries = async () => {
        const { data } = await supabase
          .from('user_summary_views')
          .select('summary_id, read_count')
          .eq('user_id', user.id);
        
        if (data) {
          setViewedSummaryIds(new Set(data.map((v: any) => String(v.summary_id))));
          const counts = new Map<string, number>();
          data.forEach((v: any) => counts.set(String(v.summary_id), v.read_count || 1));
          setViewedSummaryCounts(counts);
        }
      };
      loadViewedSummaries();
    }
  }, [user?.id]);

  const updateMissionProgress = async (userId: string, summaryId: string, currentCount: number) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Registrar visualização do resumo, incrementando a contagem de vezes lidas
      await supabase.from('user_summary_views').upsert({
        user_id: userId,
        summary_id: summaryId,
        viewed_date: today,
        read_count: currentCount + 1,
      }, {
        onConflict: 'user_id,summary_id',
      });
      
      // Atualizar productivity do dia com resumo
      const { data: prod } = await supabase
        .from('user_daily_productivity')
        .select('id, summaries_read')
        .eq('user_id', userId)
        .eq('productivity_date', today)
        .maybeSingle();

      if (prod) {
        await supabase.from('user_daily_productivity').update({
          summaries_read: (prod.summaries_read || 0) + 1,
        }).eq('id', prod.id);
      } else {
        await supabase.from('user_daily_productivity').insert({
          user_id: userId,
          productivity_date: today,
          summaries_read: 1,
        });
      }
      
      // Atualizar missão
      const { data: mission } = await supabase
        .from('daily_missions')
        .select('*')
        .eq('user_id', userId)
        .eq('mission_date', today)
        .maybeSingle();

      if (mission && mission.status !== 'completed') {
        const newSummaryCompleted = (mission.summary_completed || 0) + 1;
        const updates: Record<string, any> = {
          summary_completed: newSummaryCompleted,
          updated_at: new Date().toISOString(),
        };
        if (mission.status === 'pending') {
          updates.status = 'in_progress';
          updates.started_at = new Date().toISOString();
        }
        
        // Verificar se todas as etapas foram concluídas (considerando > 0)
        const questionsTarget = mission.questions_count || 0;
        const flashcardsTarget = mission.flashcards_count || 0;
        const summaryTarget = mission.summary_count || 0;
        
        const allQuestionsDone = questionsTarget === 0 || (mission.questions_completed || 0) >= questionsTarget;
        const allFlashcardsDone = flashcardsTarget === 0 || (mission.flashcards_completed || 0) >= flashcardsTarget;
        const allSummariesDone = summaryTarget === 0 || newSummaryCompleted >= summaryTarget;
        
        if (allQuestionsDone && allFlashcardsDone && allSummariesDone) {
          updates.status = 'completed';
          updates.completed_at = new Date().toISOString();
          console.log('[Resumos] Missão completada!');
        }
        
        await supabase
          .from('daily_missions')
          .update(updates)
          .eq('id', mission.id);
        qc.invalidateQueries({ queryKey: ['daily-mission'] });
        qc.invalidateQueries({ queryKey: ['userProductivity'] });
        qc.invalidateQueries({ queryKey: ['userLifetimeUsage'] });
        qc.invalidateQueries({ queryKey: ['studentEvolution'] });
        qc.invalidateQueries({ queryKey: ['summaries'] });
      } else if (mission) {
         // Mission exists but already completed, just invalidate evolution
         qc.invalidateQueries({ queryKey: ['studentEvolution'] });
      } else {
         qc.invalidateQueries({ queryKey: ['studentEvolution'] });
      }
    } catch (e) {
      console.error('[Resumos] Erro ao atualizar missão:', e);
    }
  };

  const accessStatus = useAccessStatus();
  
  if (subjectsError || topicsError || summariesError) {
    return <AppLayout><StudyLoadError error={subjectsError || topicsError || summariesError} /></AppLayout>;
  }
  if (loadingSub || loadingSum || loadingTop || accessStatus.isLoading) {
    return <AppLayout><div className="p-8 text-center text-muted-foreground">Carregando resumos...</div></AppLayout>;
  }

  const active = isUserActive(user);
  
  const readCount = viewedSummaryIds.size;
  const summaryLimitReached = !canAccessSummaries(user, readCount);
  const globalTrialExhausted = accessStatus.reason === "trial_exhausted";

  if (!active) {
    return <AppLayout><BlockedOverlay reason="expired" /></AppLayout>;
  }

  if ((summaryLimitReached || globalTrialExhausted) && !user?.isApproved) {
    return <AppLayout><BlockedOverlay readCount={readCount} reason="limit_reached" /></AppLayout>;
  }

  if (!isAdmin && !courseId) {
    return (
      <AppLayout>
        <div className="p-8 text-center mt-10 animate-fade-in">
          <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground text-sm">Você precisa ter um curso vinculado à sua conta para acessar os resumos. Entre em contato com a equipe.</p>
        </div>
      </AppLayout>
    );
  }

  const handleSelectSummary = (id: string) => {
    const isNewlyViewed = true; // Sempre contar cliques! Ou seja, atualizar o read_count na hora se o usuário acessou para estudar de novo.
    
    // Bloquear limite de acessos apenas se for a primeira vez que ele abre (viewedSummaryIds.has(id))
    if (!user?.isApproved && !viewedSummaryIds.has(id)) {
      if (readCount >= 2) return;
    }
    
    if (user?.id) {
      const currentCount = viewedSummaryCounts.get(id) || 0;
      updateMissionProgress(user.id, id, currentCount);
      // Update local optimistically
      setViewedSummaryIds(prev => new Set([...prev, id]));
      setViewedSummaryCounts(prev => new Map(prev).set(id, currentCount + 1));
    }
    
    setSelectedSummaryId(id);
  };

  // Group summaries by subject
  const subjectsWithSummaries = subjects.filter(s =>
    summaries.some(sum => sum.subjectId === s.id)
  );

  // 1. View a specific summary
  if (selectedSummaryId) {
    const summary = summaries.find(s => s.id === selectedSummaryId);
    if (!summary) return null;
    const subject = subjects.find(s => s.id === summary.subjectId);

    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-4 animate-slide-up">
          <button onClick={() => setSelectedSummaryId(null)}
            className="flex items-center gap-1 text-sm text-primary font-medium">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              {subject && (() => {
                const SubjectIcon = subject.icon;
                return SubjectIcon ? <SubjectIcon className="h-3.5 w-3.5 inline mr-1" /> : null;
              })()}
              {subject?.name ?? "Geral"}
            </Badge>
            {summary.lawReferenceName && (
              <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400 bg-violet-500/5">
                ⚖️ {summary.lawReferenceName}
              </Badge>
            )}
          </div>

          <h1 className="text-xl font-bold text-foreground">{summary.title}</h1>

          <div className="rounded-2xl bg-card border border-border p-5 md:p-8 shadow-sm">
            {summary.contentMarkdown || summary.contentHtml ? (
              <MarkdownRenderer content={summary.contentMarkdown || summary.contentHtml} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">Conteúdo indisponível.</p>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // 2. View summaries for a selected topic
  if (selectedTopicId) {
    const topic = topics.find(t => String(t.id) === selectedTopicId);
    const subject = subjects.find(s => s.id === selectedSubjectId);
    const topicSummaries = summaries.filter(s => String(s.topicId) === selectedTopicId);

    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-4 animate-slide-up">
          <button onClick={() => setSelectedTopicId(null)}
            className="flex items-center gap-1 text-sm text-primary font-medium">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-foreground" />
            <h1 className="text-xl font-bold text-foreground">{topic?.name ?? "Resumos do Tema"}</h1>
          </div>
          
          <p className="text-xs text-muted-foreground">Matéria: {subject?.name}</p>

          <div className="space-y-2 mt-4">
            {topicSummaries.map(summary => {
              const isViewed = viewedSummaryIds.has(summary.id);
              
              return (
                <button key={summary.id} onClick={() => handleSelectSummary(summary.id)}
                  className={cn("w-full flex items-center justify-between rounded-xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]", isViewed && "border-success/30 bg-success/5")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("flex items-center justify-center w-10 h-10 rounded-lg border", isViewed ? "bg-success/20 border-success/30" : "bg-primary/10 border-primary/20")}>
                      {isViewed ? <CheckCircle className="h-5 w-5 text-success" /> : <BookOpen className="h-5 w-5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{summary.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                        {isViewed ? "Visualizado" : "Novo Resumo"}
                      </p>
                      {summary.lawReferenceName && (
                        <p className="text-[10px] text-violet-400 mt-1 flex items-center gap-1">
                          ⚖️ {summary.lawReferenceName}
                        </p>
                      )}
                    </div>
                  </div>
                  {isViewed && (
                    <span className="text-[10px] font-bold text-success uppercase tracking-wider bg-success/10 px-2 py-1 rounded">
                      Concluído
                    </span>
                  )}
                </button>
              );
            })}
            
            {topicSummaries.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                Nenhum título disponível para este tema.
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // 3. View Topics for a selected Subject
  if (selectedSubjectId) {
    const subject = subjects.find(s => s.id === selectedSubjectId);
    
    // Filter topics that belong to this subject and have at least one summary
    const subjectTopics = topics
      .filter(t => String(t.subject_id) === selectedSubjectId)
      .filter(t => summaries.some(sum => String(sum.topicId) === String(t.id)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Pegamos também resumos da matéria que por algum erro/motivo não tenham tema (topicId null)
    const floatingSummaries = summaries.filter(s => s.subjectId === selectedSubjectId && (!s.topicId));

    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-4 animate-slide-up">
          <button onClick={() => setSelectedSubjectId(null)}
            className="flex items-center gap-1 text-sm text-primary font-medium">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <div className="flex items-center gap-2">
            {(() => {
              const SubjectIcon = subject?.icon;
              return SubjectIcon ? <SubjectIcon className="h-6 w-6" /> : <BookOpenIcon className="h-6 w-6" />;
            })()}
            <h1 className="text-xl font-bold text-foreground">{subject?.name ?? "Temas"}</h1>
          </div>
          <p className="text-sm text-muted-foreground">Escolha o tema que deseja estudar</p>

          <div className="space-y-3 mt-4">
            {subjectTopics.map(topic => {
              const count = summaries.filter(s => String(s.topicId) === String(topic.id)).length;
              return (
                <button key={topic.id} onClick={() => setSelectedTopicId(String(topic.id))}
                  className="w-full flex items-center gap-4 rounded-xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted border border-border">
                    <Folder className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground text-sm">{topic.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{count} {count === 1 ? 'título' : 'títulos'}</p>
                  </div>
                </button>
              );
            })}

            {/* Listar diretamente os resumos sem tema, caso existam, para que não fiquem órfãos */}
            {floatingSummaries.length > 0 && (
              <div className="pt-4 border-t border-border mt-6">
                <p className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wider">Outros (Sem Tema Específico)</p>
                <div className="space-y-2">
                  {floatingSummaries.map(summary => {
                    const isViewed = viewedSummaryIds.has(summary.id);
                    return (
                      <button key={summary.id} onClick={() => handleSelectSummary(summary.id)}
                        className={cn("w-full flex items-center justify-between rounded-xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]", isViewed && "border-success/30 bg-success/5")}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("flex items-center justify-center w-10 h-10 rounded-lg border", isViewed ? "bg-success/20 border-success/30" : "bg-primary/10 border-primary/20")}>
                            {isViewed ? <CheckCircle className="h-5 w-5 text-success" /> : <BookOpen className="h-5 w-5 text-primary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{summary.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                              {isViewed ? `Lido ${viewedSummaryCounts.get(summary.id) || 1} ${viewedSummaryCounts.get(summary.id) === 1 ? 'vez' : 'vezes'}` : 'Não lido'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {subjectTopics.length === 0 && floatingSummaries.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                Nenhum tema encontrado para esta matéria.
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // 4. Subjects list (Root level)
  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-4 animate-slide-up">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-xp" />
          <h1 className="text-xl font-bold text-foreground">Resumos</h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Conteúdo teórico organizado por matéria. Toque numa matéria para ver os temas.
        </p>

        <div className="space-y-3">
          {subjectsWithSummaries.map(subject => {
            const IconComponent = SUBJECT_UI_MAP[subject.name]?.icon || BookOpenIcon;
            const color = SUBJECT_UI_MAP[subject.name]?.color || "hsl(217 91% 60%)";
            const count = summaries.filter(s => s.subjectId === subject.id).length;
            return (
              <button key={subject.id} onClick={() => setSelectedSubjectId(subject.id)}
                className="w-full flex items-center gap-4 rounded-2xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl"
                  style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                  <IconComponent className="h-6 w-6" style={{ color }} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{subject.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{count} {count === 1 ? 'resumo' : 'resumos'}</p>
                </div>
              </button>
            );
          })}

          {subjectsWithSummaries.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              Nenhum resumo cadastrado no banco de dados.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
