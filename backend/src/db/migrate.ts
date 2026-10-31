import { createDatabase } from './pool.js';
import { migrate } from './migrations.js';
import { loadConfig } from '../config.js';

async function main() {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = createDatabase(config.databaseUrl);
  try { const applied = await migrate(pool); console.info(`Database migrations applied: ${applied.length}`); }
  finally { await pool.end(); }
}
main().catch(() => { console.error('Migration failed. Check database access and migration history. No connection details are logged.'); process.exitCode = 1; });
