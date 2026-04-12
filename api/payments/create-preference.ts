import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Preference } from "mercadopago";

// ─── Validação de variáveis de ambiente ───────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || "https://localhost:5173";

// ─── Supabase (service role — bypassa RLS) ───────────────────────────────
function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ─── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS para desenvolvimento local
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 1. Verificar variáveis de ambiente obrigatórias
  if (!MP_ACCESS_TOKEN) {
    console.error("[create-preference] MERCADO_PAGO_ACCESS_TOKEN não configurado");
    return res.status(500).json({ error: "Configuração do servidor incompleta. Contate o administrador." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[create-preference] Variáveis Supabase não configuradas");
    return res.status(500).json({ error: "Configuração do servidor incompleta." });
  }

  // 2. Validar token JWT do usuário
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return res.status(401).json({ error: "Token de autenticação não fornecido" });
  }

  const supabase = getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error("[create-preference] Auth error:", authError?.message);
    return res.status(401).json({ error: "Token inválido ou expirado. Faça login novamente." });
  }

  // 3. Validar corpo da requisição
  const { planId } = req.body || {};
  if (!planId) {
    return res.status(400).json({ error: "planId é obrigatório" });
  }

  // 4. Buscar plano no banco
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .single();

  if (planError || !plan) {
    console.error("[create-preference] Plan not found:", planId, planError?.message);
    return res.status(404).json({
      error: planError?.code === "PGRST116"
        ? "Plano não encontrado. Execute o SQL de migration primeiro."
        : "Plano não encontrado ou inativo.",
    });
  }

  // 5. Verificar se já existe uma ordem pendente recente (menos de 30 min)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: existingOrder } = await supabase
    .from("payment_orders")
    .select("id, checkout_url, status, created_at")
    .eq("user_id", user.id)
    .eq("plan_id", planId)
    .eq("status", "pending")
    .gte("created_at", thirtyMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingOrder?.checkout_url) {
    console.log("[create-preference] Reutilizando ordem existente:", existingOrder.id);
    return res.status(200).json({ initPoint: existingOrder.checkout_url });
  }

  // 6. Criar ordem local no banco
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
    return res.status(500).json({ error: "Erro ao criar ordem de pagamento. Tente novamente." });
  }

  // 7. Criar Preference no Mercado Pago
  const priceInReais = plan.price_cents / 100;

  try {
    const mp = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const preferenceClient = new Preference(mp);

    const prefResponse = await preferenceClient.create({
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
          success: `${APP_URL}/pagamento/sucesso`,
          pending: `${APP_URL}/pagamento/pendente`,
          failure: `${APP_URL}/pagamento/falhou`,
        },
        auto_return: "approved" as const,
        notification_url: `${APP_URL}/api/payments/webhook`,
        statement_descriptor: "SAFO ESTUDOS",
      },
    });

    const initPoint = prefResponse.init_point;
    const prefId = prefResponse.id;

    if (!initPoint) {
      throw new Error("Mercado Pago não retornou URL de checkout");
    }

    // 8. Salvar preference_id e checkout_url na ordem
    await supabase
      .from("payment_orders")
      .update({ mp_preference_id: prefId, checkout_url: initPoint })
      .eq("id", newOrder.id);

    console.log("[create-preference] ✅ Preference criada:", prefId, "| init_point:", initPoint);
    return res.status(200).json({ initPoint });

  } catch (mpError: any) {
    console.error("[create-preference] MP error:", mpError?.message || mpError);

    // Limpar ordem criada
    await supabase.from("payment_orders").delete().eq("id", newOrder.id);

    const errorMsg = mpError?.message?.includes("access_token")
      ? "Token do Mercado Pago inválido. Verifique as configurações."
      : mpError?.message || "Erro ao criar preferência de pagamento";

    return res.status(500).json({ error: errorMsg });
  }
}
