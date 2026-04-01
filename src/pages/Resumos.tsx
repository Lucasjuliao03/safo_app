import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { FileText, ChevronLeft, BookOpen, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useSubjects, useSummaries, SUBJECT_UI_MAP } from "@/hooks/useStudyData";
import { canAccessSummaries, isUserActive } from "@/services/accessService";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

export default function ResumosPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const courseId = user?.courseId ? String(user.courseId) : null;
  const { data: subjects = [], isLoading: loadingSub } = useSubjects(isAdmin ? undefined : courseId);
  const { data: summaries = [], isLoading: loadingSum } = useSummaries();
  const qc = useQueryClient();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);
  const [viewedSummaryIds, setViewedSummaryIds] = useState<Set<string>>(new Set());

  // Carregar resumos já visualizados do banco
  useEffect(() => {
    if (user?.id) {
      const loadViewedSummaries = async () => {
        const { data } = await supabase
          .from('user_summary_views')
          .select('summary_id')
          .eq('user_id', user.id);
        
        if (data) {
          setViewedSummaryIds(new Set(data.map((v: any) => v.summary_id)));
        }
      };
      loadViewedSummaries();
    }
  }, [user?.id]);

  const updateMissionProgress = async (userId: string, summaryId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Registrar visualização do resumo
      await supabase.from('user_summary_views').upsert({
        user_id: userId,
        summary_id: summaryId,
        viewed_date: today,
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
        qc.invalidateQueries({ queryKey: ['userStreakStats'] });
        qc.invalidateQueries({ queryKey: ['userProductivity'] });
      }
    } catch (e) {
      console.error('[Resumos] Erro ao atualizar missão:', e);
    }
  };

  if (loadingSub || loadingSum) {
    return <AppLayout><div className="p-8 text-center text-muted-foreground">Carregando resumos...</div></AppLayout>;
  }

  const active = isUserActive(user);
  
  const viewedStr = localStorage.getItem(`viewed_summaries_${user?.id}`) || "[]";
  const viewedSummaries: string[] = JSON.parse(viewedStr);
  const readCount = viewedSummaries.length;
  const summaryLimitReached = !canAccessSummaries(user, readCount);

  if (!active) {
    return <AppLayout><BlockedOverlay reason="expired" /></AppLayout>;
  }

  if (summaryLimitReached && !user?.isApproved && !selectedSummaryId) {
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
    const isNewlyViewed = !viewedSummaryIds.has(id) && !viewedSummaries.includes(id);
    
    if (!user?.isApproved && isNewlyViewed) {
      if (readCount >= 2) return;
    }
    
    if (isNewlyViewed && user?.id) {
      updateMissionProgress(user.id, id);
    }
    
    setSelectedSummaryId(id);
  };

  // Group summaries by subject
  const subjectsWithSummaries = subjects.filter(s =>
    summaries.some(sum => sum.subjectId === s.id)
  );

  // View a specific summary
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
              {subject?.icon ?? "📖"} {subject?.name ?? "Geral"}
            </Badge>
          </div>

          <h1 className="text-xl font-bold text-foreground">{summary.title}</h1>

          <div className="rounded-2xl bg-card border border-border p-5">
            {summary.contentHtml ? (
              <div className="prose prose-sm prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: summary.contentHtml }} />
            ) : summary.contentMarkdown ? (
              <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {summary.contentMarkdown}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Conteúdo indisponível.</p>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // View summaries for a subject
  if (selectedSubjectId) {
    const subject = subjects.find(s => s.id === selectedSubjectId);
    const subjectSummaries = summaries.filter(s => s.subjectId === selectedSubjectId);

    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-4 animate-slide-up">
          <button onClick={() => setSelectedSubjectId(null)}
            className="flex items-center gap-1 text-sm text-primary font-medium">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <div className="flex items-center gap-2">
            <span className="text-2xl">{subject?.icon ?? "📖"}</span>
            <h1 className="text-xl font-bold text-foreground">{subject?.name ?? "Resumos"}</h1>
          </div>

          <div className="space-y-2">
            {subjectSummaries.map(summary => (
              <button key={summary.id} onClick={() => handleSelectSummary(summary.id)}
                className="w-full flex items-center gap-3 rounded-xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{summary.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.format === 'html' ? 'HTML' : summary.format === 'markdown' ? 'Markdown' : 'PDF'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Subjects list
  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-4 animate-slide-up">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-xp" />
          <h1 className="text-xl font-bold text-foreground">Resumos</h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Conteúdo teórico organizado por matéria. Toque para ler.
        </p>

        <div className="space-y-3">
          {subjectsWithSummaries.map(subject => {
            const count = summaries.filter(s => s.subjectId === subject.id).length;
            const ui = SUBJECT_UI_MAP[subject.name] || { icon: "📖", color: "hsl(217 91% 60%)" };
            return (
              <button key={subject.id} onClick={() => setSelectedSubjectId(subject.id)}
                className="w-full flex items-center gap-4 rounded-2xl bg-card border border-border p-4 text-left transition-all hover:border-primary/40 active:scale-[0.98]">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
                  style={{ background: `${ui.color}15`, border: `1px solid ${ui.color}30` }}>
                  {ui.icon}
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
