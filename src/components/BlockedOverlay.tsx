import { Lock, Clock, CreditCard, ChevronRight, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FREE_USAGE_LIMIT, FREE_SUMMARY_LIMIT } from "@/services/accessService";
import type { ReactNode } from 'react';

interface BlockedOverlayProps {
  children?: ReactNode;
  answeredCount?: number;
  readCount?: number;
  reason?: "limit_reached" | "expired" | "account_blocked";
}

export function BlockedOverlay({
  children,
  answeredCount,
  readCount,
  reason = "limit_reached",
}: BlockedOverlayProps) {
  const navigate = useNavigate();
  const isExpired = reason === "expired";
  const isBlocked = reason === 'account_blocked';
  const isSummary = readCount !== undefined;

  const title = isBlocked ? 'Acesso suspenso' : isExpired ? "Acesso Expirado" : "Seu teste gratuito acabou";

  let description = "";
  if (isBlocked) {
    description = 'Entre em contato com o suporte para verificar o acesso à sua conta.';
  } else if (isExpired) {
    description =
      "Seu período de acesso ao sistema expirou. Renove para continuar estudando.";
  } else if (isSummary) {
    description = `Você usou os ${FREE_SUMMARY_LIMIT} resumos gratuitos.`;
  } else {
    description = `Você respondeu ${FREE_USAGE_LIMIT} questões e flashcards gratuitos.`;
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background p-6">
      <div className="mx-auto my-8 max-w-sm w-full text-center space-y-5 animate-slide-up">
        {/* Ícone */}
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 border-2 border-primary/20">
          {isExpired ? (
            <Clock className="h-10 w-10 text-primary" />
          ) : (
            <Lock className="h-10 w-10 text-primary" />
          )}
        </div>

        {children}
        {/* Texto principal */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
          {!isExpired && !isBlocked && answeredCount !== undefined && (
            <p className="text-sm text-muted-foreground">
              Total usado:{" "}
              <span className="font-bold text-primary">{answeredCount}</span>
            </p>
          )}
        </div>

        {/* CTA principal — Assinar */}
        <div className="space-y-3">
          {!isBlocked && <button
            onClick={() => navigate("/assinar")}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-4 font-bold text-base transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
          >
            <CreditCard className="h-5 w-5" />
            Escolha um plano para continuar
            <ChevronRight className="h-4 w-4" />
          </button>}
          <button onClick={() => navigate('/perfil')} className="w-full rounded-xl border border-border py-3 font-semibold">
            Meu perfil
          </button>

          {/* Benefícios resumidos */}
          {!isBlocked && <div className="rounded-2xl bg-card border border-border p-4 text-left space-y-2">
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
          </div>}
        </div>
      </div>
    </div>
  );
}
