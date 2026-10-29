import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedAuthClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Server configuration is incomplete");
  }
  if (!serviceRoleKey.startsWith("eyJ") && !serviceRoleKey.startsWith("sb_secret_")) {
    throw new Error("Server configuration contains an invalid Supabase service key");
  }

  cachedClient ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export async function authenticateBearer(authorization: string | undefined): Promise<User | null> {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  // JWT validation needs only the project's public key. Keeping this separate
  // prevents an invalid/rotated service key from making every session look
  // expired; the service key remains exclusive to privileged database reads.
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !publicKey) throw new Error("Supabase authentication configuration is incomplete");
  cachedAuthClient ??= createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await cachedAuthClient.auth.getUser(match[1]);
  return error ? null : data.user;
}
