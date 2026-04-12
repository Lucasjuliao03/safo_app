import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";

const STATUS_MAP: Record<string, string> = {
  approved:     "approved",
  pending:      "pending",
  in_process:   "pending",
  authorized:   "pending",
  rejected:     "rejected",
  cancelled:    "cancelled",
  refunded:     "refunded",
  charged_back: "charged_back",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Sempre retorna 200 para o MP não reenviar indefinidamente
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = (req.body as any) || {};
    const { topic, id, type, data, action } = body;
    const notificationType = topic || type;
    const resourceId       = id || data?.id;

    // Log completo para diagnóstico
    console.log("[webhook] body:", JSON.stringify(body));
    console.log("[webhook]", JSON.stringify({ notificationType, resourceId, action }));

    if (notificationType !== "payment" || !resourceId) {
      return res.status(200).json({ ok: true, skipped: notificationType });
    }

    // ID como number — SDK do MP exige number, não string
    const paymentId = Number(resourceId);
    if (isNaN(paymentId) || paymentId <= 0) {
      console.warn("[webhook] ID de pagamento inválido:", resourceId);
      return res.status(200).json({ ok: true });
    }

    const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN! });
    const paymentClient = new Payment(mp);

    // Aguarda 1s antes de consultar — MP às vezes notifica antes do pagamento estar indexado
    await new Promise(r => setTimeout(r, 1000));

    let mpPayment: any;
    try {
      mpPayment = await paymentClient.get({ id: paymentId });
    } catch (e: any) {
      console.error("[webhook] Erro ao buscar pagamento MP:", e?.message, "| paymentId:", paymentId);
      return res.status(200).json({ ok: true });
    }


    const externalRef = mpPayment.external_reference; // = order.id (UUID)
    const mpStatus    = mpPayment.status || "unknown";
    const localStatus = STATUS_MAP[mpStatus] || "pending";

    console.log(`[webhook] payment=${paymentId} mpStatus=${mpStatus} ref=${externalRef}`);

    if (!externalRef) return res.status(200).json({ ok: true });

    // Busca ordem pelo order_id direto
    let order: any = null;
    const { data: orderById } = await supabase
      .from("payment_orders")
      .select("id, user_id, status")
      .eq("id", externalRef)
      .maybeSingle();

    if (orderById) {
      order = orderById;
    } else {
      const { data: orderByRef } = await supabase
        .from("payment_orders")
        .select("id, user_id, status")
        .eq("external_reference", externalRef)
        .maybeSingle();
      order = orderByRef;
    }

    if (!order) {
      console.error("[webhook] Ordem não encontrada:", externalRef);
      return res.status(200).json({ ok: true });
    }

    // Salvar dados do MP
    await supabase.from("payment_orders").update({
      mp_payment_id:        paymentId,
      mp_merchant_order_id: String(mpPayment.order?.id || ""),
      notification_payload: mpPayment,
    }).eq("id", order.id);

    // Aprovado → efetiva acesso
    if (localStatus === "approved" && order.status === "pending") {
      console.log(`[webhook] APROVADO user=${order.user_id} order=${order.id}`);
      const { error: rpcErr } = await supabase.rpc("apply_payment_approval", {
        p_order_id:   order.id,
        p_mp_payment: paymentId,
        p_payload:    mpPayment,
      });
      if (rpcErr) console.error("[webhook] RPC error:", rpcErr.message);
      else console.log(`[webhook] ✅ Acesso liberado user=${order.user_id}`);
    } else if (!["approved", "pending"].includes(localStatus) && order.status === "pending") {
      await supabase.from("payment_orders").update({ status: localStatus }).eq("id", order.id);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[webhook] Erro inesperado:", err?.message);
    return res.status(200).json({ ok: true });
  }
}
