import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WebhookSignatureValidator } from 'mercadopago';
import { applyApiSecurityHeaders } from '../../server/httpSecurity.js';
import { getProviderPayment, paymentConfig, PaymentError, syncProviderPayment } from '../../server/mercadoPago.js';

function scalar(value: string | string[] | undefined) { return Array.isArray(value) ? '' : value ?? ''; }

export function validateMercadoPagoSignature(signatureHeader: string, requestId: string, dataId: string, secret: string): boolean {
  if (!requestId || !dataId || !secret) return false;
  try {
    // Delayed retries are safe: reread the signed ID from Mercado Pago, then
    // apply its provider timestamp using the private transaction ledger.
    WebhookSignatureValidator.validate({ xSignature: signatureHeader, xRequestId: requestId, dataId: dataId.toLowerCase(), secret });
    return true;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyApiSecurityHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = (req.body ?? {}) as { type?: string; topic?: string; data?: { id?: string | number } };
    const type = scalar(req.query.type) || body.type || body.topic;
    if (type !== 'payment') return res.status(200).json({ ok: true, ignored: true });
    const config = paymentConfig();
    const id = scalar(req.query['data.id']);
    if (!validateMercadoPagoSignature(scalar(req.headers['x-signature']), scalar(req.headers['x-request-id']), id, config.secret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    if (body.data?.id !== undefined && String(body.data.id) !== id) return res.status(400).json({ error: 'Payment id mismatch' });
    await syncProviderPayment(await getProviderPayment(id));
    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error instanceof PaymentError ? error.status : 503;
    console.error('[payments/webhook]', { code: error instanceof PaymentError ? error.code : 'unexpected_error' });
    // Persistence failures must be retried rather than acknowledged as saved.
    return res.status(status).json({ error: 'Não foi possível confirmar o pagamento. A notificação deve ser reenviada.' });
  }
}
