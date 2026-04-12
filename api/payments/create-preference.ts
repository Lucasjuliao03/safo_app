import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Preference } from "mercadopago";

// ─── Supabase (service role — bypasses RLS) ───────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Mercado Pago ─────────────────────────────────────────────────────────
const mp = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
});
const preference = new Preference(mp);

// ─── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Validar token JWT do usuário
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // 2. Validar corpo da requisição
  const { planId } = req.body || {};
  if (!planId) {
    return res.status(400).json({ error: "planId is required" });
  }

  // 3. Buscar plano no banco
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .single();

  if (planError || !plan) {
    return res.status(404).json({ error: "Plan not found" });
  }

  // 4. Verificar se já existe ordem pendente para este usuário/plano
  const { data: existingOrder } = await supabase
    .from("payment_orders")
    .select("id, checkout_url, status")
    .eq("user_id", user.id)
    .eq("plan_id", planId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Se já tem uma ordem pendente (criada há menos de 30 min), reutiliza
  if (existingOrder?.checkout_url) {
    return res.status(200).json({ initPoint: existingOrder.checkout_url });
  }

  // 5. Criar ordem local no banco
  const externalRef = `${user.id}_${Date.now()}`;

  const { data: newOrder, error: orderError } = await supabase
    .from("payment_orders")
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      external_reference: externalRef,
      amount_cents: plan.price_cents,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !newOrder) {
    console.error("[create-preference] Order insert error:", orderError);
    return res.status(500).json({ error: "Failed to create order" });
  }

  // 6. Criar Preference no Mercado Pago
  const appUrl = process.env.APP_URL || "https://localhost:5173";
  const priceInReais = plan.price_cents / 100;

  try {
    const prefResponse = await preference.create({
      body: {
        items: [
          {
            id: plan.code,
            title: plan.name,
            description: plan.description || plan.name,
            quantity: 1,
            unit_price: priceInReais,
            currency_id: "BRL",
          },
        ],
        payer: {
          email: user.email,
        },
        external_reference: externalRef,
        back_urls: {
          success: `${appUrl}/pagamento/sucesso`,
          pending: `${appUrl}/pagamento/pendente`,
          failure: `${appUrl}/pagamento/falhou`,
        },
        auto_return: "approved",
        notification_url: `${appUrl}/api/payments/webhook`,
        statement_descriptor: "SAFO ESTUDOS",
        expires: false,
      },
    });

    const initPoint = prefResponse.init_point;
    const prefId = prefResponse.id;

    // 7. Salvar preference_id e checkout_url na ordem
    await supabase
      .from("payment_orders")
      .update({
        mp_preference_id: prefId,
        checkout_url: initPoint,
      })
      .eq("id", newOrder.id);

    return res.status(200).json({ initPoint });
  } catch (mpError) {
    console.error("[create-preference] MP error:", mpError);
    // Limpa a ordem criada para evitar órfãos
    await supabase
      .from("payment_orders")
      .delete()
      .eq("id", newOrder.id);

    return res
      .status(500)
      .json({ error: "Failed to create payment preference" });
  }
}
