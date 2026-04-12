import { Lock, Clock, CreditCard, ChevronRight, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FREE_USAGE_LIMIT, FREE_SUMMARY_LIMIT } from "@/services/accessService";

interface BlockedOverlayProps {
  answeredCount?: number;
  readCount?: number;
  reason?: "limit_reached" | "expired";
}

export function BlockedOverlay({
  answeredCount,
  readCount,
  reason = "limit_reached",
}: BlockedOverlayProps) {
  const navigate = useNavigate();
  const isExpired = reason === "expired";
  const isSummary = readCount !== undefined;

  const title = isExpired ? "Acesso Expirado" : "Seu teste gratuito acabou";

  let description = "";
  if (isExpired) {
    description =
      "Seu período de acesso ao sistema expirou. Renove para continuar estudando.";
  } else if (isSummary) {
    description = `Você usou os ${FREE_SUMMARY_LIMIT} resumos gratuitos.`;
  } else {
    description = `Você respondeu ${FREE_USAGE_LIMIT} questões e flashcards gratuitos.`;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 backdrop-blur-sm p-6">
      <div className="max-w-sm w-full text-center space-y-5 animate-slide-up">
        {/* Ícone */}
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 border-2 border-primary/20">
          {isExpired ? (
            <Clock className="h-10 w-10 text-primary" />
          ) : (
            <Lock className="h-10 w-10 text-primary" />
          )}
        </div>

        {/* Texto principal */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
          {!isExpired && answeredCount !== undefined && (
            <p className="text-sm text-muted-foreground">
              Total usado:{" "}
              <span className="font-bold text-primary">{answeredCount}</span>
            </p>
          )}
        </div>

        {/* CTA principal — Assinar */}
        <div className="space-y-3">
          <button
            onClick={() => navigate("/assinar")}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-4 font-bold text-base transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
          >
            <CreditCard className="h-5 w-5" />
            Escolha um plano para continuar
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Benefícios resumidos */}
          <div className="rounded-2xl bg-card border border-border p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Desbloqueie o acesso completo
            </p>
            <ul className="space-y-1.5">
              {[
                "Questões ilimitadas de todas as matérias",
                "Flashcards com revisão espaçada",
                "Resumos teóricos completos",
                "Ranking + Conquistas + Missões",
              ].map((b) => (
                <li key={b} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-primary">✓</span> {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
