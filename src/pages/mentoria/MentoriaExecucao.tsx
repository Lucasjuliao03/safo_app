import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMentoriaStatus, useMentoriaTasks, useCheckInTask } from "@/hooks/useMentoriaData";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { CheckCircle, Clock, FileText, ChevronLeft, CalendarClock, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MentoriaTarefa } from "@/services/mentoriaService";

export default function MentoriaExecucao() {
  const { user } = useAuth();
  
  const localToday = new Date();
  const today = localToday.toISOString().split('T')[0];
  
  const searchParams = new URLSearchParams(window.location.search);
  const initialDate = searchParams.get('date') || today;
  
  const [selectedDate, setSelectedDate] = useState(initialDate);
  
  const daysHorizon = Array.from({ length: 7 }, (_, i) => {
    const baseDate = new Date(selectedDate + 'T12:00:00Z');
    baseDate.setDate(baseDate.getDate() + i - 3); // Center dynamically (-3 to +3 days)
    return baseDate.toISOString().split('T')[0];
  });

  const { data: mentoria, isLoading: loadingStatus } = useMentoriaStatus(user?.id);
  const { data: tasks = [], isLoading: loadingTasks } = useMentoriaTasks(user?.id, selectedDate, selectedDate);
  const checkInMutation = useCheckInTask();

  const [activeTask, setActiveTask] = useState<MentoriaTarefa | null>(null);
  const [actualMinutes, setActualMinutes] = useState("");
  const [actualQuestions, setActualQuestions] = useState("");
  const [studentNotes, setStudentNotes] = useState("");

  if (loadingStatus || loadingTasks) {
    return <AppLayout><div className="flex justify-center p-8 text-muted-foreground">Carregando plano do dia...</div></AppLayout>;
  }

  if (!mentoria || mentoria.status !== 'active') {
    return <AppLayout><BlockedOverlay reason="expired" /></AppLayout>;
  }

  const handleOpenTask = (task: MentoriaTarefa) => {
    setActiveTask(task);
    setActualMinutes(task.actual_minutes ? String(task.actual_minutes) : "");
    setActualQuestions(task.actual_questions ? String(task.actual_questions) : "");
    setStudentNotes(task.student_notes || "");
  };

  const handleSaveCheckIn = (status: 'completed' | 'delayed') => {
    if (!activeTask || !user) return;
    
    checkInMutation.mutate({
      taskId: activeTask.id,
      userId: user.id,
      payload: {
        status,
        actual_minutes: actualMinutes ? parseInt(actualMinutes) : null,
        actual_questions: actualQuestions ? parseInt(actualQuestions) : null,
        student_notes: studentNotes,
      }
    }, {
      onSuccess: () => {
        toast.success(status === 'completed' ? "Tarefa concluída!" : "Atraso reportado ao mentor.");
        setActiveTask(null);
      }
    });
  };

  if (activeTask) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-6 animate-slide-up max-w-md mx-auto">
          <button onClick={() => setActiveTask(null)} className="flex items-center gap-1 text-sm text-primary font-medium">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <header>
            <h1 className="text-xl font-bold text-foreground">{activeTask.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">Disciplina: {activeTask.subjects?.name || "Geral"}</p>
          </header>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            {activeTask.description && (
              <div className="bg-muted p-3 rounded-lg text-sm text-foreground mb-4 border-l-2 border-primary">
                "{activeTask.description}"
              </div>
            )}

            <div className="flex justify-between text-sm text-muted-foreground pb-4 border-b border-border">
               <span>Meta prevista: <strong className="text-foreground">{activeTask.planned_minutes || 0} min</strong></span>
            </div>

            <div className="space-y-4 pt-2">
              <h3 className="font-bold text-sm">Realidade do Estudo de Hoje</h3>
              
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase opacity-80 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Tempo Líquido Gasto (minutos)
                </label>
                <input
                  type="number"
                  value={actualMinutes}
                  onChange={(e) => setActualMinutes(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-primary/50"
                  placeholder="Ex: 90"
                />
              </div>

              {(activeTask.task_type === 'questions' || activeTask.task_type === 'simulation') && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase opacity-80 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Questões Resolvidas
                  </label>
                  <input
                    type="number"
                    value={actualQuestions}
                    onChange={(e) => setActualQuestions(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-primary/50"
                    placeholder="Ex: 30"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase opacity-80 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" /> Desabafo / Notas (Opcional)
                </label>
                <textarea
                  value={studentNotes}
                  onChange={(e) => setStudentNotes(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm h-24 resize-none focus:outline-primary/50"
                  placeholder="Dificuldades com a CESPE..."
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
               <button 
                 onClick={() => handleSaveCheckIn('delayed')}
                 disabled={checkInMutation.isPending}
                 className="flex-1 py-3 px-4 bg-muted text-muted-foreground font-bold rounded-xl text-sm border border-border hover:bg-muted/80 disabled:opacity-50 transition"
               >
                 Tive Imprevistos (Atrasar)
               </button>
               <button 
                 onClick={() => handleSaveCheckIn('completed')}
                 disabled={checkInMutation.isPending}
                 className="flex-1 py-3 px-4 bg-success text-success-foreground font-bold rounded-xl text-sm hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2"
               >
                 <CheckCircle className="w-4 h-4" /> Concluído
               </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Task List View
  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-24 space-y-6 max-w-4xl mx-auto animate-fade-in">
        <header>
          <div className="flex items-center justify-between mb-1">
            <Link to="/mentoria" className="text-primary text-xs font-bold uppercase hover:underline">← Visão Geral</Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Plano de Ação</h1>
          <p className="text-sm text-muted-foreground">Suas tarefas escaladas pelo mentor</p>
        </header>

        {/* Date Horizon Picker */}
        <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth">
          {daysHorizon.map(date => {
             const d = new Date(date + 'T12:00:00Z');
             const isSelected = selectedDate === date;
             const isToday = today === date;
             return (
               <button 
                 key={date}
                 onClick={() => setSelectedDate(date)}
                 className={cn(
                   "flex flex-col items-center justify-center min-w-[3.5rem] py-2 rounded-xl border transition-all shrink-0",
                   isSelected ? "bg-primary text-primary-foreground border-primary shadow-md scale-105" : "bg-card border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                 )}
               >
                 <span className="text-[10px] font-bold uppercase mb-0.5">{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                 <span className="text-sm font-black">{d.getDate()}</span>
                 {isToday && <span className={cn("text-[9px] mt-0.5 font-bold", isSelected ? "text-primary-foreground/80" : "text-primary")}>HOJE</span>}
               </button>
             )
          })}
        </div>

        <div className="space-y-3">
          {tasks.length > 0 ? tasks.map((task: MentoriaTarefa) => {
            const isCompleted = task.status === 'completed';
            const isDelayed = task.status === 'delayed';

            return (
              <button 
                key={task.id} 
                onClick={() => handleOpenTask(task)}
                className={cn(
                  "w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition-all active:scale-[0.98]",
                  isCompleted ? "bg-success/5 border-success/30 shadow-sm" : 
                  isDelayed ? "bg-warning/5 border-warning/30" : "bg-card border-border hover:border-primary/40 shadow-sm"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-xl border shrink-0",
                  isCompleted ? "bg-success/20 border-success/30 text-success" : 
                  isDelayed ? "bg-warning/20 border-warning/30 text-warning" : "bg-primary/10 border-primary/20 text-primary"
                )}>
                  {isCompleted ? <CheckCircle className="h-6 w-6" /> : 
                   isDelayed ? <CalendarClock className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-semibold truncate", isCompleted && "text-muted-foreground line-through")}>{task.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.subjects?.name || "Instrução Geral"}</p>
                </div>
                <div className="shrink-0 text-right">
                   {isCompleted ? (
                     <span className="text-[10px] font-bold text-success uppercase tracking-wider bg-success/10 px-2 py-1 rounded">Feito</span>
                   ) : isDelayed ? (
                     <span className="text-[10px] font-bold text-warning uppercase tracking-wider bg-warning/10 px-2 py-1 rounded">Atrasado</span>
                   ) : (
                     <span className="text-xs font-semibold text-foreground/50">{task.planned_minutes} min</span>
                   )}
                </div>
              </button>
            );
          }) : (
             <div className="bg-card border border-border border-dashed rounded-3xl p-8 text-center mt-4">
                <CheckCircle className="h-10 w-10 text-success/50 mx-auto mb-3" />
                <h3 className="font-bold text-foreground">Dia Livre!</h3>
                <p className="text-muted-foreground text-sm mt-1">O seu mentor não escalou nenhuma tarefa para hoje.</p>
             </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
