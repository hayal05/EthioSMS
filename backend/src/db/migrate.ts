import { createDatabase } from './pool.js';
import { migrate } from './migrations.js';
import { loadConfig } from '../config.js';

function reportSafeError(error: unknown) {
  const value = error as { code?: unknown; severity?: unknown; message?: unknown };
  const code = typeof value?.code === 'string' && /^[0-9A-Z]{5}$/.test(value.code) ? value.code : undefined;
  const severity = typeof value?.severity === 'string' && /^[A-Z ]{1,20}$/.test(value.severity) ? value.severity : undefined;
  const message = typeof value?.message === 'string'
    ? value.message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted database URL]').slice(0, 240)
    : 'Unexpected non-PostgreSQL error';
  console.error('Migration failed.', JSON.stringify({ code, severity, message }));
  console.error('Connection credentials and SQL parameter values are not logged.');
}

async function main() {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = createDatabase(config.databaseUrl);
  try {
    const applied = await migrate(pool);
    console.info(`Database migrations applied: ${applied.length}`);
    console.info(applied.length ? applied.join(', ') : 'Database schema was already up to date.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  reportSafeError(error);
  process.exitCode = 1;
});
