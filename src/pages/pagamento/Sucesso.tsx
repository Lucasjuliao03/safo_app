import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Loader2, Clock } from "lucide-react";

type Status = "waiting" | "approved" | "timeout";

export default function PagamentoSucesso() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("waiting");
  const [seconds, setSeconds] = useState(0);
  const paymentId = searchParams.get("payment_id");
  const attemptsRef = useRef(0);
  const maxAttempts = 10; // 10 × 3s = 30s

  useEffect(() => {
    if (!user) return;

    // Checa imediatamente se já tem acesso (ex: retornou depois de já ter pago)
    if (user.isApproved && user.activeUntil) {
      setStatus("approved");
      return;
    }

    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      if (attemptsRef.current >= maxAttempts) {
        setStatus("timeout");
        return;
      }

      attemptsRef.current += 1;
      setSeconds(attemptsRef.current * 3);

      // refreshUser() atualiza o contexto com dados frescos do banco
      await refreshUser();

      // Aguardar 3s e verificar novamente
      setTimeout(() => {
        if (!cancelled) poll();
      }, 3000);
    }

    poll();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line

  // Reage quando user.isApproved muda (após refreshUser atualizar o contexto)
  useEffect(() => {
    if (user?.isApproved && user?.activeUntil) {
      setStatus("approved");
    }
  }, [user?.isApproved, user?.activeUntil]);

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-6 animate-fade-in">

        {/* Aguardando */}
        {status === "waiting" && (
          <>
            <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Confirmando seu pagamento</h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Aguarde enquanto o Mercado Pago processa e confirma sua transação.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Verificando... {seconds}s</span>
            </div>
          </>
        )}

        {/* Aprovado */}
        {status === "approved" && (
          <>
            <div className="w-20 h-20 rounded-full bg-success/10 border-2 border-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Acesso Liberado! 🎉</h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Seu pagamento foi confirmado. Você agora tem acesso completo ao SAFO.
              </p>
              {user?.activeUntil && (
                <p className="text-sm font-semibold text-success">
                  Válido até {new Date(user.activeUntil).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
            <button
              onClick={() => navigate("/")}
              className="bg-primary text-primary-foreground font-bold rounded-xl px-8 py-3.5 transition-all active:scale-[0.98]"
            >
              Começar a estudar →
            </button>
          </>
        )}

        {/* Timeout — MP pode demorar */}
        {status === "timeout" && (
          <>
            <div className="w-20 h-20 rounded-full bg-warning/10 border-2 border-warning/20 flex items-center justify-center">
              <Clock className="h-10 w-10 text-warning" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Processando seu pagamento</h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                O pagamento está sendo processado. Seu acesso será liberado automaticamente
                em instantes — você não precisa fazer nada.
              </p>
              {paymentId && (
                <p className="text-xs text-muted-foreground">
                  ID: <span className="font-mono">{paymentId}</span>
                </p>
              )}
            </div>
            <div className="space-y-3 w-full max-w-xs">
              <button
                onClick={async () => {
                  setStatus("waiting");
                  attemptsRef.current = 0;
                  await refreshUser();
                }}
                className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]"
              >
                Verificar novamente
              </button>
              <button
                onClick={() => navigate("/")}
                className="w-full bg-secondary text-secondary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]"
              >
                Ir para o início
              </button>
            </div>
          </>
        )}

      </div>
    </AppLayout>
  );
}
