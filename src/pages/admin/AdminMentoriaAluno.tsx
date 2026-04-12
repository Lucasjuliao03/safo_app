import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { 
  useMentoriaDiagnostico, 
  useMentoriaEstrategia, 
  useAdminUpsertDiagnostico,
  useAdminRegisterIntervention,
  useStudentInterventions
} from "@/hooks/useMentoriaData";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, Target, Settings, Activity, PenTool, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminMentoriaAluno() {
  const { id } = useParams<{ id: string }>();
  const { user: admin } = useAuth();
  
  const { data: diagnostico, isLoading: loadingDiag } = useMentoriaDiagnostico(id);
  const { data: estrategia, isLoading: loadingEst } = useMentoriaEstrategia(id);
  const { data: intervencoes } = useStudentInterventions(id);
  
  const diagMutation = useAdminUpsertDiagnostico();
  const interventionMutation = useAdminRegisterIntervention();

  const [activeTab, setActiveTab] = useState<'diagnostico' | 'plano' | 'intervencao'>('diagnostico');
  const [diagForm, setDiagForm] = useState({ objective: '', daily_available_minutes: 0, mentor_notes: '' });
  const [intervencaoForm, setIntervencaoForm] = useState({ reason: '', action_taken: '' });

  // Simplified form copy trigger
  const handleLoadDiagForm = () => {
    if (diagnostico) {
      setDiagForm({
        objective: diagnostico.objective || '',
        daily_available_minutes: diagnostico.daily_available_minutes || 0,
        mentor_notes: diagnostico.mentor_notes || '',
      });
    }
  };

  const saveDiagnostico = () => {
    if (!id) return;
    diagMutation.mutate({
      user_id: id,
      ...diagForm
    }, {
      onSuccess: () => toast.success("Diagnóstico atualizado.")
    });
  };
  
  const saveIntervention = () => {
    if (!id || !admin) return;
    if (!intervencaoForm.reason || !intervencaoForm.action_taken) {
       toast.error("Preencha o motivo e a ação adotada.");
       return;
    }
    interventionMutation.mutate({
       userId: id,
       mentorId: admin.id,
       reason: intervencaoForm.reason,
       action_taken: intervencaoForm.action_taken
    }, {
       onSuccess: () => {
         toast.success("Intervenção registrada com sucesso!");
         setIntervencaoForm({ reason: '', action_taken: '' });
       }
    });
  };

  if (loadingDiag || loadingEst) {
    return <AdminLayout><div className="p-8">Carregando ficha do aluno...</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-5xl">
        <header className="flex items-center gap-3 mb-6">
          <Link to="/painel/mentoria" className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Ficha do Aluno</h1>
            <p className="text-sm text-muted-foreground break-all">ID: {id}</p>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex bg-muted/50 p-1 rounded-xl w-fit">
           <button onClick={() => setActiveTab('diagnostico')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'diagnostico' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
             Diagnóstico
           </button>
           <button onClick={() => setActiveTab('plano')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'plano' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
             Plano de Ação (V1)
           </button>
           <button onClick={() => setActiveTab('intervencao')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'intervencao' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
             Correção de Rota
           </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'diagnostico' && (
          <div className="bg-card border border-border p-5 rounded-2xl space-y-4 max-w-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-bold flex items-center gap-2"><Target className="h-4 w-4" /> Dados Base</h2>
              <button onClick={handleLoadDiagForm} className="text-xs text-primary font-bold hover:underline">Carregar Atual</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Objetivo Principal / Concurso</label>
                <input type="text" value={diagForm.objective} onChange={e => setDiagForm({...diagForm, objective: e.target.value})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm focus:outline-primary/50" placeholder="Ex: PRF 2026" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Minutos Diários Disponíveis</label>
                <input type="number" value={diagForm.daily_available_minutes} onChange={e => setDiagForm({...diagForm, daily_available_minutes: parseInt(e.target.value)})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm focus:outline-primary/50" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Observações Privadas do Mentor</label>
                <textarea value={diagForm.mentor_notes} onChange={e => setDiagForm({...diagForm, mentor_notes: e.target.value})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm h-24 focus:outline-primary/50" placeholder="O aluno parece ansioso demais nas sextas-feiras..." />
              </div>

              <button onClick={saveDiagnostico} disabled={diagMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90">
                Salvar Diagnóstico
              </button>
            </div>
          </div>
        )}

        {activeTab === 'plano' && (
          <div className="bg-card border border-border border-dashed p-10 rounded-2xl text-center space-y-3">
             <Settings className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
             <h3 className="font-bold">Gerador de Ciclo Semanal</h3>
             <p className="text-sm text-muted-foreground max-w-sm mx-auto">Em breve: um gerador de tarefas em lote onde você seleciona "Seg a Sex: 2 matérias por dia" e ele distribui automaticamente as missões no banco de dados do estudante.</p>
          </div>
        )}

        {activeTab === 'intervencao' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border border-border p-5 rounded-2xl space-y-4">
              <h2 className="font-bold flex items-center gap-2 border-b border-border pb-3"><PenTool className="h-4 w-4" /> Registrar Intervenção</h2>
              <div className="space-y-4 text-sm">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Motivo do Ajuste (O que deu errado?)</label>
                  <textarea value={intervencaoForm.reason} onChange={e => setIntervencaoForm({...intervencaoForm, reason: e.target.value})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 h-20" placeholder="Constância do aluno despencou nos últimos simulados." />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Ação Realizada</label>
                  <textarea value={intervencaoForm.action_taken} onChange={e => setIntervencaoForm({...intervencaoForm, action_taken: e.target.value})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 h-20" placeholder="Reduzimos o volume de vídeo e aumentamos resolução de questões." />
                </div>
                <button onClick={saveIntervention} disabled={interventionMutation.isPending} className="px-4 py-2 bg-warning text-warning-foreground font-bold rounded-lg w-full hover:opacity-90 transition-opacity">
                  Gravar Correção Diário
                </button>
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-2xl space-y-4">
               <h2 className="font-bold flex items-center gap-2 border-b border-border pb-3"><Activity className="h-4 w-4" /> Histórico de Correções</h2>
               <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                 {intervencoes && intervencoes.length > 0 ? intervencoes.map((int: any) => (
                   <div key={int.id} className="text-sm bg-muted/40 p-3 rounded-lg border border-border/50">
                     <p className="text-xs text-muted-foreground mb-1">{new Date(int.created_at).toLocaleString('pt-BR')}</p>
                     <p><strong>Motivo:</strong> {int.reason}</p>
                     <p className="text-muted-foreground mt-1"><strong>Ação:</strong> {int.action_taken}</p>
                   </div>
                 )) : <p className="text-sm text-muted-foreground">Nenhuma correção registrada para este aluno.</p>}
               </div>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
