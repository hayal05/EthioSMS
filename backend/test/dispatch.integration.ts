import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { reserveMessage } from '../src/developer/quotas.js';
import { encryptPayload,payloadContext } from '../src/messaging/crypto.js';
import { Dispatcher } from '../src/messaging/dispatch.js';
export async function dispatchTests(pool:pg.Pool,t:TestContext){
  const key='4'.repeat(64),tenant=randomUUID(),app=randomUUID();
  await pool.query('INSERT INTO ethiosms.tenants(id,name,enabled) VALUES ($1,$2,true)',[tenant,'dispatch']);
  await pool.query('INSERT INTO ethiosms.users(id,tenant_id,username,enabled) VALUES ($1,$2,$3,true)',[randomUUID(),tenant,'dispatch_owner']);
  await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name,enabled) VALUES ($1,$2,$3,true)',[app,tenant,'dispatch']);
  // Isolate this suite from earlier queued fixtures without deleting quota history.
  await pool.query("UPDATE ethiosms.message_recipients SET status='cancelled' WHERE status='queued'");
  const submit=async(scenario:string)=>{const idempotencyKey=randomUUID();return reserveMessage(pool,{tenantId:tenant,applicationId:app,idempotencyKey,requestHash:'e'.repeat(64),kind:'notification',payloadCiphertext:encryptPayload(key,payloadContext(tenant,app,idempotencyKey),{message:'Test',mockScenario:scenario}),expiresAt:new Date(Date.now()+3600000),recipients:[{phoneNumber:'0912345678',segments:1}]});};
  const state=async(id:string)=>(await pool.query('SELECT * FROM ethiosms.message_recipients WHERE job_id=$1',[id])).rows[0];
  await t.test('pause, parallel claims, acceptance and settlement are durable',async()=>{
    const id=await submit('success');const first=new Dispatcher(pool,key),second=new Dispatcher(pool,key);
    await first.drain();assert.equal((await state(id)).status,'queued');
    await pool.query('UPDATE ethiosms.settings SET sending_paused=false');
    await Promise.all([first.drain(),second.drain()]);
    const row=await state(id);assert.equal(row.status,'delivered');assert.equal(row.usage_settled,true);
    assert.equal((await pool.query('SELECT count(*) FROM ethiosms.message_attempts WHERE recipient_id=$1',[row.id])).rows[0].count,'1');
    await new Dispatcher(pool,key).drain();assert.equal((await state(id)).attempt_count,1);
  });
  await t.test('unknown outcomes never resend; rejection releases quota; expiry does not send',async()=>{
    const unknown=await submit('timeout'),rejected=await submit('rejected'),expired=await submit('success');
    await pool.query("UPDATE ethiosms.message_jobs SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[expired]);
    const worker=new Dispatcher(pool,key);await worker.drain();await worker.drain();
    assert.equal((await state(unknown)).status,'unknown');assert.equal((await state(unknown)).attempt_count,1);
    assert.equal((await state(rejected)).status,'failed');assert.equal((await state(expired)).status,'expired');assert.equal((await state(expired)).attempt_count,0);
    const reservations=(await pool.query('SELECT job_id,state FROM ethiosms.usage_reservations WHERE job_id=ANY($1::uuid[])',[[unknown,rejected,expired]])).rows;
    assert.equal(reservations.find(r=>r.job_id===unknown).state,'consumed');assert.equal(reservations.find(r=>r.job_id===rejected).state,'released');
  });
  await t.test('offline retries are bounded and abandoned claims become unknown',async()=>{
    const id=await submit('offline'),worker=new Dispatcher(pool,key);
    for(let i=0;i<5;i++){await pool.query("UPDATE ethiosms.message_recipients SET available_at=now()-interval '1 second' WHERE job_id=$1",[id]);await worker.drain();}
    assert.equal((await state(id)).status,'failed');assert.equal((await state(id)).attempt_count,5);
    const lost=await submit('success');await pool.query("UPDATE ethiosms.message_recipients SET status='claimed',lease_token=$2,lease_expires_at=now()-interval '1 second',attempt_count=1 WHERE job_id=$1",[lost,randomUUID()]);
    await worker.drain();assert.equal((await state(lost)).status,'unknown');assert.equal((await state(lost)).attempt_count,1);
  });
  await pool.query('UPDATE ethiosms.settings SET sending_paused=true');
}
