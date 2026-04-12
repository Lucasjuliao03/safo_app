const { createClient } = require("@supabase/supabase-js");
const { MercadoPagoConfig, Preference } = require("mercadopago");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SUPABASE_URL       = process.env.SUPABASE_URL;
  const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const MP_TOKEN           = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const APP_URL            = process.env.APP_URL || "";

  if (!MP_TOKEN) {
    return res.status(500).json({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado no servidor." });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Supabase não configurado no servidor." });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Validar JWT
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Token não fornecido" });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
  }

  const { planId } = req.body || {};
  if (!planId) return res.status(400).json({ error: "planId obrigatório" });

  // Buscar plano
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .single();

  if (planErr || !plan) {
    const msg = planErr?.code === "PGRST116"
      ? "Tabela 'plans' não encontrada — execute sql/create_payment_system.sql no Supabase."
      : "Plano não encontrado.";
    return res.status(404).json({ error: msg });
  }

  // Reutilizar ordem pendente recente (< 30 min)
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("payment_orders")
    .select("id, checkout_url")
    .eq("user_id", user.id)
    .eq("plan_id", planId)
    .eq("status", "pending")
    .gte("created_at", thirtyMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.checkout_url) {
    return res.status(200).json({ initPoint: existing.checkout_url });
  }

  // Criar ordem com external_reference temporário
  const { data: order, error: orderErr } = await supabase
    .from("payment_orders")
    .insert({
      user_id:            user.id,
      plan_id:            plan.id,
      external_reference: "temp_" + Date.now(),
      amount_cents:       plan.price_cents,
      status:             "pending",
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    console.error("[create-preference] Erro ao criar ordem:", orderErr?.message);
    return res.status(500).json({ error: "Erro ao criar ordem no banco. " + (orderErr?.message || "") });
  }

  // Usa o order.id (UUID) como external_reference — garante vínculo único com o usuário
  await supabase
    .from("payment_orders")
    .update({ external_reference: order.id })
    .eq("id", order.id);

  // Criar Preference no Mercado Pago
  try {
    const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
    const prefClient = new Preference(mp);

    const pref = await prefClient.create({
      body: {
        items: [{
          id:          plan.code,
          title:       plan.name,
          description: plan.description || plan.name,
          quantity:    1,
          unit_price:  plan.price_cents / 100,
          currency_id: "BRL",
        }],
        payer: { email: user.email },
        external_reference: order.id,
        back_urls: {
          success: `${APP_URL}/pagamento/sucesso`,
          pending: `${APP_URL}/pagamento/pendente`,
          failure: `${APP_URL}/pagamento/falhou`,
        },
        auto_return: "approved",
        notification_url: `${APP_URL}/api/payments/webhook`,
        statement_descriptor: "SAFO ESTUDOS",
      },
    });

    if (!pref.init_point) throw new Error("Mercado Pago não retornou init_point");

    await supabase
      .from("payment_orders")
      .update({ mp_preference_id: pref.id, checkout_url: pref.init_point })
      .eq("id", order.id);

    console.log(`[create-preference] OK user=${user.id} order=${order.id}`);
    return res.status(200).json({ initPoint: pref.init_point });

  } catch (err) {
    console.error("[create-preference] MP error:", err?.message);
    await supabase.from("payment_orders").delete().eq("id", order.id);
    return res.status(500).json({ error: "Erro ao criar preferência: " + (err?.message || "Mercado Pago indisponível") });
  }
};
