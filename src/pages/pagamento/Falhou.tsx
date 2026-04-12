import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { XCircle, CreditCard } from "lucide-react";

export default function PagamentoFalhou() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-destructive/10 border-2 border-destructive/20 flex items-center justify-center">
          <XCircle className="h-10 w-10 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Pagamento não aprovado
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Não foi possível processar seu pagamento. Isso pode acontecer por
            saldo insuficiente, dados incorretos ou recusa do banco emissor.
          </p>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 max-w-sm w-full text-left space-y-2">
          <p className="text-sm font-semibold text-foreground">Possíveis motivos:</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• Saldo insuficiente no cartão</li>
            <li>• Dados do cartão incorretos</li>
            <li>• Transação bloqueada pelo banco</li>
            <li>• Limite do cartão atingido</li>
          </ul>
        </div>

        <div className="space-y-3 w-full max-w-xs">
          <button
            onClick={() => navigate("/assinar")}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]"
          >
            <CreditCard className="h-4 w-4" />
            Tentar novamente
          </button>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-secondary text-secondary-foreground font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98]"
          >
            Ir para o início
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
