import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const host = "127.0.0.1";
const port = Number(process.env.DEV_API_PORT || 3000);
const maxBodyBytes = 1_000_000;

// The production APP_URL remains untouched outside this local-only process.
process.env.APP_URL = process.env.DEV_APP_URL || "http://localhost:8080";

const localServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!localServiceKey.startsWith("eyJ") && !localServiceKey.startsWith("sb_secret_")) {
  console.warn(
    "[dev-api] SUPABASE_SERVICE_ROLE_KEY ausente ou inválida; conteúdo protegido ficará indisponível.",
  );
}

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return undefined;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("Request body too large");
    chunks.push(buffer);
  }

  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.startsWith("application/json")) return JSON.parse(raw);
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw;
}

function createVercelResponse(res: ServerResponse): VercelResponse {
  const response = res as VercelResponse;
  response.status = (statusCode: number) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body: unknown) => {
    if (!response.hasHeader("Content-Type")) {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    response.end(JSON.stringify(body));
    return response;
  };
  response.send = (body: unknown) => {
    response.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    return response;
  };
  return response;
}

async function resolveHandler(pathname: string): Promise<{ handler: Handler; type?: string } | null> {
  if (pathname === "/api/health") {
    return { handler: (await import("../api/health.js")).default };
  }
  if (pathname === "/api/study") {
    return { handler: (await import("../api/study.js")).default };
  }
  if (pathname === "/api/payments/create-preference") {
    return { handler: (await import("../api/payments/create-preference.js")).default };
  }
  if (pathname === "/api/payments/webhook") {
    return { handler: (await import("../api/payments/webhook.js")).default };
  }

  if (pathname === "/api/mentoria/enroll") {
    return { handler: (await import("../api/mentoria/enroll.js")).default };
  }

  const contentMatch = pathname.match(/^\/api\/content\/(questions|flashcards|summaries|subjects|topics)$/);
  if (contentMatch) {
    return { handler: (await import("../api/content.js")).default, type: contentMatch[1] };
  }
  return null;
}

const server = createServer(async (incoming, outgoing) => {
  const response = createVercelResponse(outgoing);
  try {
    const url = new URL(incoming.url || "/", `http://${host}:${port}`);
    const resolved = await resolveHandler(url.pathname);
    if (!resolved) return response.status(404).json({ error: "API route not found" });

    const query: Record<string, string | string[]> = {};
    for (const [key, value] of url.searchParams) {
      const current = query[key];
      query[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
    }
    if (resolved.type) query.type = resolved.type;

    const request = incoming as VercelRequest;
    request.query = query;
    request.body = await readBody(incoming);
    await resolved.handler(request, response);
  } catch (error) {
    console.error("[dev-api] request failed", error instanceof Error ? error.message : error);
    if (!response.headersSent) response.status(500).json({ error: "Local API request failed" });
    else response.end();
  }
});

server.listen(port, host, () => {
  console.log(`[dev-api] ready at http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
