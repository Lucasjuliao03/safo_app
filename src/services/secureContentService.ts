import { supabase } from "@/lib/supabase";

export type SecureContentType = "questions" | "flashcards" | "summaries" | "subjects" | "topics";

interface ContentParams {
  courseId?: string | number | null;
  lawIds?: number[] | null;
  ids?: Array<string | number> | null;
}

export class SecureContentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SecureContentError";
  }
}

const responseCache = new Map<string, { expiresAt: number; data: unknown[] }>();
const pendingRequests = new Map<string, Promise<unknown[]>>();
const cacheLifetimeMs = 30_000;

export async function validAccessToken(forceRefresh = false): Promise<{ token: string; userId: string }> {
  let { data: { session } } = await supabase.auth.getSession();
  const nearExpiry = !session?.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 30;

  if (forceRefresh || nearExpiry) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw new SecureContentError("Sessão expirada. Entre novamente.", 401);
    session = data.session;
  }

  if (!session?.access_token || !session.user?.id) {
    throw new SecureContentError("Usuário não autenticado", 401);
  }
  return { token: session.access_token, userId: session.user.id };
}

async function requestContent<T>(url: string, token: string): Promise<T[]> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new SecureContentError(payload.error || "Não foi possível carregar o conteúdo", response.status);
  }

  const payload = await response.json();
  return (payload.data ?? []) as T[];
}

export async function fetchSecureContent<T>(
  type: SecureContentType,
  params: ContentParams = {},
): Promise<T[]> {
  const search = new URLSearchParams();
  if (params.courseId) search.set("courseId", String(params.courseId));
  if (params.lawIds?.length) search.set("lawIds", params.lawIds.join(","));
  if (params.ids?.length) search.set("ids", params.ids.join(","));
  const suffix = search.toString();
  const url = `/api/content/${type}${suffix ? `?${suffix}` : ""}`;

  const initial = await validAccessToken();
  const cacheKey = `${initial.userId}:${url}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data as T[];

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending as Promise<T[]>;

  const request = (async () => {
    try {
      let data: T[];
      try {
        data = await requestContent<T>(url, initial.token);
      } catch (error) {
        if (!(error instanceof SecureContentError) || error.status !== 401) throw error;
        const refreshed = await validAccessToken(true);
        data = await requestContent<T>(url, refreshed.token);
      }

      responseCache.set(cacheKey, { expiresAt: Date.now() + cacheLifetimeMs, data });
      return data;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
}
