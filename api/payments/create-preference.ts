import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { applySameOriginCors, getAppUrl, isUuid } from "../../server/httpSecurity.js";
import { authenticateBearer, getSupabaseAdmin } from "../../server/supabaseAdmin.js";

function isMercadoPagoCheckoutUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "mercadopago.com.br" || hostname.endsWith(".mercadopago.com.br")
      || hostname === "mercadopago.com" || hostname.endsWith(".mercadopago.com");
  } catch { return false; }
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!applySameOriginCors(req, res)) return res.status(403).json({ error: "Origin not allowed" });
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MERCADO_PAGO_ACCESS_TOKEN is not configured");
    const user = await authenticateBearer(req.headers.authorization);
    if (!user?.email) return res.status(401).json({ error: "Sessão inválida ou expirada" });

    const planId = (req.body as { planId?: unknown } | undefined)?.planId;
    if (!isUuid(planId)) return res.status(400).json({ error: "Plano inválido" });

    const supabase = getSupabaseAdmin();
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("id, code, name, description, price_cents, duration_days")
      .eq("id", planId).eq("is_active", true).single();
    if (planError || !plan || plan.price_cents <= 0 || plan.duration_days <= 0) {
      return res.status(404).json({ error: "Plano não encontrado" });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentOrderCount } = await supabase.from("payment_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", tenMinutesAgo);
    if ((recentOrderCount ?? 0) >= 5) {
      res.setHeader("Retry-After", "600");
      return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: existing } = await supabase.from("payment_orders")
      .select("checkout_url").eq("user_id", user.id).eq("plan_id", planId)
      .eq("status", "pending").gte("created_at", thirtyMinutesAgo)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing?.checkout_url && isMercadoPagoCheckoutUrl(existing.checkout_url)) {
      return res.status(200).json({ initPoint: existing.checkout_url });
    }

    const orderId = randomUUID();
    const { error: orderError } = await supabase.from("payment_orders").insert({
      id: orderId, user_id: user.id, plan_id: plan.id, external_reference: orderId,
      amount_cents: plan.price_cents, status: "pending",
    });
    if (orderError) throw new Error("Could not create payment order");

    try {
      const appUrl = getAppUrl();
      const preference = await new Preference(new MercadoPagoConfig({ accessToken })).create({
        body: {
          items: [{ id: plan.code, title: plan.name, description: plan.description || plan.name,
            quantity: 1, unit_price: plan.price_cents / 100, currency_id: "BRL" }],
          payer: { email: user.email },
          external_reference: orderId,
          metadata: { order_id: orderId, plan_id: plan.id, user_id: user.id },
          back_urls: {
            success: `${appUrl}/pagamento/sucesso`, pending: `${appUrl}/pagamento/pendente`,
            failure: `${appUrl}/pagamento/falhou`,
          },
          auto_return: "approved", notification_url: `${appUrl}/api/payments/webhook`,
          statement_descriptor: "SAFO ESTUDOS",
        },
        requestOptions: { idempotencyKey: orderId },
      });
      if (!preference.init_point || !isMercadoPagoCheckoutUrl(preference.init_point)) {
        throw new Error("Invalid checkout URL returned by payment provider");
      }
      const { error: updateError } = await supabase.from("payment_orders")
        .update({ mp_preference_id: preference.id, checkout_url: preference.init_point }).eq("id", orderId);
      if (updateError) throw new Error("Could not save payment preference");
      return res.status(200).json({ initPoint: preference.init_point });
    } catch (error) {
      await supabase.from("payment_orders").delete().eq("id", orderId).eq("status", "pending");
      throw error;
    }
  } catch (error) {
    console.error("[create-preference] failed", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Não foi possível iniciar o pagamento. Tente novamente." });
  }
}
