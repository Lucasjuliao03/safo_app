import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { 
  useMentoriaDiagnostico, 
  useMentoriaEstrategia, 
  useAdminUpsertDiagnostico,
  useAdminRegisterIntervention,
  useStudentInterventions,
  useAdminGenerateTasks,
  useAdminStudentTasks,
  useAdminDeleteIntervencao,
  useAdminUpdateIntervencao,
  useAdminDeleteTask,
  useAdminUpdateTask
} from "@/hooks/useMentoriaData";
import { useSubjects, useTopics, useUserProfile } from "@/hooks/useStudyData";
import { useStudentEvolution } from "@/hooks/useStudentEvolution";
import { TaskType, MentoriaTarefa } from "@/services/mentoriaService";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, Target, Settings, Activity, PenTool, CheckCircle, Calendar, Play, BrainCircuit, Pencil, Trash2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AdminMentoriaAluno() {
  const { id } = useParams<{ id: string }>();
  const { user: admin } = useAuth();
  
  // 1. Obter Profile do Aluno
  const { data: profile } = useUserProfile(id);
  const courseId = profile?.course_id ? String(profile.course_id) : undefined;

  // 5. Invocar Evolução do Estudante
  const { data: evolution, isLoading: loadingEvolution } = useStudentEvolution(id, courseId || null);

  const { data: diagnostico, isLoading: loadingDiag } = useMentoriaDiagnostico(id);
  const { data: estrategia, isLoading: loadingEst } = useMentoriaEstrategia(id);
  const { data: intervencoes } = useStudentInterventions(id);
  const { data: historyTasks = [] } = useAdminStudentTasks(id);
  
  // 2. Filtrar subjects e topics por courseId
  const { data: subjects = [] } = useSubjects(courseId);
  const { data: topics = [] } = useTopics(courseId);
  
  const diagMutation = useAdminUpsertDiagnostico();
  const interventionMutation = useAdminRegisterIntervention();
  const generateMutation = useAdminGenerateTasks();
  const deleteIntervencaoMutation = useAdminDeleteIntervencao(id);
  const updateIntervencaoMutation = useAdminUpdateIntervencao(id);
  const deleteTaskMutation = useAdminDeleteTask(id);
  const updateTaskMutation = useAdminUpdateTask(id);

  const [activeTab, setActiveTab] = useState<'diagnostico' | 'plano' | 'intervencao' | 'historico'>('plano');
  const [diagForm, setDiagForm] = useState({ objective: '', daily_available_minutes: 0, mentor_notes: '' });
  const [intervencaoForm, setIntervencaoForm] = useState({ reason: '', action_taken: '' });
  
  // Edit states
  const [editingInterv, setEditingInterv] = useState<{ id: string; reason: string; action_taken: string } | null>(null);
  const [editingTask, setEditingTask] = useState<{ id: string; title: string; description: string; planned_minutes: number; planned_date: string } | null>(null);

  // Generator State
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [genForm, setGenForm] = useState({
    startDate: tomorrow.toISOString().split('T')[0],
    days: 7,
    blockMinutes: 60,
    subjectIds: [] as string[],
    topicIds: [] as string[],
    topicsText: "", // Fallback
    smartMode: false,
    types: ['theory', 'questions', 'review'] as TaskType[]
  });

  const toggleSubject = (sid: string) => setGenForm(s => ({
    ...s, subjectIds: s.subjectIds.includes(sid) ? s.subjectIds.filter(id => id !== sid) : [...s.subjectIds, sid]
  }));
  const toggleTopic = (tid: string) => setGenForm(s => ({
    ...s, topicIds: s.topicIds.includes(tid) ? s.topicIds.filter(id => id !== tid) : [...s.topicIds, tid]
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

  useEffect(() => {
    handleLoadDiagForm();
  }, [diagnostico]);

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
    
    // Process selected topics
    const customTopics = genForm.topicsText.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    // Build Schedule Array based on Smart Mode
    let scheduleBlueprint: { sid: string, tid: string | null }[] = [];
    
    if (genForm.smartMode && evolution && evolution.subjectProgress) {
        // Build weighted array based on performance deficit
        genForm.subjectIds.forEach(sid => {
           const prog = evolution.subjectProgress.find(p => p.id === sid);
           let weight = 1; // Default
           if (prog) {
              if (prog.questionsPercent < 15) weight = 3;       // Very weak or unstudied
              else if (prog.questionsPercent < 45) weight = 2; // Weak
              else weight = 1;                                 // Good
           } else {
              weight = 3; // No data = prioritize studying
           }
           
           // Fetch selected topic IDs for this subject
           const subTopicsSelected = genForm.topicIds.filter(tid => {
              const t = topics.find((tt: any) => tt.id.toString() === tid);
              return t && t.subject_id.toString() === sid.toString();
           });

           for (let i = 0; i < weight; i++) {
              if (subTopicsSelected.length > 0) {
                 scheduleBlueprint.push({ sid, tid: subTopicsSelected[i % subTopicsSelected.length] });
              } else {
                 scheduleBlueprint.push({ sid, tid: null });
              }
           }
        });
        
        // Sort specifically: weaker subjects are pushed to front if we wanted. 
        // But weight makes them appear more times in the robin loop.
    } else {
        // Sequential Mode
        genForm.subjectIds.forEach(sid => {
           const subTopicsSelected = genForm.topicIds.filter(tid => {
              const t = topics.find((tt: any) => tt.id.toString() === tid);
              return t && t.subject_id.toString() === sid.toString();
           });

           if (subTopicsSelected.length > 0) {
              subTopicsSelected.forEach(tid => {
                 scheduleBlueprint.push({ sid, tid });
              });
           } else {
              scheduleBlueprint.push({ sid, tid: null });
           }
        });
    }

    let tasks: Omit<MentoriaTarefa, 'id' | 'created_at' | 'updated_at' | 'completed_at'>[] = [];
    let blueprintIndex = 0;
    let typeIndex = 0;
    let customTopicIndex = 0;

    for (let dayOffset = 0; dayOffset < genForm.days; dayOffset++) {
      const d = new Date(genForm.startDate + 'T12:00:00Z');
      d.setDate(d.getDate() + dayOffset);
      const plannedDate = d.toISOString().split('T')[0];

      for (let block = 0; block < blocksPerDay; block++) {
         const bp = scheduleBlueprint[blueprintIndex % scheduleBlueprint.length];
         const sid = bp.sid;
         const tt = genForm.types[typeIndex % genForm.types.length];
         
         const subjectName = subjects.find((s: any) => s.id === sid)?.name || "Matéria";
         
         let currentTopic = "";
         if (bp.tid) {
            currentTopic = topics.find((t: any) => t.id.toString() === bp.tid)?.name || "";
         } else if (customTopics.length > 0) {
            currentTopic = customTopics[customTopicIndex % customTopics.length];
            customTopicIndex++;
         }
         
         const baseName = currentTopic ? currentTopic : subjectName;

         let title = "";
         if (tt === 'theory') title = `Teoria: ${baseName}`;
         else if (tt === 'questions') title = `Minibateria de Questões: ${baseName}`;
         else if (tt === 'review') title = `Revisão Ativa: ${baseName}`;
         else if (tt === 'reading') title = `Cartões / Leitura: ${baseName}`;
         else title = `Estudar ${baseName}`;

         tasks.push({
           user_id: id,
           planned_date: plannedDate,
           task_type: tt,
           subject_id: sid,
           title,
           description: genForm.smartMode 
             ? "Estudo gerado com MOTOR INTELIGENTE priorizando seus maiores déficits diagnosticados na plataforma." 
             : "Estudo gerado automaticamente pelo mentor baseando-se no seu edital principal.",
           planned_minutes: genForm.blockMinutes,
           status: 'pending',
           actual_minutes: null,
           actual_questions: null,
           student_notes: null
         } as any);

         blueprintIndex++;
         if (blueprintIndex % scheduleBlueprint.length === 0) {
            typeIndex++; 
         }
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
              <h2 className="font-bold flex items-center gap-2"><Target className="h-4 w-4" /> Diagnóstico do Aluno</h2>
            </div>

            {diagnostico?.history_report && (
              <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl space-y-2 mb-4">
                 <h3 className="text-xs font-bold text-warning uppercase">Relato do Aluno na Inscrição</h3>
                 <p className="text-sm text-foreground/80 italic">"{diagnostico.history_report}"</p>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Objetivo Principal / Concurso Declarado</label>
                <input type="text" value={diagForm.objective} onChange={e => setDiagForm({...diagForm, objective: e.target.value})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm focus:outline-primary/50" placeholder="Ex: PRF 2026" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Minutos Diários Disponíveis Declarados</label>
                <input type="number" value={diagForm.daily_available_minutes} onChange={e => setDiagForm({...diagForm, daily_available_minutes: parseInt(e.target.value)})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm focus:outline-primary/50" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Observações Privadas do Mentor</label>
                <textarea value={diagForm.mentor_notes} onChange={e => setDiagForm({...diagForm, mentor_notes: e.target.value})} className="w-full bg-muted border border-border rounded-lg p-2 mt-1 text-sm h-24 focus:outline-primary/50" placeholder="O aluno parece ansioso demais nas sextas-feiras..." />
              </div>

              <button onClick={saveDiagnostico} disabled={diagMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90">
                Salvar Diagnóstico Final
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
                    <div className="flex items-center justify-between mb-2">
                       <label className="text-xs font-semibold text-muted-foreground block">Matérias e Temas do Ciclo</label>
                    </div>
                    <div className="max-h-64 overflow-y-auto pr-2 bg-muted/30 p-3 rounded-lg border border-border space-y-3">
                      {subjects.map((sub: any) => {
                        const subTopics = topics.filter((t: any) => t.subject_id.toString() === sub.id.toString());
                        const isSubChecked = genForm.subjectIds.includes(sub.id);
                        
                        return (
                          <div key={sub.id} className="space-y-1">
                            <label className="flex items-center gap-2 text-sm font-bold hover:bg-muted p-1 rounded cursor-pointer">
                              <input type="checkbox" checked={isSubChecked} onChange={() => toggleSubject(sub.id)} className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5" />
                              <span className="truncate">{sub.name}</span>
                            </label>
                            
                            {isSubChecked && subTopics.length > 0 && (
                               <div className="pl-6 space-y-1 mt-1 border-l-2 border-primary/20 ml-2">
                                 {subTopics.map((topic: any) => (
                                    <label key={topic.id} className="flex items-center gap-2 text-xs hover:bg-muted p-1 rounded cursor-pointer text-muted-foreground">
                                      <input type="checkbox" checked={genForm.topicIds.includes(topic.id.toString())} onChange={() => toggleTopic(topic.id.toString())} className="rounded border-border text-primary/70 focus:ring-primary h-3 w-3" />
                                      <span className="truncate">{topic.name}</span>
                                    </label>
                                 ))}
                               </div>
                            )}
                            {isSubChecked && subTopics.length === 0 && (
                               <div className="pl-6 mt-1 ml-2 text-[10px] text-muted-foreground italic">
                                 Nenhum tema listado no banco. O plano usará apenas o nome da matéria.
                               </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                 </div>

                 <div className="pt-2">
                    <label className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl cursor-pointer hover:bg-primary/10 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={genForm.smartMode} 
                        onChange={(e) => setGenForm({...genForm, smartMode: e.target.checked})} 
                        className="mt-0.5 rounded border-primary text-primary focus:ring-primary h-4 w-4" 
                      />
                      <div>
                        <span className="text-sm font-bold text-foreground flex items-center gap-1.5"><BrainCircuit className="h-4 w-4 text-primary"/> Agendamento Inteligente (Déficit)</span>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Altera a distribuição linear. Avalia o `StudentEvolution` para descobrir a % de rendimento das matérias selecionadas. Joga pro topo e repete mais vezes as Matérias com pior rendimento / não estudadas.</p>
                      </div>
                    </label>
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
                           <div key={task.id} className="bg-muted/40 border border-border p-3 rounded-xl text-sm space-y-2">
                             {editingTask?.id === task.id ? (
                               <div className="space-y-2">
                                 <input value={editingTask.title} onChange={e => setEditingTask({ ...editingTask, title: e.target.value })} className="w-full bg-muted border border-border rounded p-2 text-xs" placeholder="Título da tarefa" />
                                 <textarea value={editingTask.description} onChange={e => setEditingTask({ ...editingTask, description: e.target.value })} className="w-full bg-muted border border-border rounded p-2 text-xs h-12 resize-none" placeholder="Descrição" />
                                 <div className="flex gap-2">
                                   <div className="flex-1">
                                     <label className="text-[10px] text-muted-foreground">Minutos previstos</label>
                                     <input type="number" value={editingTask.planned_minutes} onChange={e => setEditingTask({ ...editingTask, planned_minutes: parseInt(e.target.value) })} className="w-full bg-muted border border-border rounded p-1.5 text-xs" />
                                   </div>
                                   <div className="flex-1">
                                     <label className="text-[10px] text-muted-foreground">Data planejada</label>
                                     <input type="date" value={editingTask.planned_date} onChange={e => setEditingTask({ ...editingTask, planned_date: e.target.value })} className="w-full bg-muted border border-border rounded p-1.5 text-xs" />
                                   </div>
                                 </div>
                                 <div className="flex gap-2">
                                   <button onClick={() => updateTaskMutation.mutate({ id: editingTask.id, title: editingTask.title, description: editingTask.description, planned_minutes: editingTask.planned_minutes, planned_date: editingTask.planned_date }, { onSuccess: () => { toast.success('Tarefa atualizada!'); setEditingTask(null); } })} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-bold"><Save className="h-3 w-3"/> Salvar</button>
                                   <button onClick={() => setEditingTask(null)} className="flex items-center gap-1 px-3 py-1 bg-muted border border-border rounded text-xs"><X className="h-3 w-3"/> Cancelar</button>
                                 </div>
                               </div>
                             ) : (
                               <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                 <div>
                                   <p className="font-semibold">{task.title}</p>
                                   <p className="text-xs text-muted-foreground">{task.subjects?.name || 'Matéria'} · {task.planned_minutes} min previstos</p>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <span className={cn("text-xs px-2 py-1 rounded-md font-bold uppercase", task.status === 'completed' ? 'bg-success/20 text-success' : task.status === 'skipped' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning')}>{task.status === 'pending' ? 'Pendente' : task.status === 'skipped' ? 'Falhou' : 'Concluído'}</span>
                                   {task.status === 'completed' && (
                                     <div className="text-right text-xs bg-card border border-border p-1.5 rounded-md">
                                       <p className="font-bold text-primary">{task.actual_minutes || 0} min</p>
                                       <p className="text-muted-foreground">{task.actual_questions || 0} q.</p>
                                     </div>
                                   )}
                                   <button onClick={() => setEditingTask({ id: task.id, title: task.title, description: task.description || '', planned_minutes: task.planned_minutes || 60, planned_date: task.planned_date })} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"><Pencil className="h-3.5 w-3.5" /></button>
                                   <button onClick={() => { if (confirm('Excluir esta tarefa?')) deleteTaskMutation.mutate(task.id, { onSuccess: () => toast.success('Tarefa excluída.') }); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"><Trash2 className="h-3.5 w-3.5" /></button>
                                 </div>
                               </div>
                             )}
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
                   <div key={int.id} className="text-sm bg-muted/40 p-3 rounded-lg border border-border/50 space-y-2">
                     <div className="flex items-center justify-between">
                       <p className="text-xs text-muted-foreground">{new Date(int.created_at).toLocaleString('pt-BR')}</p>
                       <div className="flex gap-1">
                         <button onClick={() => setEditingInterv({ id: int.id, reason: int.reason, action_taken: int.action_taken })} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"><Pencil className="h-3 w-3" /></button>
                         <button onClick={() => { if (confirm('Excluir esta intervenção?')) deleteIntervencaoMutation.mutate(int.id, { onSuccess: () => toast.success('Excluído.') }); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"><Trash2 className="h-3 w-3" /></button>
                       </div>
                     </div>
                     {editingInterv?.id === int.id ? (
                       <div className="space-y-2">
                         <textarea value={editingInterv.reason} onChange={e => setEditingInterv({ ...editingInterv, reason: e.target.value })} className="w-full bg-muted border border-border rounded p-2 text-xs h-16 resize-none" placeholder="Motivo" />
                         <textarea value={editingInterv.action_taken} onChange={e => setEditingInterv({ ...editingInterv, action_taken: e.target.value })} className="w-full bg-muted border border-border rounded p-2 text-xs h-16 resize-none" placeholder="Ação" />
                         <div className="flex gap-2">
                           <button onClick={() => updateIntervencaoMutation.mutate({ id: editingInterv.id, reason: editingInterv.reason, action_taken: editingInterv.action_taken }, { onSuccess: () => { toast.success('Atualizado!'); setEditingInterv(null); } })} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-bold"><Save className="h-3 w-3"/> Salvar</button>
                           <button onClick={() => setEditingInterv(null)} className="flex items-center gap-1 px-3 py-1 bg-muted border border-border rounded text-xs"><X className="h-3 w-3"/> Cancelar</button>
                         </div>
                       </div>
                     ) : (
                       <>
                         <p><strong>Motivo:</strong> {int.reason}</p>
                         <p className="text-muted-foreground"><strong>Ação:</strong> {int.action_taken}</p>
                       </>
                     )}
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
