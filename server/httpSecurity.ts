import type { VercelRequest, VercelResponse } from "@vercel/node";

export function getAppUrl(): string {
  const value = process.env.APP_URL?.replace(/\/$/, "");
  if (!value) throw new Error("APP_URL is not configured");

  const parsed = new URL(value);
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  return parsed.origin;
}

export function applyApiSecurityHeaders(res: VercelResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function applySameOriginCors(req: VercelRequest, res: VercelResponse): boolean {
  applyApiSecurityHeaders(res);
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const allowedOrigin = getAppUrl();

  if (origin && origin !== allowedOrigin) return false;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  return true;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

