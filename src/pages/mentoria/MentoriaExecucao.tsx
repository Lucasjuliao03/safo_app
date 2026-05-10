import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMentoriaStatus, useMentoriaTasks, useCheckInTask } from "@/hooks/useMentoriaData";
import { BlockedOverlay } from "@/components/BlockedOverlay";
import { CheckCircle, Clock, FileText, ChevronLeft, CalendarClock, MessageSquare, Play, Square, Timer, BookOpen, Zap, RotateCcw, BookMarked, Dumbbell } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MentoriaTarefa } from "@/services/mentoriaService";

// Helper for Audio (Web Audio API)
const playBeep = (type: 'start' | 'alarm' = 'start') => {
  try {
    const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = actx.createOscillator();
    const gainNode = actx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(actx.destination);
    
    if (type === 'start') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, actx.currentTime);
      gainNode.gain.setValueAtTime(0.1, actx.currentTime);
      osc.start();
      osc.stop(actx.currentTime + 0.15);
    } else {
      // Alarm
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, actx.currentTime);
      osc.frequency.setValueAtTime(800, actx.currentTime + 0.2);
      osc.frequency.setValueAtTime(600, actx.currentTime + 0.4);
      gainNode.gain.setValueAtTime(0.1, actx.currentTime);
      osc.start();
      osc.stop(actx.currentTime + 0.8);
    }
  } catch (e) {
    console.error("Audio API not supported or blocked");
  }
};

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

  // Stopwatch state
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasNotified, setHasNotified] = useState(false);

  useEffect(() => {
    let interval: any;
    if (isRunning) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => {
          const next = prev + 1;
          
          if (activeTask && activeTask.planned_minutes) {
             const limitSeconds = activeTask.planned_minutes * 60;
             if (next >= limitSeconds && !hasNotified) {
                setHasNotified(true);
                playBeep('alarm');
                toast.success("Meta de tempo atingida! Você pode continuar ou pausar o cronômetro.");
             }
          }
          
          return next;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRunning, activeTask, hasNotified]);

  const toggleTimer = () => {
    if (!isRunning) {
       playBeep('start');
       setIsRunning(true);
    } else {
       setIsRunning(false);
       // Auto-fill actual_minutes rounded up using standard math
       const m = Math.floor(elapsedSeconds / 60);
       setActualMinutes(String(m > 0 ? m : 1));
    }
  };

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
    
    // Reset timer on open
    setIsRunning(false);
    setElapsedSeconds(0);
    setHasNotified(false);
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
            <p className="text-sm text-muted-foreground mt-1 text-primary font-medium tracking-tight">
              {activeTask.subjects?.name || "Geral"}
              {activeTask.title.includes('›') && ` — ${activeTask.title.split('›')[1].split('⚠️')[0].split('✅')[0].trim()}`}
            </p>
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
              <div className="space-y-3 bg-card p-4 rounded-xl border border-border">
                <div className="flex items-center justify-between pointer-events-none">
                   <label className="text-xs font-semibold text-muted-foreground uppercase opacity-80 flex items-center gap-1">
                     <Timer className="w-3.5 h-3.5" /> Cronômetro Ativo
                   </label>
                </div>
                
                <div className="flex items-center gap-3">
                   <div className="flex-1 bg-black/5 dark:bg-black/20 font-mono text-3xl font-black tracking-widest text-center py-2 rounded-xl text-primary border border-primary/20">
                     {formatTime(elapsedSeconds)}
                   </div>
                   
                   <button 
                     onClick={toggleTimer}
                     className={cn("w-14 h-14 rounded-xl flex items-center justify-center transition shadow-sm", 
                       isRunning ? "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20" 
                                 : "bg-primary text-primary-foreground stroke-primary-foreground hover:opacity-90")}
                   >
                     {isRunning ? <Square className="w-6 h-6 fill-current"/> : <Play className="w-6 h-6 fill-current ml-1"/>}
                   </button>
                </div>
                {elapsedSeconds > 0 && !isRunning && (
                  <p className="text-[10px] text-muted-foreground text-center animate-fade-in pb-1">
                     Tempo de {Math.floor(elapsedSeconds / 60)} min lançado no formulário abaixo.
                  </p>
                )}
              </div>

              <div className="space-y-1 pt-2">
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

        {/* Resumo do dia */}
        {tasks.length > 0 && (
          <div className="flex items-center justify-between bg-muted/40 border border-border rounded-xl px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">
              <span className="font-bold text-foreground">{tasks.length}</span> {tasks.length === 1 ? 'tarefa' : 'tarefas'} hoje
            </span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span className="font-bold text-foreground">
                {Math.floor((tasks as MentoriaTarefa[]).reduce((s, t) => s + (t.planned_minutes || 0), 0) / 60)}h
                {(tasks as MentoriaTarefa[]).reduce((s, t) => s + (t.planned_minutes || 0), 0) % 60 > 0
                  ? ` ${(tasks as MentoriaTarefa[]).reduce((s, t) => s + (t.planned_minutes || 0), 0) % 60}min`
                  : ''}
              </span>
              &nbsp;planejadas
            </span>
          </div>
        )}

        <div className="space-y-2.5">
          {tasks.length > 0 ? (tasks as MentoriaTarefa[]).map((task) => {
            const isCompleted = task.status === 'completed';
            const isDelayed   = task.status === 'delayed';

            // Ícone e cor por tipo de tarefa
            const typeConfig: Record<string, { icon: React.ComponentType<{className?: string}>, color: string, label: string }> = {
              theory:     { icon: BookOpen,    color: 'text-blue-500',   label: 'Teoria'    },
              questions:  { icon: Zap,         color: 'text-primary',    label: 'Questões'  },
              review:     { icon: RotateCcw,   color: 'text-warning',    label: 'Revisão'   },
              simulation: { icon: Dumbbell,    color: 'text-destructive', label: 'Simulado' },
              reading:    { icon: BookMarked,  color: 'text-success',    label: 'Leitura'   },
            };
            const tc = typeConfig[task.task_type] || typeConfig.theory;
            const TypeIcon = tc.icon;

            // Matéria do banco
            const subjectName = task.subjects?.name || 'Instrução Geral';

            return (
              <button
                key={task.id}
                onClick={() => handleOpenTask(task)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.98]",
                  isCompleted ? "bg-success/5 border-success/30 shadow-sm" :
                  isDelayed   ? "bg-warning/5 border-warning/30" :
                                "bg-card border-border hover:border-primary/40 shadow-sm"
                )}
              >
                {/* Ícone do tipo */}
                <div className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg border shrink-0",
                  isCompleted ? "bg-success/20 border-success/30 text-success" :
                  isDelayed   ? "bg-warning/20 border-warning/30 text-warning" :
                                "bg-muted/60 border-border"
                )}>
                  {isCompleted ? <CheckCircle className="h-4 w-4 text-success" /> :
                   isDelayed   ? <CalendarClock className="h-4 w-4 text-warning" /> :
                                 <TypeIcon className={cn("h-4 w-4", tc.color)} />}
                </div>

                {/* Conteúdo - stack vertical */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {/* Linha 1: Tema (título da tarefa) */}
                  <p className={cn(
                    "text-sm font-semibold text-foreground truncate", 
                    isCompleted && "text-muted-foreground line-through"
                  )} title={task.title}>
                    {task.title}
                  </p>
                  
                  {/* Linha 2: Matéria */}
                  <p className="text-xs text-muted-foreground truncate" title={subjectName}>
                    {subjectName}
                  </p>
                  
                  {/* Linha 3: Tipo de estudo */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      tc.color === 'text-blue-500' ? "bg-blue-500/10 text-blue-600" :
                      tc.color === 'text-primary' ? "bg-primary/10 text-primary" :
                      tc.color === 'text-warning' ? "bg-warning/10 text-warning" :
                      tc.color === 'text-destructive' ? "bg-destructive/10 text-destructive" :
                      tc.color === 'text-success' ? "bg-success/10 text-success" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {tc.label}
                    </span>
                    {task.title.includes('⚠️') && (
                      <span className="text-[9px] text-destructive font-bold">⚠️</span>
                    )}
                    {task.title.includes('✅') && (
                      <span className="text-[9px] text-success font-bold">✅</span>
                    )}
                  </div>
                </div>

                {/* Tempo e status */}
                <div className="shrink-0 flex flex-col items-end justify-between h-full py-0.5">
                  {isCompleted ? (
                    <span className="text-[10px] font-bold text-success uppercase tracking-wider bg-success/10 px-2 py-1 rounded">Feito</span>
                  ) : isDelayed ? (
                    <span className="text-[10px] font-bold text-warning uppercase tracking-wider bg-warning/10 px-2 py-1 rounded">Atrasado</span>
                  ) : (
                    <span className="text-xs font-bold text-foreground/70 bg-muted px-2 py-1 rounded">{task.planned_minutes}m</span>
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
