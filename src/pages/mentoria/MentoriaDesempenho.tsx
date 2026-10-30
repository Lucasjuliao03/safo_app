import { useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { StudyLoadError } from '@/components/StudyLoadError';
import { useAuth } from "@/contexts/AuthContext";
import { useMentoriaStatus, useAdminStudentTasks } from "@/hooks/useMentoriaData";
import { useUserQuestionStats } from "@/hooks/useStudyData";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { 
  BarChart3, TrendingUp, Target, Activity, CheckCircle, XCircle, 
  Clock, BookOpen, AlertTriangle, Zap, Award, CalendarCheck
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

function InsightCard({ icon: Icon, label, value, sub, color }: { icon: any, label: string, value: string | number, sub?: string, color: string }) {
  return (
    <div className={cn("bg-card border border-border p-4 rounded-2xl", color)}>
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-black text-foreground">{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number, max: number, color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={cn("h-2 rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function MentoriaDesempenho() {
  const { user } = useAuth();
  
  const { data: mentoria, isLoading: loadingStatus, error: statusError } = useMentoriaStatus(user?.id);
  const { data: allTasks = [], isLoading: loadingTasks, error: tasksError } = useAdminStudentTasks(user?.id);
  const { data: questionStats = [], isLoading: loadingStats } = useUserQuestionStats(user?.id);

  const metrics = useMemo(() => {
    const tasks = allTasks as any[];

    // --- Task Metrics ---
    const totalTasks     = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const delayedTasks   = tasks.filter(t => t.status === 'delayed' || t.status === 'skipped').length;
    const pendingTasks   = tasks.filter(t => t.status === 'pending').length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // --- Days ---
    const daysWithTasks = new Set(tasks.map(t => t.planned_date)).size;
    const daysDone      = new Set(tasks.filter(t => t.status === 'completed').map(t => t.planned_date)).size;

    // --- Time ---
    const totalPlannedMinutes = tasks.reduce((a: number, t: any) => a + (t.planned_minutes || 0), 0);
    const totalActualMinutes  = tasks.filter((t: any) => t.status === 'completed')
      .reduce((a: number, t: any) => a + (t.actual_minutes || t.planned_minutes || 0), 0);

    // --- Questões do check-in ---
    const totalMentoriaQuestions = tasks
      .filter((t: any) => t.status === 'completed' && t.actual_questions)
      .reduce((a: number, t: any) => a + (t.actual_questions || 0), 0);

    // --- Por Matéria (com breakdown de tipo de tarefa) ---
    const subjectMap: Record<string, {
      name: string;
      totalMinutes: number;
      completedMinutes: number;
      totalTasks: number;
      completedTasks: number;
      questions: number;
      byType: Record<string, { total: number; done: number }>;
    }> = {};

    tasks.forEach((t: any) => {
      const key  = t.subject_id || 'sem_materia';
      const name = t.subjects?.name || 'Instrução Geral';
      const type = t.task_type || 'theory';

      if (!subjectMap[key]) {
        subjectMap[key] = { name, totalMinutes: 0, completedMinutes: 0, totalTasks: 0, completedTasks: 0, questions: 0, byType: {} };
      }
      if (!subjectMap[key].byType[type]) {
        subjectMap[key].byType[type] = { total: 0, done: 0 };
      }

      subjectMap[key].totalTasks++;
      subjectMap[key].totalMinutes += t.planned_minutes || 0;
      subjectMap[key].byType[type].total++;

      if (t.status === 'completed') {
        subjectMap[key].completedTasks++;
        subjectMap[key].completedMinutes += t.actual_minutes || t.planned_minutes || 0;
        subjectMap[key].questions += t.actual_questions || 0;
        subjectMap[key].byType[type].done++;
      }
    });

    const subjectList = Object.values(subjectMap)
      .filter(s => s.name !== 'Instrução Geral')
      .sort((a, b) => b.completedMinutes - a.completedMinutes);

    // --- Questões da plataforma ---
    const totalQuestRespondidas = (questionStats as any[]).reduce((a, s) => a + (s.total_attempts   || 0), 0);
    const totalQuestCorretas    = (questionStats as any[]).reduce((a, s) => a + (s.total_correct    || 0), 0);
    const precisaoGlobal        = totalQuestRespondidas > 0 ? (totalQuestCorretas / totalQuestRespondidas) * 100 : 0;

    // --- Insights ---
    const insights: string[] = [];
    if (completionRate >= 80) insights.push("🔥 Você está em ritmo excelente! Taxa de conclusão acima de 80%.");
    else if (completionRate > 0 && completionRate < 50) insights.push("⚠️ Atenção: você completou menos da metade das tarefas planejadas.");
    if (delayedTasks > 5) insights.push(`📌 Você acumulou ${delayedTasks} atrasos. Revise sua rotina com o mentor.`);
    if (totalActualMinutes >= totalPlannedMinutes * 0.9 && totalPlannedMinutes > 0) insights.push("⏱️ Seu tempo real está alinhado com o planejado. Constância acima da média!");
    if (precisaoGlobal >= 70) insights.push(`🎯 Precisão global de ${precisaoGlobal.toFixed(0)}% nas questões da plataforma. Continue firme.`);
    else if (precisaoGlobal > 0 && precisaoGlobal < 50) insights.push(`⚠️ Precisão de ${precisaoGlobal.toFixed(0)}% nas questões. Revise os conteúdos com mais erros.`);

    return {
      totalTasks, completedTasks, delayedTasks, pendingTasks, completionRate,
      daysWithTasks, daysDone, totalPlannedMinutes, totalActualMinutes,
      totalMentoriaQuestions, subjectList,
      totalQuestRespondidas, totalQuestCorretas, precisaoGlobal, insights,
    };
  }, [allTasks, questionStats]);


  if (statusError || tasksError) return <AppLayout><StudyLoadError error={statusError || tasksError}
    fallbackMessage="Não foi possível carregar os dados da sua mentoria. Tente novamente ou entre em contato com o suporte." /></AppLayout>;
  if (loadingStatus || loadingTasks || loadingStats) {
    return <AppLayout><div className="flex justify-center p-8 text-muted-foreground animate-pulse">Compilando seu desempenho...</div></AppLayout>;
  }

  if (!mentoria || mentoria.status !== 'active') {
    return <AppLayout><BlockedOverlay reason="expired" /></AppLayout>;
  }

  const fmtH = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
  };

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-24 space-y-6 max-w-4xl mx-auto animate-fade-in">
        <header>
          <div className="flex items-center justify-between mb-1">
            <Link to="/mentoria" className="text-primary text-xs font-bold uppercase hover:underline">← Visão Geral</Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Meu Desempenho</h1>
          <p className="text-sm text-muted-foreground">Analytics completo das suas missões de mentoria</p>
        </header>

        {/* --- KPIs Grid --- */}
        <div className="grid grid-cols-2 gap-3">
          <InsightCard icon={CheckCircle}  label="Tarefas Concluídas" value={metrics.completedTasks} sub={`de ${metrics.totalTasks} planejadas`} color="" />
          <InsightCard icon={XCircle}      label="Não Realizadas" value={metrics.delayedTasks} sub="atrasadas ou puladas" color="" />
          <InsightCard icon={Clock}        label="Horas de Estudo" value={fmtH(metrics.totalActualMinutes)} sub={`previsto: ${fmtH(metrics.totalPlannedMinutes)}`} color="" />
          <InsightCard icon={Target}       label="Questões (Plat.)" value={metrics.totalQuestRespondidas} sub={`${metrics.precisaoGlobal.toFixed(0)}% de acerto`} color="" />
        </div>

        {/* --- Completion Overview --- */}
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-sm">Execução do Ciclo</h2>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Taxa de Conclusão</span>
                <span className="font-bold text-foreground">{metrics.completionRate.toFixed(0)}%</span>
              </div>
              <ProgressBar value={metrics.completedTasks} max={metrics.totalTasks} color="bg-success" />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="text-center p-3 rounded-xl bg-success/10 border border-success/20">
                <p className="text-xl font-black text-success">{metrics.completedTasks}</p>
                <p className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase">Feitas</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-warning/10 border border-warning/20">
                <p className="text-xl font-black text-warning">{metrics.pendingTasks}</p>
                <p className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase">Pendentes</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="text-xl font-black text-destructive">{metrics.delayedTasks}</p>
                <p className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase">Atrasadas</p>
              </div>
            </div>

            <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Dias com tarefas</p>
                <p className="font-bold text-foreground">{metrics.daysWithTasks} dias</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dias totalmente cumpridos</p>
                <p className="font-bold text-foreground">{metrics.daysDone} dias</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Tempo e Questões --- */}
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-sm">Tempo & Questões</h2>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Tempo real vs previsto</span>
                <span className="font-bold">{fmtH(metrics.totalActualMinutes)} / {fmtH(metrics.totalPlannedMinutes)}</span>
              </div>
              <ProgressBar value={metrics.totalActualMinutes} max={metrics.totalPlannedMinutes} color="bg-primary" />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <p className="text-xs text-muted-foreground">Questões (Check-in)</p>
                <p className="text-xl font-black text-foreground mt-1">{metrics.totalMentoriaQuestions}</p>
                <p className="text-[10px] text-muted-foreground">via check-ins do ciclo</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <p className="text-xs text-muted-foreground">Precisão Geral</p>
                <p className={cn("text-xl font-black mt-1", metrics.precisaoGlobal >= 70 ? "text-success" : metrics.precisaoGlobal >= 50 ? "text-warning" : "text-destructive")}>
                  {metrics.precisaoGlobal.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground">questões da plataforma</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Por Matéria (detalhado) --- */}
        {metrics.subjectList.length > 0 && (
          <section className="bg-card border border-border rounded-3xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">Por Matéria</h2>
              <span className="ml-auto text-[10px] text-muted-foreground">{metrics.subjectList.length} matérias</span>
            </div>

            <div className="space-y-5">
              {metrics.subjectList.slice(0, 12).map((sub, i) => {
                const completionPct = sub.totalTasks > 0 ? Math.round((sub.completedTasks / sub.totalTasks) * 100) : 0;
                const typeLabels: Record<string, string> = {
                  theory: 'Teoria', questions: 'Questões', review: 'Revisão', reading: 'Leitura', simulation: 'Simulado'
                };
                const typeColors: Record<string, string> = {
                  theory: 'bg-blue-500/20 text-blue-600', questions: 'bg-primary/15 text-primary',
                  review: 'bg-warning/20 text-warning', reading: 'bg-success/20 text-success',
                  simulation: 'bg-destructive/15 text-destructive',
                };

                return (
                  <div key={i} className="space-y-2">
                    {/* Matéria + tempo */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">{sub.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {sub.completedTasks}/{sub.totalTasks} tarefas concluídas
                          {sub.questions > 0 && ` · ${sub.questions} questões`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-foreground">{fmtH(sub.completedMinutes)}</p>
                        <p className="text-[10px] text-muted-foreground">de {fmtH(sub.totalMinutes)}</p>
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    <ProgressBar value={sub.completedTasks} max={sub.totalTasks} color={
                      completionPct >= 80 ? 'bg-success' :
                      completionPct >= 40 ? 'bg-primary' : 'bg-warning'
                    } />

                    {/* Breakdown de tipos */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {Object.entries(sub.byType).map(([type, counts]) => (
                        <span
                          key={type}
                          className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", typeColors[type] || 'bg-muted text-muted-foreground')}
                        >
                          {typeLabels[type] || type}: {counts.done}/{counts.total}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}


        {/* --- Insights --- */}
        {metrics.insights.length > 0 && (
          <section className="bg-card border border-border rounded-3xl p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Zap className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">Insights do Sistema</h2>
            </div>
            <div className="space-y-2">
              {metrics.insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-muted/30 rounded-xl border border-border text-sm">
                  <span className="leading-relaxed">{insight}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="bg-primary/10 border border-primary/20 rounded-3xl p-5 relative overflow-hidden">
           <TrendingUp className="absolute -right-4 -bottom-4 h-24 w-24 text-primary opacity-20" />
           <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-primary text-sm">Foco máximo.</h3>
           </div>
           <p className="text-xs text-primary/80">O mentor acessa relatórios ainda mais aprofundados com análise por tópico no Painel de Gestão.</p>
        </div>
      </div>
    </AppLayout>
  );
}
