import { loadConfig } from '../config.js';
import { createDatabase } from '../db/pool.js';
import { databaseReady } from '../db/migrations.js';
import { createAccount,recoverAdmin } from './accounts.js';

async function main() {
  const config=loadConfig();
  const [action,username]=process.argv.slice(2);
  if (!config.databaseUrl || !username || !['bootstrap','recover'].includes(action??'')) throw new Error('Configuration required');
  const pool=createDatabase(config.databaseUrl);
  try {
    if (!await databaseReady(pool)) throw new Error('Migrations required');
    const result=action==='bootstrap'?await createAccount(pool,username,undefined,true):await recoverAdmin(pool,username);
    console.info('Private one-time setup token: keep this output confidential. Expires in 24 hours.');
    console.info(JSON.stringify(result));
  } finally { await pool.end(); }
}
main().catch(()=>{console.error('Administrator setup failed. Check configuration, migrations, username, and existing administrator status.');process.exitCode=1;});
