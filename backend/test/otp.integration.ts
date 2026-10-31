import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { issueKey } from '../src/developer/keys.js';
import { decryptPayload,payloadContext } from '../src/messaging/crypto.js';
export async function otpTests(pool:pg.Pool,t:TestContext){
  const tenant=randomUUID(),application=randomUUID(),key='6'.repeat(64),secret='7'.repeat(64);
  await pool.query('INSERT INTO ethiosms.tenants(id,name,enabled) VALUES ($1,$2,true)',[tenant,'otp']);
  await pool.query('INSERT INTO ethiosms.users(id,tenant_id,username,enabled) VALUES ($1,$2,$3,true)',[randomUUID(),tenant,'otp_owner']);
  await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name,enabled) VALUES ($1,$2,$3,true)',[application,tenant,'otp']);
  await pool.query('UPDATE ethiosms.settings SET key_requests_per_minute=1000,application_requests_per_minute=1000,tenant_requests_per_minute=1000,global_requests_per_minute=1000');
  const issued=await issueKey(pool,tenant,application,['otp:request','otp:verify']);const auth=`Bearer ${issued.apiKey}`;
  const app=createApp(loadConfig({OTP_SECRET:secret,PAYLOAD_ENCRYPTION_KEY:key}),'/nonexistent',undefined,pool);
  function create(purpose:string,id=randomUUID()) {return request(app).post('/api/v1/otp/request').set('Authorization',auth).set('Idempotency-Key',id).send({to:'0912345678',purpose});}
  async function codeFor(id:string){const row=(await pool.query('SELECT j.*,o.code_digest FROM ethiosms.otp_challenges o JOIN ethiosms.message_jobs j ON j.id=o.job_id WHERE o.id=$1',[id])).rows[0];const payload=decryptPayload(key,payloadContext(tenant,application,row.idempotency_key),row.payload_ciphertext) as {message:string};const code=payload.message.match(/\d{6}/)![0];assert.notEqual(row.code_digest,code);return code;}
  const verify=(id:string,purpose:string,code:string)=>request(app).post('/api/v1/otp/verify').set('Authorization',auth).send({challengeId:id,purpose,code});
  await t.test('OTP request replay, cooldown, purpose and single-use verification',async()=>{
    const requestId=randomUUID(),first=await create('login',requestId).expect(202),id=first.body.challengeId,code=await codeFor(id);
    assert.ok(!JSON.stringify(first.body).includes(code));assert.equal((await create('login',requestId).expect(202)).body.challengeId,id);
    await create('login').expect(429);assert.equal((await verify(id,'different',code).expect(200)).body.verified,false);
    const results=await Promise.all([verify(id,'login',code),verify(id,'login',code)]);assert.equal(results.filter(r=>r.body.verified).length,1);
    assert.equal((await verify(id,'login',code).expect(200)).body.verified,false);
    const payload=(await pool.query('SELECT payload_ciphertext FROM ethiosms.message_jobs WHERE id=(SELECT job_id FROM ethiosms.otp_challenges WHERE id=$1)',[id])).rows[0];assert.equal(payload.payload_ciphertext,'');
    await pool.query('DELETE FROM ethiosms.otp_challenges WHERE id=$1',[id]);
    await create('login',requestId).expect(410);
  });
  await t.test('superseded, expired and exhausted challenges cannot verify',async()=>{
    const first=await create('reset').expect(202),oldId=first.body.challengeId,oldCode=await codeFor(oldId);
    await pool.query("UPDATE ethiosms.otp_challenges SET created_at=now()-interval '61 seconds' WHERE id=$1",[oldId]);
    const replacement=await create('reset').expect(202);assert.equal((await verify(oldId,'reset',oldCode)).body.verified,false);
    const newId=replacement.body.challengeId,newCode=await codeFor(newId),wrong=newCode==='000000'?'111111':'000000';
    for(let i=0;i<5;i++)assert.equal((await verify(newId,'reset',wrong).expect(200)).body.verified,false);
    assert.equal((await verify(newId,'reset',newCode)).body.verified,false);
    const expired=await create('expire').expect(202),expiredCode=await codeFor(expired.body.challengeId);
    await pool.query("UPDATE ethiosms.otp_challenges SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[expired.body.challengeId]);
    assert.equal((await verify(expired.body.challengeId,'expire',expiredCode)).body.verified,false);
  });
  await pool.query('UPDATE ethiosms.settings SET key_requests_per_minute=20,application_requests_per_minute=30,tenant_requests_per_minute=60,global_requests_per_minute=120');
}
