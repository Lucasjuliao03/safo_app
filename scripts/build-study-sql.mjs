import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const checking = process.argv.includes('--check');
const guard = read('scripts/sql/study-install-locks.sql').trim();
const guardPattern = /^-- BEGIN STUDY INSTALL LOCK GUARD\r?\n[\s\S]*?^-- END STUDY INSTALL LOCK GUARD\r?\n?/gm;
const migrations = ['supabase/migrations/20261029214747_enforce_lifetime_trial.sql',
  'supabase/migrations/20261030004029_atomic_study_progress.sql',
  'supabase/migrations/20261030012116_global_app_access_gate.sql'];
const policyHelpers = 'supabase/migrations/20261030040701_restore_curriculum_policy_helpers.sql';
// Keep direct CLI migrations protected too. The combined installer acquires
// these locks exactly once, before any migration or authorization helper.
for (const migration of migrations) {
  const source = read(migration);
  const updated = source.replace(guardPattern, '').replace(/^BEGIN;\r?\n+/m, `BEGIN;\n${guard}\n\n`);
  if (checking) {
    if (source !== updated) throw new Error(`Migration lock guard is out of date: ${migration}`);
  } else if (source !== updated) writeFileSync(resolve(root, migration), updated);
}
const unwrap = source => source.replace(guardPattern, '').replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '');
// Only the authorization helpers are needed here; financial/payment migrations
// are deliberately excluded from this targeted study repair installer.
const baseline = read('supabase/migrations/20260831010000_production_security_baseline.sql');
const helpers = baseline.slice(baseline.indexOf('CREATE OR REPLACE FUNCTION public.is_admin_user()'),
  baseline.indexOf('-- Profiles:')).replace(/-- -+\s*$/, '');
const output = `-- SAFO: executar este arquivo inteiro no SQL Editor do Supabase.\n-- Instala acesso e persistência de estudo juntos, sem apagar histórico.\n-- Use uma única aba. Se o banco estiver ocupado, a instalação aborta sem esperar.\nBEGIN;\n${guard}\n\n${helpers}\n`
  + migrations.map(migration => unwrap(read(migration))).join('\n')
  + '\n' + unwrap(read(policyHelpers))
  + '\nCOMMIT;\n';
const path = resolve(root, 'sql/INSTALAR_CORRECAO_ESTUDOS.sql');
if (checking) {
  if (readFileSync(path, 'utf8') !== output) throw new Error('SQL installer is out of date: run node scripts/build-study-sql.mjs');
} else {
  writeFileSync(path, output);
  console.log('Generated sql/INSTALAR_CORRECAO_ESTUDOS.sql');
}
