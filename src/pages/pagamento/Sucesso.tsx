/**
 * /pagamento/sucesso
 * Exibida após retorno do Mercado Pago (back_url success).
 * NÃO libera acesso — apenas consulta o banco até confirmar aprovação via webhook.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "waiting" | "approved" | "timeout";

export default function PagamentoSucesso() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("waiting");
  const [attempts, setAttempts] = useState(0);
  const paymentId = searchParams.get("payment_id");

  useEffect(() => {
    if (!user) return;

    // Polling: verifica a cada 3s se o perfil foi atualizado (is_active = true)
    // O webhook real atualiza profiles.is_active → refreshUser() vai detectar
    const MAX_ATTEMPTS = 10; // máx 30s de espera
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      await refreshUser();
      setAttempts((prev) => prev + 1);
    };

    const poll = () => {
      check().then(() => {
        setAttempts((prev) => {
          if (user.isApproved) {
            setStatus("approved");
            return prev;
          }
          if (prev >= MAX_ATTEMPTS) {
            setStatus("timeout");
            return prev;
          }
          timer = setTimeout(poll, 3000);
          return prev;
        });
      });
    };

    // Checa imediatamente e inicia polling
    poll();
    return () => clearTimeout(timer);
  }, [user?.id]);

  // Se o usuário já tinha acesso ativo quando chegou aqui
  useEffect(() => {
    if (user?.isApproved) setStatus("approved");
  }, [user?.isApproved]);

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-6 animate-fade-in">
        {status === "waiting" && (
          <>
            <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Confirmando seu pagamento
              </h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Aguarde enquanto o Mercado Pago processa e confirma sua
                transação. Isso leva alguns segundos.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Verificando... ({attempts * 3}s)</span>
            </div>
          </>
        )}

        {status === "approved" && (
          <>
            <div className="w-20 h-20 rounded-full bg-success/10 border-2 border-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Acesso Liberado! 🎉
              </h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Seu pagamento foi confirmado. Você agora tem acesso completo ao
                SAFO.
              </p>
              {user?.activeUntil && (
                <p className="text-sm font-semibold text-success">
                  Válido até{" "}
                  {new Date(user.activeUntil).toLocaleDateString("pt-BR")}
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

        {status === "timeout" && (
          <>
            <div className="w-20 h-20 rounded-full bg-warning/10 border-2 border-warning/20 flex items-center justify-center">
              <Clock className="h-10 w-10 text-warning" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Processando seu pagamento
              </h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                O pagamento está sendo processado pelo Mercado Pago. Seu acesso
                será liberado automaticamente em instantes — você não precisa
                fazer nada.
              </p>
              {paymentId && (
                <p className="text-xs text-muted-foreground">
                  ID da transação: <span className="font-mono">{paymentId}</span>
                </p>
              )}
            </div>
            <div className="space-y-3 w-full max-w-xs">
              <button
                onClick={() => window.location.reload()}
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
