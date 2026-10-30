import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { fetchPlans, fetchLastOrder, createPaymentPreference, Plan } from "@/services/paymentService";
import { ApiResponseError } from '@/lib/apiJson';
import { useAuth } from "@/contexts/AuthContext";
import { useAccessStatus } from "@/hooks/useAccessStatus";
import {
  CheckCircle2,
  CreditCard,
  Shield,
  Zap,
  BookOpen,
  Star,
  Clock,
  Loader2,
  Lock,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PLAN_HIGHLIGHTS: Record<
  string,
  { badge: string; color: string; savings?: string }
> = {
  monthly:   { badge: "Básico",       color: "hsl(217 91% 60%)" },
  quarterly: { badge: "Mais Popular", color: "hsl(142 71% 45%)", savings: "Economize 16%" },
};

const BENEFITS = [
  { icon: BookOpen, text: "Questões ilimitadas de todas as matérias" },
  { icon: Zap,      text: "Flashcards com repetição espaçada inteligente" },
  { icon: Star,     text: "Resumos teóricos completos por tema" },
  { icon: Shield,   text: "Ranking nacional de concurseiros" },
  { icon: CheckCircle2, text: "Missões diárias + sistema de XP e conquistas" },
];

function PriceTag({ cents }: { cents: number }) {
  const reais = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, "0");
  return (
    <div className="flex items-end gap-0.5">
      <span className="text-xs text-muted-foreground font-medium mb-1">R$</span>
      <span className="text-4xl font-bold text-foreground">{reais}</span>
      <span className="text-lg font-bold text-foreground mb-0.5">,{centavos}</span>
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
}) {
  const highlight = PLAN_HIGHLIGHTS[plan.code] || { badge: "", color: "hsl(217 91% 60%)" };
  const monthlyEquivalent =
    plan.duration_days > 30
      ? `≈ R$ ${((plan.price_cents / (plan.duration_days / 30)) / 100).toFixed(2).replace(".", ",")}/mês`
      : null;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 active:scale-[0.98]",
        selected
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border bg-card hover:border-primary/40"
      )}
    >
      {/* Badge */}
      {highlight.badge && (
        <div
          className="absolute -top-3 left-4 px-3 py-0.5 rounded-full text-xs font-bold text-white"
          style={{ background: highlight.color }}
        >
          {highlight.badge}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-bold text-foreground text-base">{plan.name}</p>
          {highlight.savings && (
            <span className="text-xs font-semibold text-success">
              {highlight.savings}
            </span>
          )}
          <div className="mt-3">
            <PriceTag cents={plan.price_cents} />
            <p className="text-xs text-muted-foreground mt-0.5">
              por {plan.duration_days} dias
              {monthlyEquivalent && (
                <> · <span className="text-primary">{monthlyEquivalent}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Radio visual */}
        <div
          className={cn(
            "flex-shrink-0 mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            selected
              ? "border-primary bg-primary"
              : "border-muted-foreground/40"
          )}
        >
          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>
      </div>

      {/* Features */}
      <div className="mt-4 space-y-1.5">
        {BENEFITS.slice(0, 3).map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-success flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{b.text}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

export default function AssinarPage() {
  const { user } = useAuth();
  const { isPaid, accessExpiresAt, reason } = useAccessStatus();
  const navigate = useNavigate();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const requests = useRef<Record<string, string>>({});

  const { data: plans = [], isLoading, error: plansError } = useQuery({
    queryKey: ["plans"],
    queryFn: fetchPlans,
    staleTime: 1000 * 60 * 10,
  });
  const { data: lastOrder } = useQuery({ queryKey: ['lastPaymentOrder', user?.id],
    queryFn: () => fetchLastOrder(user!.id), enabled: !!user, staleTime: 0 });

  // Seleciona o primeiro plano por padrão quando os dados carregam
  useEffect(() => {
    if (!selectedPlanId && plans.length > 0) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  const handleSubscribe = async () => {
    if (!selectedPlanId || isCheckingOut || reason === 'account_blocked') return;
    setIsCheckingOut(true);
    try {
      const requestId = requests.current[selectedPlanId] ??= crypto.randomUUID();
      const initPoint = await createPaymentPreference(selectedPlanId, requestId);
      // Redireciona para o Mercado Pago
      window.location.href = initPoint;
    } catch (err: any) {
      if (err instanceof ApiResponseError && err.code === 'checkout_finished') delete requests.current[selectedPlanId];
      toast.error("Erro ao iniciar pagamento", {
        description: err.message || "Tente novamente em instantes.",
      });
      setIsCheckingOut(false);
    }
  };

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-20 space-y-6 animate-fade-in max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mx-auto mb-3">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Acesso Completo ao SAFO
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Estude sem limites. Questões, flashcards, resumos e muito mais.
          </p>
          <p className="text-xs text-muted-foreground">Pagamento único pelo período escolhido. Renovação manual.</p>
        </div>

        {/* Status de acesso atual */}
        {isPaid && accessExpiresAt && (
          <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/20 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-success">Acesso ativo</p>
              <p className="text-xs text-muted-foreground">
                Válido até{" "}
                {new Date(accessExpiresAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        )}

        {/* Benefícios */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            O que está incluso
          </p>
          <div className="space-y-2.5">
            {BENEFITS.map((benefit, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                  <benefit.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm text-foreground">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>

        {lastOrder?.status === 'pending' && <button className="w-full rounded-xl border border-primary p-3 text-primary"
          onClick={() => navigate(`/pagamento/pendente?order_id=${lastOrder.id}`)}>Acompanhar pagamento em andamento</button>}
        {plansError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os planos. Atualize a página para tentar novamente.</p>}
        {!isLoading && !plansError && plans.length === 0 && <p className="text-sm text-muted-foreground">Nenhum plano disponível no momento. Entre em contato com o suporte.</p>}
        {/* Planos */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-36 rounded-2xl bg-card border border-border animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">
              Escolha seu plano
            </p>
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlanId === plan.id}
                onSelect={() => setSelectedPlanId(plan.id)}
              />
            ))}
          </div>
        )}

        {reason === 'account_blocked' && <p role="alert" className="text-destructive">Sua conta está suspensa. Entre em contato com o suporte antes de realizar um pagamento.</p>}
        {/* CTA */}
        <div className="space-y-3">
          <button
            onClick={handleSubscribe}
            disabled={!selectedPlanId || isCheckingOut || isLoading || reason === 'account_blocked'}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-4 font-bold text-base transition-all",
              selectedPlanId && !isCheckingOut
                ? "bg-primary text-primary-foreground active:scale-[0.98] shadow-lg shadow-primary/20"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isCheckingOut ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Redirecionando...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Assinar agora no Mercado Pago
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>

          {/* Segurança */}
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              <span>Pagamento seguro</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>Liberação após aprovação</span>
            </div>
          </div>
        </div>

        {/* Voltar */}
        <button
          onClick={() => navigate(-1)}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          Voltar
        </button>
      </div>
    </AppLayout>
  );
}
