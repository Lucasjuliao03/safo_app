import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyApiSecurityHeaders, isUuid } from "../../server/httpSecurity.js";
import { getSupabaseAdmin } from "../../server/supabaseAdmin.js";

const STATUS_MAP: Record<string, string> = {
  approved: "approved", pending: "pending", in_process: "pending", authorized: "pending",
  rejected: "rejected", cancelled: "cancelled", refunded: "refunded", charged_back: "charged_back",
};

interface Notification { id?: string | number; type?: string; topic?: string; data?: { id?: string | number } }
interface Payment {
  id: number; status?: string; status_detail?: string; external_reference?: string;
  transaction_amount?: number; currency_id?: string; live_mode?: boolean; collector_id?: number;
  order?: { id?: string | number }; date_approved?: string;
}
function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function validateMercadoPagoSignature(
  signatureHeader: string, requestId: string, dataId: string, secret: string,
): boolean {
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.trim().split("=", 2)));
  if (!parts.ts || !parts.v1 || !/^[a-f0-9]{64}$/i.test(parts.v1)) return false;
  const manifest = `${dataId ? `id:${dataId.toLowerCase()};` : ""}`
    + `${requestId ? `request-id:${requestId};` : ""}ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const received = Buffer.from(parts.v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function safePayload(payment: Payment) {
  return {
    id: payment.id, status: payment.status, status_detail: payment.status_detail,
    external_reference: payment.external_reference, transaction_amount: payment.transaction_amount,
    currency_id: payment.currency_id, live_mode: payment.live_mode, collector_id: payment.collector_id,
    merchant_order_id: payment.order?.id, date_approved: payment.date_approved,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyApiSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!accessToken || !webhookSecret) throw new Error("Payment webhook configuration is incomplete");

    const body = (req.body ?? {}) as Notification;
    if ((body.topic || body.type) !== "payment") return res.status(200).json({ ok: true });

    const queryDataId = headerValue(req.query["data.id"]);
    const resourceId = queryDataId || String(body.data?.id ?? body.id ?? "");
    const requestId = headerValue(req.headers["x-request-id"]);
    const signature = headerValue(req.headers["x-signature"]);
    if (!queryDataId || !requestId
      || !validateMercadoPagoSignature(signature, requestId, queryDataId, webhookSecret)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const paymentId = Number(resourceId);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return res.status(400).json({ error: "Invalid payment id" });

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!paymentResponse.ok) throw new Error(`Payment provider returned ${paymentResponse.status}`);
    const payment = await paymentResponse.json() as Payment;
    if (payment.id !== paymentId || !isUuid(payment.external_reference)) {
      return res.status(400).json({ error: "Payment does not match an order" });
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error: orderError } = await supabase.from("payment_orders")
      .select("id, status, amount_cents").eq("id", payment.external_reference).single();
    if (orderError || !order) return res.status(404).json({ error: "Order not found" });

    if (payment.currency_id !== "BRL"
      || Math.abs((payment.transaction_amount ?? -1) - order.amount_cents / 100) > 0.001) {
      console.error("[webhook] payment amount mismatch", { paymentId, orderId: order.id });
      return res.status(422).json({ error: "Payment amount mismatch" });
    }
    if (process.env.MERCADO_PAGO_COLLECTOR_ID
      && String(payment.collector_id) !== process.env.MERCADO_PAGO_COLLECTOR_ID) {
      return res.status(422).json({ error: "Payment recipient mismatch" });
    }
    if (process.env.MERCADO_PAGO_LIVE_MODE === "true" && payment.live_mode !== true) {
      return res.status(422).json({ error: "Test payment rejected in production" });
    }

    const status = STATUS_MAP[payment.status ?? ""] ?? "pending";
    const payload = safePayload(payment);
    if (status === "approved") {
      const { error } = await supabase.rpc("apply_payment_approval", {
        p_order_id: order.id, p_mp_payment: String(paymentId), p_payload: payload,
      });
      if (error) throw error;
    } else if (["cancelled", "refunded", "charged_back"].includes(status)) {
      const { error } = await supabase.rpc("apply_payment_reversal", {
        p_order_id: order.id, p_status: status, p_payload: payload,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("payment_orders").update({
        status, mp_payment_id: String(paymentId), mp_merchant_order_id: String(payment.order?.id ?? ""),
        notification_payload: payload,
      }).eq("id", order.id);
      if (error) throw error;
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[webhook] processing failed", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
