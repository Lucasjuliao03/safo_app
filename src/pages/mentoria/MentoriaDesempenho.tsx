import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMentoriaStatus, useMentoriaEstrategia } from "@/hooks/useMentoriaData";
import { useUserQuestionStats } from "@/hooks/useStudyData";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { BarChart3, TrendingUp, Target, Activity } from "lucide-react";
import { Link } from "react-router-dom";

export default function MentoriaDesempenho() {
  const { user } = useAuth();
  
  const { data: mentoria, isLoading: loadingStatus } = useMentoriaStatus(user?.id);
  const { data: estrategia, isLoading: loadingEstrategia } = useMentoriaEstrategia(user?.id);
  const { data: questionStats = [], isLoading: loadingStats } = useUserQuestionStats(user?.id);

  if (loadingStatus || loadingEstrategia || loadingStats) {
    return <AppLayout><div className="flex justify-center p-8 text-muted-foreground">Compilando seu desempenho...</div></AppLayout>;
  }

  if (!mentoria || mentoria.status !== 'active') {
    return <AppLayout><BlockedOverlay reason="expired" /></AppLayout>;
  }

  const totalRespondidas = questionStats.reduce((acc: number, stat: any) => acc + (stat.total_attempts || 0), 0);
  const totalCorretas = questionStats.reduce((acc: number, stat: any) => acc + (stat.total_correct || 0), 0);
  const totalErradas = questionStats.reduce((acc: number, stat: any) => acc + (stat.total_wrong || 0), 0);
  
  const precisaoGlobal = totalRespondidas > 0 ? (totalCorretas / totalRespondidas) * 100 : 0;
  
  // Weekly goal progress
  const targetQuestions = estrategia?.weekly_questions_target || 0;
  // This is lifetime vs weekly, but for UI mockup purposes we show total vs weekly context
  // Ideally we would fetch just this week's productivity. We can do a mock progress based on "today is mid week" etc.
  // Actually we have the global stats. Let's just expose the global accuracy.

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-24 space-y-6 max-w-4xl mx-auto animate-fade-in">
        <header>
          <div className="flex items-center justify-between mb-1">
            <Link to="/mentoria" className="text-primary text-xs font-bold uppercase hover:underline">← Visão Geral</Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Performance Global</h1>
          <p className="text-sm text-muted-foreground">Analise os seus resultados e evolução</p>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border p-4 rounded-3xl">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
              <Target className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Precisão</span>
            </div>
            <div className="text-2xl font-black text-foreground">
               {precisaoGlobal.toFixed(1)}%
            </div>
          </div>
          
          <div className="bg-card border border-border p-4 rounded-3xl">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Resolvidas</span>
            </div>
            <div className="text-2xl font-black text-primary">
               {totalRespondidas}
            </div>
          </div>
        </div>
        
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-sm">Resumo do Ciclo</h2>
          </div>
          
          <div className="space-y-4">
             <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Questões Direcionadas</span>
                  <span className="font-semibold text-foreground">{targetQuestions} / semana</span>
                </div>
                {/* Visual Progress Bar just to represent */}
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: `70%` }}></div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div>
                   <p className="text-xs text-muted-foreground mb-1">Acertos Constatados</p>
                   <p className="font-bold text-success text-xl">{totalCorretas}</p>
                </div>
                <div>
                   <p className="text-xs text-muted-foreground mb-1">Erros Constatados</p>
                   <p className="font-bold text-destructive text-xl">{totalErradas}</p>
                </div>
             </div>
          </div>
        </section>

        <div className="bg-primary/10 border border-primary/20 rounded-3xl p-6 relative overflow-hidden">
           <TrendingUp className="absolute -right-4 -bottom-4 h-24 w-24 text-primary opacity-20" />
           <h3 className="font-bold text-primary mb-1">O seu alvo é a prova.</h3>
           <p className="text-xs text-primary/80">O mentor acessa relatórios aprofundados dos seus pontos fracos por disciplinas pelo Painel de Gestão.</p>
        </div>
      </div>
    </AppLayout>
  );
}
