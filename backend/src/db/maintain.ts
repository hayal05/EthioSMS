import { loadConfig } from '../config.js';
import { createDatabase } from './pool.js';
import { maintain } from './maintenance.js';
async function main(){const config=loadConfig();if(!config.databaseUrl)throw Error();const pool=createDatabase(config.databaseUrl);try{console.info(JSON.stringify(await maintain(pool)));}finally{await pool.end();}}
main().catch(()=>{console.error('Maintenance failed; inspect configuration and database availability.');process.exitCode=1;});
