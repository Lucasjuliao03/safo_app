import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveVercelRewrite as rewrite } from './helpers/vercelRewrite';

describe('Vercel SPA and function routing', () => {
  it.each(['questions', 'flashcards', 'summaries', 'subjects', 'topics'])('maps %s to the concrete Node function', type => {
    expect(rewrite(`/api/content/${type}`)).toBe(`/api/content?type=${type}`);
    expect(existsSync(resolve(process.cwd(), 'api/content.ts'))).toBe(true);
  });
  it.each(['/api', '/api/health', '/api/content', '/api/study', '/api/mentoria/enroll', '/api/payments/webhook', '/api/unknown', '/assets/missing.js'])(
    'never rewrites %s to the SPA HTML', path => { expect(rewrite(path)).toBeNull(); },
  );
  it.each(['/questoes', '/mentoria', '/flashcards', '/resumos', '/'])('keeps browser navigation to %s working', path => {
    expect(rewrite(path)).toBe('/index.html');
  });
});
