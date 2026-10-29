import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Use the parser shipped with the installed Vercel Node builder, rather than
// duplicating the production path expressions in our HTTP test adapter.
const require = createRequire(import.meta.url);
const vercelRequire = createRequire(require.resolve('@vercel/node'));
const { match, compile } = vercelRequire('path-to-regexp') as typeof import('path-to-regexp');
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

export function resolveVercelRewrite(path: string): string | null {
  for (const route of config.rewrites) {
    const matched = match(route.source)(path);
    if (!matched) continue;
    const [pathname, query] = route.destination.split('?');
    return compile(pathname)(matched.params) + (query
      ? '?' + query.replace(/:([a-zA-Z]+)/g, (_: string, key: string) => encodeURIComponent(String(matched.params[key])))
      : '');
  }
  return null;
}
