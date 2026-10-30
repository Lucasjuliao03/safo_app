/**
 * paymentService.ts — Chamadas ao backend de pagamento (Vercel Functions)
 * O Access Token do Mercado Pago NUNCA é acessado aqui.
 */
import { supabase } from "@/lib/supabase";
import { readApiJson } from "@/lib/apiJson";
import { validAccessToken } from './secureContentService';

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
export async function createPaymentPreference(planId: string, requestId: string): Promise<string> {
  const { token, userId } = await validAccessToken();

  const response = await fetch("/api/payments/create-preference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ planId, requestId }), cache: 'no-store',
  });

  const { initPoint, orderId } = await readApiJson<{ initPoint?: string; orderId?: string }>(response, "Erro ao criar preferência de pagamento");
  if (!initPoint || !orderId || !isOrderId(orderId)) throw new Error("Resposta de pagamento inválida");
  const checkout = new URL(initPoint);
  if (checkout.protocol !== 'https:' || checkout.username || checkout.password
    || !/^(?:[a-z0-9-]+\.)*mercadopago\.com(?:\.br)?$/i.test(checkout.hostname)) throw new Error('Destino de pagamento inválido');
  try { localStorage.setItem(`safo:payment-order:${userId}`, orderId); } catch { /* URL also carries the order. */ }
  return initPoint;
}

// Busca o status da última ordem do usuário (para a página de sucesso)
export async function fetchLastOrder(userId: string) {
  const { data, error } = await supabase
    .from("payment_orders")
    .select("id, status, created_at, plan_name, duration_days")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function isOrderId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function pendingPaymentOrder(userId?: string) {
  try { const id = userId ? localStorage.getItem(`safo:payment-order:${userId}`) : null; return isOrderId(id) ? id : undefined; }
  catch { return undefined; }
}
export function clearPendingPaymentOrder(userId: string, orderId: string) {
  try { if (pendingPaymentOrder(userId) === orderId) localStorage.removeItem(`safo:payment-order:${userId}`); } catch { /* Storage is optional. */ }
}
export interface PaymentConfirmation {
  order: { id: string; status: string; plan_name: string; duration_days: number; fulfilled_at: string | null; needs_review: boolean };
  access: { entitled: boolean; expiresAt: string | null };
}
export async function fetchPaymentStatus(orderId: string): Promise<PaymentConfirmation> {
  const { token } = await validAccessToken();
  const response = await fetch('/api/payments/status', { method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ orderId }) });
  const result = await readApiJson<PaymentConfirmation>(response, 'Não foi possível confirmar seu pagamento.');
  if (result.order?.id !== orderId || typeof result.order.status !== 'string' || typeof result.access?.entitled !== 'boolean') {
    throw new Error('Resposta de confirmação inválida. Tente novamente.');
  }
  return result;
}
