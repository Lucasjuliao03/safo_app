import { describe, expect, it } from 'vitest';
import { ApiResponseError, readApiJson } from '@/lib/apiJson';

describe('API response contract', () => {
  it('rejects the SPA HTML even when the HTTP status is 200', async () => {
    const response = new Response('<!doctype html><html>SAFO</html>', {
      status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    await expect(readApiJson(response, 'Falha')).rejects.toMatchObject({ name: 'ApiResponseError', status: 502 });
  });
  it('rejects HTML mislabeled as JSON without leaking a SyntaxError', async () => {
    const response = new Response('<!doctype html>', { headers: { 'Content-Type': 'application/json' } });
    await expect(readApiJson(response, 'Falha')).rejects.toBeInstanceOf(ApiResponseError);
  });
  it('preserves the server error and status from a JSON response', async () => {
    const response = new Response(JSON.stringify({ error: 'Sessão inválida ou expirada' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
    await expect(readApiJson(response, 'Falha')).rejects.toMatchObject({ status: 401, message: 'Sessão inválida ou expirada' });
  });
  it('reads JSON objects, including structured JSON MIME types', async () => {
    const response = new Response(JSON.stringify({ data: [] }), {
      headers: { 'Content-Type': 'application/problem+json; charset=utf-8' },
    });
    expect(await readApiJson(response, 'Falha')).toEqual({ data: [] });
  });
  it('preserves the machine code to distinguish a used-up trial from other access errors', async () => {
    const response = new Response(JSON.stringify({ error: 'Ative sua conta.', code: 'trial_exhausted' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
    await expect(readApiJson(response, 'Falha')).rejects.toMatchObject({ status: 403, code: 'trial_exhausted' });
  });
  it.each(['null', '42', '[]'])('rejects invalid API envelopes: %s', async body => {
    const response = new Response(body, { headers: { 'Content-Type': 'application/json' } });
    await expect(readApiJson(response, 'Falha')).rejects.toMatchObject({ status: 502 });
  });
});
