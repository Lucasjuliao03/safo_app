import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { 
  useMentoriaStatus, 
  useMentoriaDiagnostico, 
  useMentoriaEstrategia,
  useStudentInterventions,
  useMentoriaTasks,
  useApplyMentoria
} from "@/hooks/useMentoriaData";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { 
  Target, TrendingUp, AlertCircle, Clock, BookOpen, User, ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function ApplicationForm({ user }: { user: any }) {
  const applyMutation = useApplyMentoria();
  const [form, setForm] = useState({ objective: '', daily_min: '120', text: '' });

  const handleApply = () => {
    if (!user) return;
    if (!form.objective || !form.daily_min) {
       toast.error("Preencha todos os campos obrigatórios");
       return;
    }
    applyMutation.mutate({
      userId: user.id,
      diagForm: {
         objective: form.objective,
         daily_available_minutes: parseInt(form.daily_min),
         history_report: form.text
      }
    }, {
      onSuccess: () => toast.success("Inscrição enviada para a central VIP!")
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center p-6 text-center mt-6 animate-fade-in max-w-md mx-auto">
        <Target className="h-16 w-16 text-primary mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Seja Aluno VIP</h2>
        <p className="text-muted-foreground text-sm mb-8">
          A Mentoria é um acompanhamento rígido da sua execução. Diga-nos quem você é para o mentor analisar o seu perfil.
        </p>

        <div className="w-full bg-card border border-border p-5 rounded-2xl space-y-4 text-left">
           <div>
             <label className="text-xs font-bold text-muted-foreground mb-1 block">Qual é o seu Concurso Alvo? *</label>
             <input type="text" value={form.objective} onChange={e => setForm({...form, objective: e.target.value})} placeholder="Ex: PRF 2026, Receita Federal..." className="w-full p-3 rounded-lg border border-border bg-muted focus:outline-primary text-sm"/>
           </div>
           <div>
             <label className="text-xs font-bold text-muted-foreground mb-1 block">Minutos Líquidos Diários *</label>
             <input type="number" value={form.daily_min} onChange={e => setForm({...form, daily_min: e.target.value})} className="w-full p-3 rounded-lg border border-border bg-muted focus:outline-primary text-sm"/>
           </div>
           <div>
             <label className="text-xs font-bold text-muted-foreground mb-1 block">Qual é a sua maior dificuldade? (Opcional)</label>
             <textarea value={form.text} onChange={e => setForm({...form, text: e.target.value})} placeholder="Sou lento em exatas e perco muito o foco..." className="w-full p-3 rounded-lg border border-border bg-muted focus:outline-primary text-sm h-24 resize-none"/>
           </div>
           
           <button 
             onClick={handleApply} 
             disabled={applyMutation.isPending}
             className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl mt-4 disabled:opacity-50"
           >
             Solicitar Análise de Perfil
           </button>
        </div>
      </div>
    </AppLayout>
  );
}

export default function MentoriaDashboard() {
  const { user } = useAuth();
  
  // Basic Hooks
  const { data: mentoria, isLoading: loadingStatus } = useMentoriaStatus(user?.id);
  const { data: diagnostico, isLoading: loadingDiag } = useMentoriaDiagnostico(user?.id);
  const { data: estrategia, isLoading: loadingEst } = useMentoriaEstrategia(user?.id);
  const { data: intervencoes } = useStudentInterventions(user?.id);

  // Is loading?
  if (loadingStatus || loadingDiag || loadingEst) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center p-8 text-muted-foreground animate-pulse">
           Carregando dados da mentoria...
        </div>
      </AppLayout>
    );
  }

  // Application State UI
  if (mentoria?.status === 'pending') {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
          <Clock className="h-16 w-16 text-warning mb-4 opacity-80" />
          <h2 className="text-xl font-bold text-foreground mb-2">Análise Pendente</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            Seu perfil e diagnóstico foram enviados com sucesso. O mentor fará a triagem e criará a sua estratégia base dentro de algumas horas.
          </p>
        </div>
      </AppLayout>
    );
  }

  // Not enrolled UI
  if (!mentoria || mentoria.status !== 'active') {
    return <ApplicationForm user={user} />;
  }

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-24 space-y-6 animate-fade-in max-w-4xl mx-auto">
        <header>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Target className="h-5 w-5" />
            <span className="font-semibold tracking-wide uppercase text-xs">Visão Geral da Mentoria</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Sua Estratégia</h1>
          <p className="text-sm text-muted-foreground">Diagnóstico, foco atual e correções de rota</p>
        </header>

        {/* Action Cards para as outras sub-telas */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/mentoria/execucao" className="bg-primary text-primary-foreground p-4 rounded-2xl flex flex-col items-start gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
             <div className="bg-white/20 p-2 rounded-xl">
               <BookOpen className="h-5 w-5" />
             </div>
             <div className="text-left">
               <h3 className="font-bold text-sm">Plano do Dia</h3>
               <p className="text-xs text-primary-foreground/80">O que você devia fazer hoje?</p>
             </div>
          </Link>
          
          <Link to="/mentoria/relatorios" className="bg-card border border-border p-4 rounded-2xl flex flex-col items-start gap-3 hover:border-primary/50 transition-colors">
             <div className="bg-muted p-2 rounded-xl">
               <TrendingUp className="h-5 w-5 text-foreground" />
             </div>
             <div className="text-left">
               <h3 className="font-bold text-foreground text-sm">Meu Desempenho</h3>
               <p className="text-xs text-muted-foreground">Métricas das suas missões</p>
             </div>
          </Link>
        </div>

        {/* Diagnóstico Base */}
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2 border-b border-border pb-3">
            <User className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-sm">Seu Diagnóstico Base</h2>
          </div>
          
          {diagnostico ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Objetivo / Alvo</p>
                  <p className="font-bold text-sm bg-muted/50 inline-block px-2 py-1 rounded-md mt-1">{diagnostico.objective || "Não definido"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Tempo Disponível</p>
                  <p className="font-bold text-sm text-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3.5 w-3.5 opacity-50" /> {diagnostico.daily_available_minutes || 0} min / dia
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase mb-2">Matérias Prioritárias</p>
                <div className="flex flex-wrap gap-1.5">
                  {(diagnostico.weak_subjects || []).map((subj: string, i: number) => (
                    <span key={i} className="text-xs bg-destructive/10 text-destructive border border-destructive/20 px-2 py-1 rounded-md font-semibold">{subj}</span>
                  ))}
                  {(diagnostico.weak_subjects?.length === 0) && <span className="text-xs text-muted-foreground">Nenhuma reportada</span>}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">O seu mentor ainda não preencheu o seu diagnóstico de entrada.</p>
          )}
        </section>

        {/* Estratégia de Batalha (Operational Plan) */}
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Target className="h-32 w-32" />
          </div>

          <div className="flex items-center gap-2 mb-2 border-b border-border pb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-sm">Plano de Ação</h2>
          </div>
          
          {estrategia ? (
            <div className="space-y-3 z-10 relative">
               <div className="flex justify-between items-center py-2 border-b border-border/50">
                 <span className="text-sm text-muted-foreground">Padrão de Revisão</span>
                 <span className="font-bold text-sm">{estrategia.review_pattern}</span>
               </div>
               <div className="flex justify-between items-center py-2 border-b border-border/50">
                 <span className="text-sm text-muted-foreground">Meta Limite (Questões Semanais)</span>
                 <span className="font-bold text-sm">{estrategia.weekly_questions_target}</span>
               </div>
               <div className="flex justify-between items-center py-2">
                 <span className="text-sm text-muted-foreground">Frequência de Simulados</span>
                 <span className="font-bold text-sm">A cada {estrategia.simulate_frequency_days} dias</span>
               </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sua estratégia macro ainda está sendo desenhada.</p>
          )}
        </section>

        {/* Intervenções do Mentor */}
        <section className="space-y-3">
          <h2 className="font-bold text-sm pl-2">Logs do Mentor</h2>
          {intervencoes && intervencoes.length > 0 ? (
            <div className="space-y-3">
              {intervencoes.map((log: any) => (
                <div key={log.id} className="bg-muted/30 border border-border rounded-xl p-4 text-sm relative">
                   <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl opacity-30"></div>
                   <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleDateString('pt-BR')}</span>
                   </div>
                   <p className="font-semibold text-foreground mb-1">Motivo: <span className="font-normal">{log.reason}</span></p>
                   <p className="text-muted-foreground text-xs leading-relaxed">
                     <span className="font-semibold text-foreground">Ação adotada:</span> {log.action_taken}
                   </p>
                </div>
              ))}
            </div>
          ) : (
             <div className="bg-card border border-border outline outline-1 outline-dashed outline-primary/20 rounded-xl p-6 text-center">
               <p className="text-xs font-semibold text-muted-foreground">Nenhuma correção de rota ativa ainda.</p>
             </div>
          )}
        </section>

      </div>
    </AppLayout>
  );
}
