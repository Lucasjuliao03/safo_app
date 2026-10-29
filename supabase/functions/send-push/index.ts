// supabase/functions/send-push/index.ts
// Edge Function para enviar Web Push notifications
// Deploy: supabase functions deploy send-push

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@safo.app";
const APP_URL = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin");
  return {
    ...(origin && origin === APP_URL ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  };
}

async function isAuthorizedAdmin(req: Request, adminClient: ReturnType<typeof createClient>): Promise<boolean> {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return false;
  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

// ═══════════════════════════════════════════════════════ //
//  Web Push Implementation (RFC 8291 / RFC 8292)         //
//  Usa Web Crypto API nativa do Deno                     //
// ═══════════════════════════════════════════════════════ //

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateVapidAuthHeader(
  endpoint: string,
  vapidSubject: string,
  publicKeyBase64: string,
  privateKeyBase64: string
): Promise<{ authorization: string; cryptoKey: string }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // Import private key
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(privateKeyBytes),
      x: "",
      y: "",
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  ).catch(async () => {
    // Alternative: import from raw
    const publicKeyBytes = base64UrlDecode(publicKeyBase64);
    const x = base64UrlEncode(publicKeyBytes.slice(1, 33));
    const y = base64UrlEncode(publicKeyBytes.slice(33, 65));
    const d = base64UrlEncode(privateKeyBytes);
    return crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, d },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  });

  // Create JWT header and payload
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600, // 12 hours
    sub: vapidSubject,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Sign
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw (r || s)
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  } else {
    // DER format
    const rLen = sigBytes[3];
    const rStart = 4;
    const rBytes = sigBytes.slice(rStart, rStart + rLen);
    const sLenPos = rStart + rLen + 1;
    const sLen = sigBytes[sLenPos];
    const sStart = sLenPos + 1;
    const sBytes = sigBytes.slice(sStart, sStart + sLen);
    r = rBytes.length > 32 ? rBytes.slice(rBytes.length - 32) : rBytes;
    s = sBytes.length > 32 ? sBytes.slice(sBytes.length - 32) : sBytes;
    // Pad if needed
    if (r.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(r, 32 - r.length);
      r = padded;
    }
    if (s.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(s, 32 - s.length);
      s = padded;
    }
  }
  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  const token = `${unsignedToken}.${base64UrlEncode(rawSig)}`;

  return {
    authorization: `vapid t=${token}, k=${publicKeyBase64}`,
    cryptoKey: `p256ecdsa=${publicKeyBase64}`,
  };
}

async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authKey: string
): Promise<{ encrypted: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  const userPublicKeyBytes = base64UrlDecode(p256dhKey);
  const userAuthBytes = base64UrlDecode(authKey);

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Export local public key
  const localPublicKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
  const localPublicKey = new Uint8Array(localPublicKeyRaw);

  // Import user's public key
  const userPublicKey = await crypto.subtle.importKey(
    "raw",
    userPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret via ECDH
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: userPublicKey },
    localKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF for auth info
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info\0"),
    ...userPublicKeyBytes,
    ...localPublicKey,
  ]);

  // Import shared secret for HKDF
  const sharedSecretKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  // Import auth as HKDF salt
  const ikmKey = await crypto.subtle.importKey(
    "raw",
    userAuthBytes,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  // Step 1: PRK = HKDF-Extract(auth, shared_secret)
  const prkBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: userAuthBytes, info: authInfo },
    sharedSecretKey,
    256
  );
  const prk = new Uint8Array(prkBits);

  // Step 2: Derive content encryption key
  const cekInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
  ]);
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HKDF" }, false, ["deriveBits"]);
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo },
    prkKey,
    128
  );

  // Step 3: Derive nonce
  const nonceInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: nonce\0"),
  ]);
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    prkKey,
    96
  );

  // Step 4: Encrypt payload
  const paddedPayload = new Uint8Array([...new TextEncoder().encode(payload), 2]); // delimiter byte

  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(cekBits),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonceBits) },
    encryptionKey,
    paddedPayload
  );

  const encrypted = new Uint8Array(encryptedBuffer);

  return { encrypted, salt, localPublicKey };
}

async function sendWebPush(
  endpoint: string,
  p256dhKey: string,
  authKey: string,
  payload: string
): Promise<{ success: boolean; statusCode: number; error?: string }> {
  try {
    const { encrypted, salt, localPublicKey } = await encryptPayload(payload, p256dhKey, authKey);

    // Build aes128gcm header
    const recordSize = new ArrayBuffer(4);
    new DataView(recordSize).setUint32(0, encrypted.length + 86); // header + content
    const header = new Uint8Array([
      ...salt,
      ...new Uint8Array(recordSize),
      localPublicKey.length,
      ...localPublicKey,
    ]);
    const body = new Uint8Array([...header, ...encrypted]);

    const vapidHeaders = await generateVapidAuthHeader(
      endpoint,
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": body.length.toString(),
        Authorization: vapidHeaders.authorization,
        TTL: "86400",
        Urgency: "normal",
      },
      body,
    });

    if (response.status === 201 || response.status === 200) {
      return { success: true, statusCode: response.status };
    }

    const errorText = await response.text().catch(() => "");
    return {
      success: false,
      statusCode: response.status,
      error: `HTTP ${response.status}: ${errorText}`,
    };
  } catch (err: any) {
    return { success: false, statusCode: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════ //
//  HTTP Handler                                          //
// ═══════════════════════════════════════════════════════ //

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    return new Response(null, { status: origin === APP_URL ? 204 : 403, headers: corsHeaders(req) });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders(req) });
    }
    if (!(await isAuthorizedAdmin(req, adminClient))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders(req) });
    }
    const body = await req.json();

    // Modo 1: Enviar para um user_id específico
    if (body.user_id) {
      const { user_id, title, body: msgBody, url, type, icon } = body;

      // Buscar subscriptions ativas do usuário
      const { data: subscriptions, error: subError } = await adminClient
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", true);

      if (subError || !subscriptions?.length) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma subscription ativa", sent: 0 }),
          { status: 200, headers: corsHeaders(req) }
        );
      }

      const payload = JSON.stringify({
        title: title || "SAFO",
        body: msgBody || "",
        url: url || "/",
        icon: icon || "/app.png",
        tag: `safo-${type || "custom"}-${Date.now()}`,
      });

      let sent = 0;
      let failed = 0;

      for (const sub of subscriptions) {
        const result = await sendWebPush(sub.endpoint, sub.p256dh_key, sub.auth_key, payload);

        // Log do envio
        await adminClient.from("notification_logs").insert({
          user_id,
          notification_type: type || "custom",
          title: title || "SAFO",
          body: msgBody || "",
          url,
          status: result.success ? "sent" : result.statusCode === 410 ? "expired_subscription" : "failed",
          error_message: result.error || null,
          push_subscription_id: sub.id,
          motivational_message_id: body.motivational_message_id || null,
        });

        if (result.success) {
          sent++;
        } else {
          failed++;
          // HTTP 410 Gone = subscription expirada, marcar como inativa
          if (result.statusCode === 410 || result.statusCode === 404) {
            await adminClient
              .from("push_subscriptions")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("id", sub.id);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, sent, failed }),
        { status: 200, headers: corsHeaders(req) }
      );
    }

    return new Response(
      JSON.stringify({ error: "Forneça user_id" }),
      { status: 400, headers: corsHeaders(req) }
    );
  } catch (err: any) {
    console.error("send-push error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders(req) }
    );
  }
});
