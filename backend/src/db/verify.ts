import { createDatabase } from './pool.js';
import { databaseReady, readMigrations } from './migrations.js';
import { loadConfig } from '../config.js';

async function main() {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = createDatabase(config.databaseUrl);
  try {
    const expected = await readMigrations();
    const ready = await databaseReady(pool);
    if (!ready) {
      console.error(`Database verification failed: expected ${expected.length} matching migration records.`);
      process.exitCode = 1;
      return;
    }
    console.info(`Database verification passed: all ${expected.length} migration records match the repository.`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  const value = error as { code?: unknown; severity?: unknown; message?: unknown };
  const code = typeof value?.code === 'string' && /^[0-9A-Z]{5}$/.test(value.code) ? value.code : undefined;
  const severity = typeof value?.severity === 'string' && /^[A-Z ]{1,20}$/.test(value.severity) ? value.severity : undefined;
  const message = typeof value?.message === 'string'
    ? value.message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted database URL]').slice(0, 240)
    : 'Unexpected non-PostgreSQL error';
  console.error('Database verification failed.', JSON.stringify({ code, severity, message }));
  console.error('Connection credentials and SQL parameter values are not logged.');
  process.exitCode = 1;
});
