import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync(new URL('../supabase/migrations/20261030040701_restore_curriculum_policy_helpers.sql', import.meta.url), 'utf8');
const output = '-- SAFO: execute este arquivo INTEIRO no SQL Editor do Supabase.\n'
  + '-- Corrige o 403 de can_access_subject sem alterar planos, dados ou limites.\n' + source;
const path = new URL('../sql/CORRIGIR_ACESSO_MENTORIA.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw new Error('Execute node scripts/build-mentoria-sql.mjs');
} else writeFileSync(path, output);
