/**
 * paymentService.ts — Chamadas ao backend de pagamento (Vercel Functions)
 * O Access Token do Mercado Pago NUNCA é acessado aqui.
 */
import { supabase } from "@/lib/supabase";

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_days: number;
  is_active: boolean;
}

// Busca planos ativos do banco
export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents");
  if (error) throw error;
  return data as Plan[];
}

// Cria uma preference no backend (Vercel Function) e retorna o init_point
export async function createPaymentPreference(planId: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Usuário não autenticado");
  }

  const response = await fetch("/api/payments/create-preference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ planId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar preferência de pagamento");
  }

  const { initPoint } = await response.json();
  if (!initPoint) throw new Error("init_point não recebido do servidor");
  return initPoint;
}

// Busca o status da última ordem do usuário (para a página de sucesso)
export async function fetchLastOrder(userId: string) {
  const { data, error } = await supabase
    .from("payment_orders")
    .select("id, status, created_at, plans(name, duration_days)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}
