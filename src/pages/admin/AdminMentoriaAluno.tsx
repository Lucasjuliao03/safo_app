import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { 
  useMentoriaDiagnostico, 
  useMentoriaEstrategia, 
  useAdminUpsertDiagnostico,
  useAdminRegisterIntervention,
  useStudentInterventions,
  useAdminGenerateTasks,
  useAdminStudentTasks
} from "@/hooks/useMentoriaData";
import { useSubjects } from "@/hooks/useStudyData";
import { TaskType, MentoriaTarefa } from "@/services/mentoriaService";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, Target, Settings, Activity, PenTool, CheckCircle, Calendar, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AdminMentoriaAluno() {
  const { id } = useParams<{ id: string }>();
  const { user: admin } = useAuth();
  
  const { data: diagnostico, isLoading: loadingDiag } = useMentoriaDiagnostico(id);
  const { data: estrategia, isLoading: loadingEst } = useMentoriaEstrategia(id);
  const { data: intervencoes } = useStudentInterventions(id);
  const { data: subjects = [] } = useSubjects();
  const { data: historyTasks = [] } = useAdminStudentTasks(id);
  
  const diagMutation = useAdminUpsertDiagnostico();
  const interventionMutation = useAdminRegisterIntervention();
  const generateMutation = useAdminGenerateTasks();

  const [activeTab, setActiveTab] = useState<'diagnostico' | 'plano' | 'intervencao' | 'historico'>('plano');
  const [diagForm, setDiagForm] = useState({ objective: '', daily_available_minutes: 0, mentor_notes: '' });
  const [intervencaoForm, setIntervencaoForm] = useState({ reason: '', action_taken: '' });

  // Generator State
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [genForm, setGenForm] = useState({
    startDate: tomorrow.toISOString().split('T')[0],
    days: 7,
    blockMinutes: 60,
    subjectIds: [] as string[],
    types: ['theory', 'questions', 'review'] as TaskType[]
  });

  const toggleSubject = (sid: string) => setGenForm(s => ({
    ...s, subjectIds: s.subjectIds.includes(sid) ? s.subjectIds.filter(id => id !== sid) : [...s.subjectIds, sid]
  }));
  const toggleType = (tt: TaskType) => setGenForm(s => ({
    ...s, types: s.types.includes(tt) ? s.types.filter(t => t !== tt) : [...s.types, tt]
  }));

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

  const handleGenerate = () => {
    if (!id) return;
    if (genForm.subjectIds.length === 0) return toast.error("Selecione pelo menos uma matéria.");
    if (genForm.types.length === 0) return toast.error("Selecione os tipos de estudo.");

    const dailyMin = diagnostico?.daily_available_minutes || 120;
    const blocksPerDay = Math.floor(dailyMin / genForm.blockMinutes) || 1;
    
    let tasks: Omit<MentoriaTarefa, 'id' | 'created_at' | 'updated_at' | 'completed_at'>[] = [];
    let subjectIndex = 0;
    let typeIndex = 0;

    for (let dayOffset = 0; dayOffset < genForm.days; dayOffset++) {
      const d = new Date(genForm.startDate + 'T12:00:00Z');
      d.setDate(d.getDate() + dayOffset);
      const plannedDate = d.toISOString().split('T')[0];

      for (let block = 0; block < blocksPerDay; block++) {
         const sid = genForm.subjectIds[subjectIndex % genForm.subjectIds.length];
         const tt = genForm.types[typeIndex % genForm.types.length];
         const subjectName = subjects.find((s: any) => s.id === sid)?.name || "Matéria";

         let title = "";
         if (tt === 'theory') title = `Teoria: ${subjectName}`;
         else if (tt === 'questions') title = `Minibateria de Questões: ${subjectName}`;
         else if (tt === 'review') title = `Revisão Ativa: ${subjectName}`;
         else if (tt === 'reading') title = `Cartões / Leitura: ${subjectName}`;
         else title = `Estudar ${subjectName}`;

         tasks.push({
           user_id: id,
           planned_date: plannedDate,
           task_type: tt,
           subject_id: sid,
           title,
           description: "Estudo gerado automaticamente pelo mentor baseando-se no seu edital principal e deficiências mapeadas.",
           planned_minutes: genForm.blockMinutes,
           status: 'pending',
           actual_minutes: null,
           actual_questions: null,
           student_notes: null
         } as any);

         subjectIndex++;
         if (subjectIndex % genForm.subjectIds.length === 0) typeIndex++; // Cycle types after all subjects
      }
    }

    generateMutation.mutate(tasks, {
       onSuccess: () => {
         toast.success(`Foram agendadas ${tasks.length} missões diárias com sucesso!`);
         setGenForm(prev => ({...prev, subjectIds: []})); // Reset to require re-interaction
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
           <button onClick={() => setActiveTab('historico')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'historico' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
             Histórico de Lotes
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
          <div className="bg-card border border-border p-6 rounded-2xl space-y-6">
             <div className="flex items-center gap-2 border-b border-border pb-3">
                <Calendar className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">Gerador Automático de Ciclo</h3>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="space-y-4 md:col-span-1">
                 <div>
                   <label className="text-xs font-semibold text-muted-foreground">Início do Ciclo</label>
                   <input type="date" value={genForm.startDate} onChange={e => setGenForm({...genForm, startDate: e.target.value})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm focus:outline-primary/50" />
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-muted-foreground">Duração (Dias)</label>
                   <input type="number" min="1" max="30" value={genForm.days} onChange={e => setGenForm({...genForm, days: parseInt(e.target.value)})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm focus:outline-primary/50" />
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-muted-foreground">Tempo p/ Matéria (Minutos)</label>
                   <input type="number" step="15" value={genForm.blockMinutes} onChange={e => setGenForm({...genForm, blockMinutes: parseInt(e.target.value)})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm focus:outline-primary/50" />
                   <p className="text-[10px] text-muted-foreground mt-1">Tempo líquido diário: {diagnostico?.daily_available_minutes || 120} min (Renderiza ~{Math.floor((diagnostico?.daily_available_minutes || 120) / genForm.blockMinutes)} tarefas/dia)</p>
                 </div>
               </div>

               <div className="space-y-4 md:col-span-2">
                 <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-2 block">Matérias do Ciclo</label>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-2 bg-muted/30 p-2 rounded-lg border border-border">
                      {subjects.map((sub: any) => (
                        <label key={sub.id} className="flex items-center gap-2 text-xs hover:bg-muted p-1 rounded cursor-pointer">
                          <input type="checkbox" checked={genForm.subjectIds.includes(sub.id)} onChange={() => toggleSubject(sub.id)} className="rounded border-border text-primary focus:ring-primary h-3 w-3" />
                          <span className="truncate">{sub.name}</span>
                        </label>
                      ))}
                    </div>
                 </div>

                 <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-2 block">Tipos de Estudo</label>
                    <div className="flex flex-wrap gap-2">
                      {[ 
                        { id: 'theory', label: 'Teoria' }, 
                        { id: 'questions', label: 'Questões' }, 
                        { id: 'review', label: 'Revisão' }, 
                        { id: 'reading', label: 'Leitura Dirigida' } 
                      ].map(tt => (
                        <button 
                          key={tt.id} 
                          onClick={() => toggleType(tt.id as TaskType)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${genForm.types.includes(tt.id as TaskType) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}
                        >
                          {tt.label}
                        </button>
                      ))}
                    </div>
                 </div>
               </div>
             </div>

             <div className="pt-4 border-t border-border flex justify-end">
               <button 
                 onClick={handleGenerate} 
                 disabled={generateMutation.isPending}
                 className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
               >
                 <Play className="h-4 w-4" fill="currentColor" />
                 Gerar Plano e Agendar Lote
               </button>
             </div>
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="bg-card border border-border p-6 rounded-2xl space-y-6">
             <div className="flex items-center gap-2 border-b border-border pb-3">
                <Activity className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">Histórico de Execução (Timeline)</h3>
             </div>
             <div>
               <p className="text-sm text-muted-foreground mb-4">Total de missões mapeadas no lote atual do aluno: {historyTasks.length}</p>
               
               <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                 {/* Group by date in memory */}
                 {Array.from(new Set(historyTasks.map((t: any) => t.planned_date))).sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime()).map(date => (
                    <div key={date as string} className="relative pl-6 border-l-2 border-border space-y-3 pb-6">
                      <div className="absolute -left-2 top-0 bg-primary h-4 w-4 rounded-full border-4 border-card"></div>
                      <h4 className="font-bold text-foreground text-sm flex items-center gap-2">
                         {new Date((date as string) + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                      </h4>
                      <div className="grid gap-2">
                         {historyTasks.filter((t: any) => t.planned_date === date).map((task: any) => (
                           <div key={task.id} className="bg-muted/40 border border-border p-3 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
                             <div>
                                <p className="font-semibold">{task.title}</p>
                                <p className="text-xs text-muted-foreground">{task.subjects?.name || "Matéria"} • {task.planned_minutes} minutos previstos</p>
                             </div>
                             <div className="flex items-center gap-3">
                                <span className={cn(
                                  "text-xs px-2 py-1 rounded-md font-bold uppercase",
                                  task.status === 'completed' ? "bg-success/20 text-success" :
                                  task.status === 'skipped' ? "bg-destructive/20 text-destructive" :
                                  "bg-warning/20 text-warning"
                                )}>
                                  {task.status === 'pending' ? 'Pendente' : task.status === 'skipped' ? 'Falhou / Pulou' : 'Concluído'}
                                </span>
                                {task.status === 'completed' && (
                                   <div className="text-right text-xs bg-card border border-border p-1.5 rounded-md">
                                     <p className="font-bold text-primary">{task.actual_minutes || 0} min reais</p>
                                     <p className="text-muted-foreground">{task.actual_questions || 0} questões</p>
                                   </div>
                                )}
                             </div>
                           </div>
                         ))}
                      </div>
                    </div>
                 ))}
                 
                 {historyTasks.length === 0 && (
                   <div className="text-center p-10 text-muted-foreground">
                      Nenhuma missão foi agendada para este aluno ainda.
                   </div>
                 )}
               </div>
             </div>
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
