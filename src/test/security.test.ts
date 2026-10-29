import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateMercadoPagoSignature } from "../../api/payments/webhook";
import { sanitizeContentHtml } from "@/lib/sanitize";

describe("production security helpers", () => {
  it("accepts a valid Mercado Pago HMAC and rejects tampering", () => {
    const secret = "test-secret-with-enough-entropy";
    const dataId = "123456789";
    const requestId = "request-123";
    const timestamp = "1742505638683";
    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const signature = createHmac("sha256", secret).update(manifest).digest("hex");
    const header = `ts=${timestamp},v1=${signature}`;

    expect(validateMercadoPagoSignature(header, requestId, dataId, secret)).toBe(true);
    expect(validateMercadoPagoSignature(header, requestId, "987654321", secret)).toBe(false);
  });

  it("removes executable HTML while preserving normal content", () => {
    const sanitized = sanitizeContentHtml('<h2>Resumo</h2><img src="x" onerror="alert(1)"><script>alert(1)</script>');
    expect(sanitized).toContain("Resumo");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("script");
  });
});
