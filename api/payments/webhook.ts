import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";

// ─── Supabase (service role) ───────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Mercado Pago ─────────────────────────────────────────────────────────
const mp = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
});
const paymentClient = new Payment(mp);

// ─── Status map: MP status → local status ─────────────────────────────────
const MP_STATUS_MAP: Record<string, string> = {
  approved:      "approved",
  pending:       "pending",
  in_process:    "pending",
  authorized:    "pending",
  rejected:      "rejected",
  cancelled:     "cancelled",
  refunded:      "refunded",
  charged_back:  "charged_back",
};

// ─── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // MP sempre espera 200 — qualquer erro deve logar e responder 200
  // caso contrário, MP vai retentar indefinidamente

  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  try {
    const { topic, id, type, data } = req.body || {};

    // Suporte a ambos os formatos de notificação do MP
    const notificationType = topic || type;
    const resourceId = id || data?.id;

    console.log("[webhook] Received:", JSON.stringify({ notificationType, resourceId }));

    // Processar apenas notificações de pagamento
    if (notificationType !== "payment" || !resourceId) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const paymentId = String(resourceId);

    // 1. Consulta o pagamento REAL no Mercado Pago (nunca confiar no payload recebido)
    const mpPayment = await paymentClient.get({ id: paymentId });
    const externalRef = mpPayment.external_reference;
    const mpStatus = mpPayment.status || "unknown";
    const localStatus = MP_STATUS_MAP[mpStatus] || "pending";

    console.log("[webhook] Payment:", paymentId, "| MP status:", mpStatus, "| local:", localStatus, "| ref:", externalRef);

    if (!externalRef) {
      console.warn("[webhook] No external_reference in payment", paymentId);
      return res.status(200).json({ ok: true });
    }

    // 2. Busca ordem local pelo external_reference
    const { data: order, error: orderErr } = await supabase
      .from("payment_orders")
      .select("id, user_id, status")
      .eq("external_reference", externalRef)
      .maybeSingle();

    if (orderErr || !order) {
      console.error("[webhook] Order not found for ref:", externalRef, orderErr);
      return res.status(200).json({ ok: true });
    }

    // 3. Atualiza campos do MP na ordem (independente do status)
    await supabase
      .from("payment_orders")
      .update({
        mp_payment_id: paymentId,
        mp_merchant_order_id: String(mpPayment.order?.id || ""),
        notification_payload: mpPayment as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // 4. Se aprovado e a ordem ainda está pendente → efetiva o acesso
    if (localStatus === "approved" && order.status === "pending") {
      console.log("[webhook] Payment APPROVED — calling apply_payment_approval for order:", order.id);

      const { error: rpcErr } = await supabase.rpc("apply_payment_approval", {
        p_order_id:   order.id,
        p_mp_payment: paymentId,
        p_payload:    mpPayment,
      });

      if (rpcErr) {
        console.error("[webhook] apply_payment_approval error:", rpcErr);
      } else {
        console.log("[webhook] ✅ Access granted for user:", order.user_id);
      }
    } else if (localStatus !== "approved" && localStatus !== "pending") {
      // Rejeitado, estornado etc. — atualiza status da ordem
      await supabase
        .from("payment_orders")
        .update({ status: localStatus })
        .eq("id", order.id)
        .eq("status", "pending"); // só muda se ainda estava pendente
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[webhook] Unexpected error:", err);
    // Retorna 200 mesmo com erro para o MP não reenviar em loop
    return res.status(200).json({ ok: true });
  }
}
