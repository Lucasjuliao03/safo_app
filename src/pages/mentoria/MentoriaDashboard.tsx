import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMentoriaStatus,
  useMentoriaDiagnostico,
  useMentoriaEstrategia,
  useStudentInterventions,
  useMentoriaTasks,
  useApplyMentoria,
  useReDiagnostico,
} from "@/hooks/useMentoriaData";
import { useSubjects, useCourses } from "@/hooks/useStudyData";
import {
  Target, TrendingUp, AlertCircle, Clock, BookOpen, User,
  Calendar, ChevronRight, ChevronLeft, Check, RefreshCcw,
  Sun, Moon, Sunset, Shuffle, Brain, Zap, BookOpenCheck,
  RotateCcw, Flame,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos do Wizard
// ─────────────────────────────────────────────────────────────────────────────
interface WizardForm {
  // Etapa 1 — Agenda
  daily_available_minutes: number;
  study_days_of_week: number[];
  preferred_period: string;
  exam_date: string;
  // Etapa 2 — Nível
  preparation_level: string;
  weak_subjects: string[];
  strong_subjects: string[];
  // Etapa 3 — Estilo
  method_style: string;
  include_simulations: boolean;
  simulation_frequency_days: number;
  review_frequency: string;
  // Etapa 4 — Foco
  current_focus: string;
  schedule_notes: string;
  objective: string;
  exam_date_display?: string; // Campo auxiliar para a UI (DD/MM/AAAA)
}

const DEFAULT_FORM: WizardForm = {
  daily_available_minutes: 120,
  study_days_of_week: [1, 2, 3, 4, 5],
  preferred_period: "variado",
  exam_date: "",
  exam_date_display: "",
  preparation_level: "intermediario",
  weak_subjects: [],
  strong_subjects: [],
  method_style: "misto",
  include_simulations: false,
  simulation_frequency_days: 14,
  review_frequency: "semanal",
  current_focus: "misto",
  schedule_notes: "",
  objective: "",
};

const DAYS_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ─────────────────────────────────────────────────────────────────────────────
// Componentes auxiliares do Wizard
// ─────────────────────────────────────────────────────────────────────────────

function OptionButton({
  selected, onClick, icon: Icon, label, sub,
}: {
  selected: boolean; onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  label: string; sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all active:scale-[0.97]",
        selected
          ? "bg-primary/10 border-primary text-primary"
          : "bg-card border-border text-muted-foreground hover:border-primary/40"
      )}
    >
      {Icon && <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />}
      <span className={cn("font-semibold text-xs leading-tight", selected && "text-primary")}>{label}</span>
      {sub && <span className="text-[10px] leading-tight opacity-70">{sub}</span>}
    </button>
  );
}

function SubjectChips({
  subjects, selected, onChange, color,
}: {
  subjects: string[]; selected: string[];
  onChange: (v: string[]) => void; color: string;
}) {
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(s => s !== name));
    else onChange([...selected, name]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {subjects.map(name => (
        <button
          key={name}
          type="button"
          onClick={() => toggle(name)}
          className={cn(
            "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
            selected.includes(name)
              ? `${color} text-white border-transparent`
              : "bg-card border-border text-muted-foreground hover:border-primary/40"
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard de Onboarding (4 etapas)
// ─────────────────────────────────────────────────────────────────────────────

function OnboardingWizard({
  user,
  initialForm,
  isReDiagnostico,
  onComplete,
}: {
  user: any;
  initialForm?: Partial<WizardForm>;
  isReDiagnostico?: boolean;
  onComplete: () => void;
}) {
  const applyMutation = useApplyMentoria();
  const reDiagMutation = useReDiagnostico();
  const { data: courses = [] } = useCourses();
  const courseId = user?.courseId ? String(user.courseId) : null;
  const { data: subjects = [] } = useSubjects(courseId);

  const subjectNames = subjects.map((s: any) => s.name);
  const currentCourse = courses.find((c: any) => String(c.id) === courseId);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>({
    ...DEFAULT_FORM,
    objective: currentCourse?.name || "",
    ...initialForm,
  });

  const TOTAL_STEPS = 4;
  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const setField = <K extends keyof WizardForm>(key: K, val: WizardForm[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  // Inicializar o campo de exibição da data se já vier preenchido (ex: re-diagnóstico)
  useEffect(() => {
    if (form.exam_date && form.exam_date.includes('-') && !form.exam_date_display) {
      const [y, m, d] = form.exam_date.split('-');
      setField("exam_date_display", `${d}/${m}/${y}`);
    }
  }, [form.exam_date]);

  const toggleDay = (day: number) => {
    const days = form.study_days_of_week;
    if (days.includes(day)) {
      setField("study_days_of_week", days.filter(d => d !== day));
    } else {
      setField("study_days_of_week", [...days, day].sort((a, b) => a - b));
    }
  };

  const canProceed: boolean[] = [
    // Etapa 1: dias e tempo são obrigatórios
    form.daily_available_minutes >= 30 && form.study_days_of_week.length > 0,
    // Etapa 2: ao menos nível selecionado
    !!form.preparation_level,
    // Etapa 3: sempre ok
    true,
    // Etapa 4: sempre ok
    true,
  ];

  const handleSubmit = async () => {
    if (applyMutation.isPending || reDiagMutation.isPending) return;

    const diagPayload = {
      objective:                      form.objective,
      exam_date:                      form.exam_date || null,
      daily_available_minutes:        form.daily_available_minutes,
      strong_subjects:                form.strong_subjects,
      weak_subjects:                  form.weak_subjects,
      history_report:                 form.schedule_notes,
      method_style:                   form.method_style,
      mentor_notes:                   "",
      study_days_of_week:             form.study_days_of_week,
      preferred_period:               form.preferred_period,
      preparation_level:              form.preparation_level,
      include_simulations:            form.include_simulations,
      simulation_frequency_days:      form.simulation_frequency_days,
      review_frequency:               form.review_frequency,
      current_focus:                  form.current_focus,
      schedule_notes:                 form.schedule_notes,
      // Passamos courseId para o hook buscar matérias+temas completos do banco
      courseId:                       courseId,
    } as any;

    const planSubjects = subjects.map((s: any) => ({ id: s.id, name: s.name }));

    // Verificação crítica: sem matérias = plano impossível
    if (planSubjects.length === 0) {
      toast.error('⚠️ Nenhuma matéria encontrada para o seu curso. Peça ao administrador para configurar as matérias do seu curso e tente novamente.');
      return;
    }

    try {
      if (isReDiagnostico) {
        const result = await reDiagMutation.mutateAsync({
          userId: user.id,
          diagForm: diagPayload,
          subjects: planSubjects,
        });
        toast.success(`✅ Plano re-gerado com ${result.tasksCreated} tarefas!`);
      } else {
        const result = await applyMutation.mutateAsync({
          userId: user.id,
          diagForm: diagPayload,
          subjects: planSubjects,
        });
        const examInfo = form.exam_date
          ? ` até a véspera da prova (${new Date(form.exam_date + 'T12:00:00Z').toLocaleDateString('pt-BR')})`
          : ' para as próximas 8 semanas';
        toast.success(`🚀 Mentoria iniciada! ${result?.tasksCreated || 0} tarefas geradas${examInfo}.`);
      }
      onComplete();
    } catch (e: any) {
      toast.error(`Erro ao gerar plano: ${e?.message || 'Tente novamente.'}`);
    }
  };


  const isPending = applyMutation.isPending || reDiagMutation.isPending;

  // ── ETAPA 1 — Agenda e Disponibilidade ────────────────────────────────────
  const Step1 = () => (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">
          ⏱ Minutos líquidos de estudo por dia
        </label>
        <div className="space-y-2">
          <input
            type="range" min={30} max={480} step={30}
            value={form.daily_available_minutes}
            onChange={e => setField("daily_available_minutes", Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="text-center">
            <span className="text-3xl font-black text-primary">{form.daily_available_minutes}</span>
            <span className="text-sm text-muted-foreground ml-1">min/dia</span>
            <p className="text-xs text-muted-foreground mt-1">
              ≈ {Math.floor(form.daily_available_minutes / 60)}h{form.daily_available_minutes % 60 > 0 ? ` ${form.daily_available_minutes % 60}min` : ''} por sessão
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">
          📅 Dias disponíveis para estudar
        </label>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS_LABELS.map((label, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => toggleDay(idx)}
              className={cn(
                "flex flex-col items-center py-2 rounded-xl border text-xs font-bold transition-all",
                form.study_days_of_week.includes(idx)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {form.study_days_of_week.length} dias selecionados · {form.study_days_of_week.length * form.daily_available_minutes} min/semana
        </p>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">
          🕐 Período preferido de estudo
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: "manha", label: "Manhã", sub: "06h–12h", icon: Sun },
            { val: "tarde", label: "Tarde", sub: "12h–18h", icon: Sunset },
            { val: "noite", label: "Noite", sub: "18h–24h", icon: Moon },
            { val: "variado", label: "Variado", sub: "Sem preferência", icon: Shuffle },
          ].map(opt => (
            <OptionButton key={opt.val}
              selected={form.preferred_period === opt.val}
              onClick={() => setField("preferred_period", opt.val)}
              icon={opt.icon} label={opt.label} sub={opt.sub}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
          🗓 Data da sua prova (opcional)
        </label>
        <input
          type="text"
          placeholder="Ex: 25/12/2026"
          value={form.exam_date_display || ""}
          onChange={e => {
            let v = e.target.value.replace(/\D/g, "");
            if (v.length > 8) v = v.slice(0, 8);
            
            // Mascarar para DD/MM/AAAA
            let display = v;
            if (v.length > 4) display = `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;
            else if (v.length > 2) display = `${v.slice(0,2)}/${v.slice(2)}`;
            
            setField("exam_date_display", display);

            // Se completo, salva o valor real YYYY-MM-DD
            if (v.length === 8) {
              const d = v.slice(0,2);
              const m = v.slice(2,4);
              const y = v.slice(4,8);
              setField("exam_date", `${y}-${m}-${d}`);
            } else if (v.length === 0) {
              setField("exam_date", "");
            }
          }}
          className="w-full p-3 rounded-xl border border-border bg-muted text-sm focus:outline-primary transition-all"
        />
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Digite apenas os números. O sistema formata automaticamente.
        </p>
      </div>
    </div>
  );

  // ── ETAPA 2 — Nível Atual ─────────────────────────────────────────────────
  const Step2 = () => (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">
          🎯 Como você se avalia hoje?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: "iniciante", label: "Iniciante", sub: "Começando agora", icon: BookOpen },
            { val: "intermediario", label: "Intermediário", sub: "Já estudando há meses", icon: Brain },
            { val: "avancado", label: "Avançado", sub: "Sólido na base teórica", icon: Zap },
            { val: "reta_final", label: "Reta Final", sub: "Prova próxima", icon: Flame },
          ].map(opt => (
            <OptionButton key={opt.val}
              selected={form.preparation_level === opt.val}
              onClick={() => setField("preparation_level", opt.val)}
              icon={opt.icon} label={opt.label} sub={opt.sub}
            />
          ))}
        </div>
      </div>

      {subjectNames.length > 0 && (
        <>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
              🔴 Matérias de maior dificuldade
            </label>
            <p className="text-xs text-muted-foreground mb-3">Receberão mais tempo no plano.</p>
            <SubjectChips
              subjects={subjectNames}
              selected={form.weak_subjects}
              onChange={v => setField("weak_subjects", v)}
              color="bg-destructive"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
              🟢 Matérias de maior domínio
            </label>
            <p className="text-xs text-muted-foreground mb-3">Receberão menos tempo; foco em manutenção.</p>
            <SubjectChips
              subjects={subjectNames.filter(s => !form.weak_subjects.includes(s))}
              selected={form.strong_subjects}
              onChange={v => setField("strong_subjects", v)}
              color="bg-success"
            />
          </div>
        </>
      )}
    </div>
  );

  // ── ETAPA 3 — Estilo de Estudo ────────────────────────────────────────────
  const Step3 = () => (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">
          📚 O que você prefere fazer mais?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: "teoria", label: "Mais Teoria", sub: "60% leitura / 40% questões", icon: BookOpenCheck },
            { val: "questoes", label: "Mais Questões", sub: "65% questões / 20% teoria", icon: Zap },
            { val: "misto", label: "Misto Equilibrado", sub: "40% questões / 35% teoria", icon: Shuffle },
            { val: "revisao", label: "Revisão Focada", sub: "50% revisão / 30% questões", icon: RotateCcw },
          ].map(opt => (
            <OptionButton key={opt.val}
              selected={form.method_style === opt.val}
              onClick={() => setField("method_style", opt.val)}
              icon={opt.icon} label={opt.label} sub={opt.sub}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">
          🕐 Frequência de revisão espaçada
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { val: "diaria", label: "Diária", sub: "Todo dia" },
            { val: "dois_dias", label: "2 em 2 dias", sub: "A cada 48h" },
            { val: "semanal", label: "Semanal", sub: "Uma vez/sem" },
          ].map(opt => (
            <OptionButton key={opt.val}
              selected={form.review_frequency === opt.val}
              onClick={() => setField("review_frequency", opt.val)}
              label={opt.label} sub={opt.sub}
            />
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Incluir Simulados?</p>
            <p className="text-xs text-muted-foreground">Blocos de treino cronometrado completo</p>
          </div>
          <button
            type="button"
            onClick={() => setField("include_simulations", !form.include_simulations)}
            className={cn(
              "w-12 h-6 rounded-full transition-colors relative",
              form.include_simulations ? "bg-primary" : "bg-muted"
            )}
          >
            <span className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
              form.include_simulations ? "left-7" : "left-1"
            )} />
          </button>
        </div>

        {form.include_simulations && (
          <div className="pt-2 border-t border-border">
            <label className="text-xs font-bold text-muted-foreground block mb-2">
              A cada quantos dias?
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[7, 14, 21, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setField("simulation_frequency_days", days)}
                  className={cn(
                    "py-2 rounded-xl border text-xs font-bold transition-all",
                    form.simulation_frequency_days === days
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted border-border text-muted-foreground"
                  )}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── ETAPA 4 — Foco e Contexto ────────────────────────────────────────────
  const Step4 = () => (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">
          🧭 Qual é seu foco principal agora?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {[
            { val: "teoria", label: "Base Teórica", sub: "Construir fundamentos sólidos. Mais leitura e estudo de conteúdo." },
            { val: "questoes", label: "Treino Intensivo de Questões", sub: "Prática diária com alto volume de questões." },
            { val: "revisao", label: "Revisão Geral", sub: "Consolidar o que foi estudado antes. Ciclos de revisão ampla." },
            { val: "reta_final", label: "Reta Final 🔥", sub: "Prova próxima. Máxima intensidade: questões + revisão focada." },
            { val: "misto", label: "Misto Equilibrado", sub: "Teoria, questões e revisão em proporção balanceada." },
          ].map(opt => (
            <button
              key={opt.val}
              type="button"
              onClick={() => setField("current_focus", opt.val)}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                form.current_focus === opt.val
                  ? "bg-primary/10 border-primary"
                  : "bg-card border-border hover:border-primary/30"
              )}
            >
              <div className={cn(
                "mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                form.current_focus === opt.val ? "border-primary bg-primary" : "border-muted-foreground"
              )}>
                {form.current_focus === opt.val && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <div>
                <p className={cn("font-semibold text-sm", form.current_focus === opt.val && "text-primary")}>{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
          📝 Contexto da sua rotina (opcional)
        </label>
        <textarea
          value={form.schedule_notes}
          onChange={e => setField("schedule_notes", e.target.value)}
          placeholder="Ex: Trabalho de segunda a sábado em plantão 12×36. Meus dias mais livres são terça e quinta..."
          className="w-full p-3 rounded-xl border border-border bg-muted text-sm h-24 resize-none focus:outline-primary"
        />
        <p className="text-xs text-muted-foreground mt-1">O mentor usará isso para ajustar o plano se necessário.</p>
      </div>
    </div>
  );

  const STEPS_CONFIG = [
    { title: "Agenda & Disponibilidade", subtitle: "Quando e quanto você pode estudar?", component: Step1 },
    { title: "Seu Nível Atual", subtitle: "Onde você está hoje?", component: Step2 },
    { title: "Estilo de Estudo", subtitle: "Como você aprende melhor?", component: Step3 },
    { title: "Foco & Contexto", subtitle: "O que é prioridade agora?", component: Step4 },
  ];

  const CurrentStep = STEPS_CONFIG[step].component;

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-28 max-w-lg mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-5 w-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              {isReDiagnostico ? "Atualizar Perfil" : "Configurar Mentoria"}
            </span>
          </div>
          <h1 className="text-2xl font-black text-foreground">{STEPS_CONFIG[step].title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{STEPS_CONFIG[step].subtitle}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-[10px] text-muted-foreground font-bold mb-1.5">
            <span>Etapa {step + 1} de {TOTAL_STEPS}</span>
            <span>{Math.round(progress)}% concluído</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        {CurrentStep()}

        {/* Navigation */}
        <div className="fixed bottom-20 left-0 right-0 px-4 flex gap-3 max-w-lg mx-auto z-10">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted border border-border text-sm font-semibold text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar
            </button>
          )}

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={() => canProceed[step] && setStep(s => s + 1)}
              disabled={!canProceed[step]}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
                canProceed[step]
                  ? "bg-primary text-primary-foreground active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Gerando plano...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  {isReDiagnostico ? "Re-gerar Plano" : "Criar Meu Plano"}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard principal da Mentoria
// ─────────────────────────────────────────────────────────────────────────────

export default function MentoriaDashboard() {
  const { user } = useAuth();
  const [showReDiag, setShowReDiag] = useState(false);

  const { data: mentoria, isLoading: loadingStatus } = useMentoriaStatus(user?.id);
  const { data: diagnostico, isLoading: loadingDiag } = useMentoriaDiagnostico(user?.id);
  const { data: estrategia, isLoading: loadingEst } = useMentoriaEstrategia(user?.id);
  const { data: intervencoes } = useStudentInterventions(user?.id);

  const dateStr = new Date();
  const startOfMonth = new Date(dateStr.getFullYear(), dateStr.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(dateStr.getFullYear(), dateStr.getMonth() + 1, 0).toISOString().split('T')[0];
  const { data: monthTasks = [] } = useMentoriaTasks(user?.id, startOfMonth, endOfMonth);

  if (loadingStatus || loadingDiag || loadingEst) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center p-8 text-muted-foreground animate-pulse">
          Carregando dados da mentoria...
        </div>
      </AppLayout>
    );
  }

  // Mostra wizard de re-diagnóstico
  if (showReDiag && diagnostico) {
    const initialForm: Partial<WizardForm> = {
      daily_available_minutes: diagnostico.daily_available_minutes || 120,
      study_days_of_week: diagnostico.study_days_of_week || [1, 2, 3, 4, 5],
      preferred_period: diagnostico.preferred_period || "variado",
      exam_date: diagnostico.exam_date ? diagnostico.exam_date.split('T')[0] : "",
      preparation_level: diagnostico.preparation_level || "intermediario",
      weak_subjects: diagnostico.weak_subjects || [],
      strong_subjects: diagnostico.strong_subjects || [],
      method_style: diagnostico.method_style || "misto",
      include_simulations: diagnostico.include_simulations || false,
      simulation_frequency_days: diagnostico.simulation_frequency_days || 14,
      review_frequency: diagnostico.review_frequency || "semanal",
      current_focus: diagnostico.current_focus || "misto",
      schedule_notes: diagnostico.schedule_notes || "",
      objective: diagnostico.objective || "",
    };
    return (
      <OnboardingWizard
        user={user}
        initialForm={initialForm}
        isReDiagnostico
        onComplete={() => setShowReDiag(false)}
      />
    );
  }

  // Onboarding inicial: sem mentoria ou sem plano gerado
  if (!mentoria || mentoria.status !== 'active') {
    return <OnboardingWizard user={user} onComplete={() => {}} />;
  }

  // ── Dashboard principal ───────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-24 space-y-6 animate-fade-in max-w-4xl mx-auto">
        <header className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Target className="h-5 w-5" />
              <span className="font-semibold tracking-wide uppercase text-xs">Visão Geral da Mentoria</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Sua Estratégia</h1>
            <p className="text-sm text-muted-foreground">Diagnóstico, foco atual e correções de rota</p>
          </div>
          <button
            onClick={() => setShowReDiag(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted border border-border px-3 py-2 rounded-xl hover:border-primary/50 transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Atualizar Perfil
          </button>
        </header>

        {/* Action Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/mentoria/execucao" className="bg-primary text-primary-foreground p-4 rounded-2xl flex flex-col items-start gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
            <div className="bg-white/20 p-2 rounded-xl">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-sm">Plano do Dia</h3>
              <p className="text-xs text-primary-foreground/80">O que você deve fazer hoje?</p>
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

        {/* Calendário Mensal */}
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">Calendário de Execução</h2>
            </div>
            <span className="text-xs font-bold text-muted-foreground uppercase">
              {dateStr.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((dia, i) => (
              <div key={i} className="text-[10px] font-bold text-muted-foreground mb-1">{dia}</div>
            ))}
            {(() => {
              const daysInMonth = new Date(dateStr.getFullYear(), dateStr.getMonth() + 1, 0).getDate();
              const firstDayIndex = new Date(dateStr.getFullYear(), dateStr.getMonth(), 1).getDay();
              const blanks = Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`blank-${i}`} className="p-2" />
              ));
              const days = Array.from({ length: daysInMonth }).map((_, i) => {
                const dayDate = i + 1;
                const dateKey = `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, '0')}-${String(dayDate).padStart(2, '0')}`;
                const tasksForDay = (monthTasks as any[]).filter(t => t.planned_date === dateKey);
                let bgColor = "bg-muted text-muted-foreground opacity-30";
                if (tasksForDay.length > 0) {
                  const completed = tasksForDay.filter(t => t.status === 'completed').length;
                  const delayed = tasksForDay.filter(t => t.status === 'delayed' || t.status === 'skipped').length;
                  const isPast = new Date(dateKey + 'T12:00:00Z') < new Date(new Date().setHours(0, 0, 0, 0));
                  if (completed === tasksForDay.length) bgColor = "bg-success text-success-foreground font-bold shadow-sm";
                  else if (delayed > 0 || (isPast && completed < tasksForDay.length)) bgColor = "bg-destructive text-destructive-foreground font-bold shadow-sm";
                  else bgColor = "bg-warning text-warning-foreground font-bold shadow-sm";
                } else if (dateKey === new Date().toISOString().split('T')[0]) {
                  bgColor = "bg-primary/20 text-primary border border-primary/50 font-bold";
                }
                const dayTopics = tasksForDay.map((task: any) => {
                  const parts = task.title.split(': ');
                  const raw = parts.length > 1 ? parts[1].trim() : task.title;
                  const ignore = ['de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'em', 'no', 'na'];
                  const words = raw.split(/\s+/).filter((w: string) => w.length > 0 && !ignore.includes(w.toLowerCase()));
                  const abbr = words.length > 1
                    ? words.map((w: string) => w[0].toUpperCase()).join('').substring(0, 4)
                    : (words[0] || '').substring(0, 3).toUpperCase();
                  return { full: raw, abbr };
                });
                const uniqueMap = new Map();
                dayTopics.forEach((t: any) => { if (!uniqueMap.has(t.abbr)) uniqueMap.set(t.abbr, t); });
                const unique = Array.from(uniqueMap.values());
                return (
                  <Link
                    to={`/mentoria/execucao?date=${dateKey}`}
                    key={dayDate}
                    title={Array.from(new Set(dayTopics.map((t: any) => t.full))).join(', ')}
                    className={cn("aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-all hover:scale-105 active:scale-95 hover:shadow-md overflow-hidden p-0.5", bgColor)}
                  >
                    <span className="font-bold">{dayDate}</span>
                    {unique.length > 0 && (
                      <span className="text-[7px] leading-[1] truncate w-full text-center mt-0.5 opacity-90 block px-0.5">
                        {unique.map((t: any) => t.abbr).join(', ')}
                      </span>
                    )}
                  </Link>
                );
              });
              return [...blanks, ...days];
            })()}
          </div>

          <div className="flex items-center justify-center gap-4 pt-2 border-t border-border mt-3">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-success" /><span className="text-[10px] text-muted-foreground">Feito</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-warning" /><span className="text-[10px] text-muted-foreground">Pendente</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-destructive" /><span className="text-[10px] text-muted-foreground">Falhou</span></div>
          </div>
        </section>

        {/* Estratégia + Diagnóstico */}
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Target className="h-32 w-32" />
          </div>

          <div className="flex items-center justify-between mb-2 border-b border-border pb-3 z-10 relative">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">Sua Estratégia de Batalha</h2>
            </div>
            {diagnostico?.daily_available_minutes && (
              <span className="text-xs bg-muted/50 px-2 py-1 rounded shadow-sm text-muted-foreground flex items-center gap-1 font-bold">
                <Clock className="w-3 h-3" /> {diagnostico.daily_available_minutes}min/dia
              </span>
            )}
          </div>

          {estrategia ? (
            <div className="space-y-3 z-10 relative">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Padrão de Revisão</span>
                <span className="font-bold text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{estrategia.review_pattern}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Meta (Questões Sem.)</span>
                <span className="font-bold text-xs">{estrategia.weekly_questions_target}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Simulados</span>
                <span className="font-bold text-xs">
                  {estrategia.simulate_frequency_days < 900
                    ? `A cada ${estrategia.simulate_frequency_days} dias`
                    : 'Não incluídos'}
                </span>
              </div>

              {diagnostico && (
                <div className="pt-2 space-y-3">
                  {/* Foco atual */}
                  {diagnostico.current_focus && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Foco Atual
                      </p>
                      <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-lg font-semibold capitalize">
                        {{
                          teoria: 'Base Teórica', questoes: 'Treino de Questões',
                          revisao: 'Revisão Geral', reta_final: 'Reta Final 🔥', misto: 'Misto Equilibrado'
                        }[diagnostico.current_focus as string] || diagnostico.current_focus}
                      </span>
                    </div>
                  )}

                  {/* Dias de estudo */}
                  {diagnostico.study_days_of_week?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Dias de Estudo
                      </p>
                      <div className="flex gap-1">
                        {['D','S','T','Q','Q','S','S'].map((d, idx) => (
                          <span key={idx} className={cn(
                            "w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center",
                            diagnostico.study_days_of_week.includes(idx)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground opacity-40"
                          )}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matérias difíceis */}
                  {diagnostico.weak_subjects?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 flex items-center gap-1">
                        <User className="w-3 h-3" /> Dificuldades (Prioridade Alta)
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {diagnostico.weak_subjects.map((subj: string, i: number) => (
                          <span key={i} className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded-sm font-semibold">{subj}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sua estratégia macro está sendo desenhada.</p>
          )}
        </section>

        {/* Intervenções do Mentor */}
        <section className="space-y-3">
          <h2 className="font-bold text-sm pl-2">Logs do Mentor</h2>
          {intervencoes && intervencoes.length > 0 ? (
            <div className="space-y-3">
              {(intervencoes as any[]).map((log) => (
                <div key={log.id} className="bg-muted/30 border border-border rounded-xl p-4 text-sm relative">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl opacity-30" />
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
