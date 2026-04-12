import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Clock, RefreshCw } from "lucide-react";

export default function PagamentoPendente() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-warning/10 border-2 border-warning/20 flex items-center justify-center">
          <Clock className="h-10 w-10 text-warning" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Pagamento Pendente
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Seu pagamento está sendo analisado. Isso pode acontecer com boletos
            ou transferências. Assim que for confirmado, seu acesso será
            liberado automaticamente.
          </p>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 max-w-sm w-full text-left space-y-2">
          <p className="text-sm font-semibold text-foreground">O que acontece agora?</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">1.</span>
              <span>O Mercado Pago processa e confirma o pagamento.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">2.</span>
              <span>Nosso sistema recebe a confirmação automaticamente.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">3.</span>
              <span>Seu acesso é liberado sem que você precise fazer mais nada.</span>
            </li>
          </ul>
        </div>

        <div className="space-y-3 w-full max-w-xs">
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" />
            Verificar meu acesso
          </button>
          <button
            onClick={() => navigate("/assinar")}
            className="w-full bg-secondary text-secondary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]"
          >
            Voltar aos planos
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
