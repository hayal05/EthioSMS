import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/pool.js';
import { migrate,databaseReady } from '../src/db/migrations.js';
import { reserveMessage } from '../src/developer/quotas.js';
const url=process.env.TEST_DATABASE_URL;
if(!url)throw Error('Disposable database URL required');
const parsed=new URL(url);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||!parsed.pathname.endsWith('_test'))throw Error('Disposable localhost test database required');
const pool=createDatabase(url),tenant='10000000-0000-4000-8000-000000000001',application='10000000-0000-4000-8000-000000000002';
try{
 if(process.argv[2]==='seed'){
  await migrate(pool);
  await pool.query('INSERT INTO ethiosms.tenants(id,name,enabled) VALUES ($1,$2,true)',[tenant,'restart fixture']);
  await pool.query('INSERT INTO ethiosms.users(id,tenant_id,username,enabled) VALUES ($1,$2,$3,true)',['10000000-0000-4000-8000-000000000003',tenant,'restart_fixture']);
  await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name,enabled) VALUES ($1,$2,$3,true)',[application,tenant,'restart fixture']);
  await reserveMessage(pool,{tenantId:tenant,applicationId:application,idempotencyKey:'restart-fixture',requestHash:'a'.repeat(64),kind:'notification',payloadCiphertext:'test-fixture-not-dispatchable',expiresAt:new Date(Date.now()+3600000),recipients:[{phoneNumber:'+251912345678',segments:1}]});
 }else{
  assert.equal(await databaseReady(pool),true);
  const result=await pool.query('SELECT r.status FROM ethiosms.message_jobs j JOIN ethiosms.message_recipients r ON r.job_id=j.id WHERE j.tenant_id=$1 AND j.idempotency_key=$2',[tenant,'restart-fixture']);assert.equal(result.rows[0].status,'queued');
 }
 console.info('Disposable queue fixture verified');
}finally{await pool.end();}
