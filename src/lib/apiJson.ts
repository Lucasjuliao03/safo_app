export class ApiResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiResponseError';
  }
}

/** Reject SPA fallbacks, proxy pages and malformed JSON before using an API payload. */
export async function readApiJson<T extends object>(response: Response, fallbackMessage: string): Promise<T> {
  const unavailable = 'O serviço do site está indisponível. Atualize a página e tente novamente.';
  const status = response.ok ? 502 : response.status;
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiResponseError(unavailable, status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiResponseError(unavailable, status);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiResponseError(unavailable, status);
  }
  if (!response.ok) {
    const message = (payload as { error?: unknown }).error;
    throw new ApiResponseError(typeof message === 'string' ? message : fallbackMessage, response.status);
  }
  return payload as T;
}
