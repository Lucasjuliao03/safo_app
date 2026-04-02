// Script para gerar chaves VAPID para Web Push
// Uso: node generate-vapid-keys.mjs

import { webcrypto } from 'crypto';

async function generateVAPIDKeys() {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);

  // VAPID public key: uncompressed point (04 || x || y) in base64url
  const xBuf = Buffer.from(publicJwk.x, 'base64');
  const yBuf = Buffer.from(publicJwk.y, 'base64');
  const uncompressed = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf]);
  const publicKey = uncompressed.toString('base64url');

  // VAPID private key: d parameter in base64url
  const privateKey = privateJwk.d;

  console.log('=== VAPID KEYS GENERATED ===');
  console.log('');
  console.log('PUBLIC_KEY=' + publicKey);
  console.log('PRIVATE_KEY=' + privateKey);
  console.log('');
  console.log('=== Para .env do frontend ===');
  console.log('VITE_VAPID_PUBLIC_KEY=' + publicKey);
  console.log('');
  console.log('=== Para Supabase Secrets (Edge Functions) ===');
  console.log('VAPID_PUBLIC_KEY=' + publicKey);
  console.log('VAPID_PRIVATE_KEY=' + privateKey);
  console.log('VAPID_SUBJECT=mailto:admin@safo.app');
}

generateVAPIDKeys().catch(console.error);
