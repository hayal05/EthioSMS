import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { reserveMessage } from '../src/developer/quotas.js';
import { maintain } from '../src/db/maintenance.js';
import { transaction } from '../src/db/pool.js';
import { settleRecipient } from '../src/messaging/dispatch.js';
export async function maintenanceTests(pool:pg.Pool,t:TestContext){
 await t.test('retention settles unsent expiry, preserves unsettled work and purges dependents safely',async()=>{
  const tenant=randomUUID(),app=randomUUID();await pool.query('INSERT INTO ethiosms.tenants(id,name,enabled) VALUES ($1,$2,true)',[tenant,'maintenance']);
  await pool.query('INSERT INTO ethiosms.users(id,tenant_id,username,enabled) VALUES ($1,$2,$3,true)',[randomUUID(),tenant,'maintenance_owner']);
  await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name,enabled) VALUES ($1,$2,$3,true)',[app,tenant,'maintenance']);
  const submit=(kind:'otp'|'notification'='notification')=>reserveMessage(pool,{tenantId:tenant,applicationId:app,idempotencyKey:randomUUID(),requestHash:'f'.repeat(64),kind,payloadCiphertext:'encrypted-fixture',expiresAt:new Date(Date.now()+3600000),recipients:[{phoneNumber:'0912345678',segments:1}]});
  const old=await submit(),active=await submit(),unknown=await submit(),otp=await submit('otp');
  await pool.query("UPDATE ethiosms.message_jobs SET created_at=now()-interval '40 days',expires_at=now()-interval '39 days' WHERE id=ANY($1::uuid[])",[[old,unknown]]);
  await pool.query("UPDATE ethiosms.message_recipients SET status='unknown' WHERE job_id=$1",[unknown]);
  await pool.query("UPDATE ethiosms.message_jobs SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[otp]);
  const result=await maintain(pool);assert.ok(result.expired>=2);assert.ok(result.purged>=1);
  assert.equal((await pool.query('SELECT count(*) FROM ethiosms.message_jobs WHERE id=$1',[old])).rows[0].count,'0');
  assert.equal((await pool.query('SELECT count(*) FROM ethiosms.message_jobs WHERE id=$1',[active])).rows[0].count,'1');
  assert.equal((await pool.query('SELECT count(*) FROM ethiosms.message_jobs WHERE id=$1',[unknown])).rows[0].count,'1');
  assert.equal((await pool.query('SELECT payload_ciphertext FROM ethiosms.message_jobs WHERE id=$1',[otp])).rows[0].payload_ciphertext,'');
  const recipient=(await pool.query('SELECT id FROM ethiosms.message_recipients WHERE job_id=$1',[unknown])).rows[0];
  await transaction(pool,client=>settleRecipient(client,recipient.id,true));await maintain(pool);
  assert.equal((await pool.query('SELECT count(*) FROM ethiosms.message_jobs WHERE id=$1',[unknown])).rows[0].count,'0');
  const counters=(await pool.query("SELECT reserved_segments,used_segments FROM ethiosms.usage_counters WHERE scope='tenant' AND scope_id=$1",[tenant])).rows[0];assert.equal(counters.reserved_segments,'1');assert.equal(counters.used_segments,'1');
 });
}
