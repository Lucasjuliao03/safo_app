import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync(new URL('../supabase/migrations/20261030020232_secure_payment_lifecycle.sql', import.meta.url), 'utf8');
const output = '-- SAFO: execute o arquivo INTEIRO no SQL Editor do Supabase.\n'
  + '-- Use uma única aba, após instalar a correção de estudos. Não apaga compras.\n'
  + '-- Publique também api/, server/ e src/ atualizados.\n' + source;
const target = new URL('../sql/INSTALAR_CORRECAO_PAGAMENTOS.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Execute node scripts/build-payment-sql.mjs');
} else writeFileSync(target, output);
