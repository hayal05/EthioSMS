import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { issueKey } from '../src/developer/keys.js';
import { decryptPayload,payloadContext } from '../src/messaging/crypto.js';

export async function messageTests(pool:pg.Pool,t:TestContext){
  const encryption='3'.repeat(64),config=loadConfig({PAYLOAD_ENCRYPTION_KEY:encryption});
  const app=createApp(config,'/nonexistent',undefined,pool);
  await pool.query('UPDATE ethiosms.settings SET key_requests_per_minute=1000,application_requests_per_minute=1000,tenant_requests_per_minute=1000,global_requests_per_minute=1000');
  async function fixture(name:string){
    const tenant=randomUUID(),application=randomUUID(),user=randomUUID();
    await pool.query('INSERT INTO ethiosms.tenants(id,name,enabled) VALUES ($1,$2,true)',[tenant,name]);
    await pool.query('INSERT INTO ethiosms.users(id,tenant_id,username,enabled) VALUES ($1,$2,$3,true)',[user,tenant,name]);
    await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name,enabled) VALUES ($1,$2,$3,true)',[application,tenant,name]);
    const key=await issueKey(pool,tenant,application,['messages:send','messages:read','usage:read']);
    return {tenant,application,auth:`Bearer ${key.apiKey}`};
  }
  const a=await fixture('message_a'),b=await fixture('message_b');
  const otherApp=randomUUID();await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name,enabled) VALUES ($1,$2,$3,true)',[otherApp,a.tenant,'Other app']);
  const otherKey=await issueKey(pool,a.tenant,otherApp,['messages:read']);
  const sendOnly=await issueKey(pool,a.tenant,a.application,['messages:send']);
  const text='ሀ'.repeat(71),body={to:'0912345678',message:text,expiresInSeconds:900,mockScenario:'delayed'};
  let firstId='';
  await t.test('submission is authenticated, encrypted, idempotent, and never claims delivery',async()=>{
    await request(app).post('/api/v1/messages').send(body).expect(401);
    const noEncryption=createApp(loadConfig({}),'/nonexistent',undefined,pool);
    await request(noEncryption).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key','missing-config').send(body).expect(503);
    const first=await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key','same-request').send(body).expect(202);
    firstId=first.body.id;assert.equal(first.body.status,'queued');assert.equal(first.body.mode,'mock');assert.equal(first.body.totalSegments,2);assert.equal(first.body.encoding,'UTF-16');
    assert.ok(!JSON.stringify(first.body).includes(text));assert.ok(!JSON.stringify(first.body).includes('+251912345678'));
    const saved=(await pool.query('SELECT payload_ciphertext,request_hash FROM ethiosms.message_jobs WHERE id=$1',[firstId])).rows[0];
    assert.ok(!saved.payload_ciphertext.includes(text));assert.match(saved.request_hash,/^[a-f0-9]{64}$/);
    assert.deepEqual(decryptPayload(encryption,payloadContext(a.tenant,a.application,'same-request'),saved.payload_ciphertext),{message:text,mockScenario:'delayed'});
    const responses=await Promise.all(Array.from({length:4},()=>request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key','same-request').send({...body,to:'+251912345678'}).expect(202)));
    assert.ok(responses.every(response=>response.body.id===firstId&&response.body.expiresAt===first.body.expiresAt));
    const reservations=await pool.query('SELECT segments FROM ethiosms.usage_reservations WHERE tenant_id=$1',[a.tenant]);assert.equal(reservations.rows.length,1);assert.equal(reservations.rows[0].segments,2);
    await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key','same-request').send({...body,message:'Changed'}).expect(409);
    await request(app).get(`/api/v1/messages/${firstId}`).set('Authorization',a.auth).expect(200);
    await request(app).get(`/api/v1/messages/${firstId}`).set('Authorization',`Bearer ${sendOnly.apiKey}`).expect(403);
    await request(app).get(`/api/v1/messages/${firstId}`).set('Authorization',b.auth).expect(404);
    await request(app).get(`/api/v1/messages/${firstId}`).set('Authorization',`Bearer ${otherKey.apiKey}`).expect(404);
  });
  await t.test('bounded history pagination preserves microseconds and isolates applications',async()=>{
    const ids=[firstId];
    const baseTime=(await pool.query("SELECT date_trunc('second',now())-interval '1 hour' AS base")).rows[0].base;
    for(let i=0;i<2;i++){
      const result=await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key',`page-${i}`).send({to:'0712345678',message:'History fixture'}).expect(202);
      ids.push(result.body.id);
      await pool.query("UPDATE ethiosms.message_jobs SET created_at=$1::timestamptz+$2*interval '1 microsecond' WHERE id=$3",[baseTime,123001+i,result.body.id]);
    }
    const found:string[]=[];let cursor:string|null=null;
    for(let i=0;i<5;i++){
      const query:Record<string,string|number>={limit:1};if(cursor)query.cursor=cursor;
      const result=await request(app).get('/api/v1/messages').query(query).set('Authorization',a.auth).expect(200);
      found.push(...result.body.messages.map((item:{id:string})=>item.id));cursor=result.body.nextCursor;
      assert.ok(!JSON.stringify(result.body).includes('payload_ciphertext'));
      if(!cursor)break;
    }
    assert.equal(new Set(found).size,3);assert.deepEqual(new Set(found),new Set(ids));
    const isolated=await request(app).get('/api/v1/messages').set('Authorization',`Bearer ${otherKey.apiKey}`).expect(200);assert.deepEqual(isolated.body.messages,[]);
    await request(app).get('/api/v1/messages?cursor=invalid').set('Authorization',a.auth).expect(400);
    const invalidDateCursor=Buffer.from(JSON.stringify({createdAt:'0',id:firstId})).toString('base64url');
    await request(app).get('/api/v1/messages').query({cursor:invalidDateCursor}).set('Authorization',a.auth).expect(400);
    await request(app).get('/api/v1/messages?limit=101').set('Authorization',a.auth).expect(400);
  });
  await t.test('validation errors are explicit and mock scenarios remain queued',async()=>{
    const invalid=[{...body,to:['0912345678']},{...body,expiresInSeconds:0},{...body,message:'ሀ'.repeat(671)},{...body,kind:'otp'},{...body,mockScenario:'live'},{...body,to:'+14155552671'}];
    for(const value of invalid)await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key',randomUUID()).send(value).expect(400);
    await request(app).post('/api/v1/messages').set('Authorization',a.auth).send(body).expect(400);
    await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key','bad-json').type('json').send('{').expect(400);
    await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key','wrong-type').type('text').send('text').expect(415);
    await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key','too-large').send({to:'0912345678',message:'a'.repeat(20000)}).expect(413);
    for(const scenario of ['success','rejected','timeout','offline','delayed']){
      const result=await request(app).post('/api/v1/messages').set('Authorization',a.auth).set('Idempotency-Key',`scenario-${scenario}`).send({to:'0912345678',message:'Mock only',mockScenario:scenario}).expect(202);
      assert.equal(result.body.status,'queued');assert.equal(result.body.mode,'mock');
    }
  });
  await t.test('simultaneous public submissions cannot overspend calculated Unicode segment quotas',async()=>{
    const c=await fixture('message_c');
    await pool.query('UPDATE ethiosms.settings SET global_daily_segments=100,tenant_daily_segments=3,application_daily_segments=3');
    const responses=await Promise.all(Array.from({length:6},(_,i)=>request(app).post('/api/v1/messages').set('Authorization',c.auth).set('Idempotency-Key',`concurrent-${i}`).send({to:'0912345678',message:text})));
    assert.equal(responses.filter(response=>response.status===202).length,1);assert.ok(responses.every(response=>[202,429].includes(response.status)));
    const stored=await pool.query('SELECT count(*) FROM ethiosms.message_jobs WHERE tenant_id=$1',[c.tenant]);assert.equal(stored.rows[0].count,'1');
    const reservation=await pool.query('SELECT segments FROM ethiosms.usage_reservations WHERE tenant_id=$1',[c.tenant]);assert.equal(reservation.rows[0].segments,2);
    const use=await request(app).get('/api/v1/usage').set('Authorization',c.auth).expect(200);assert.equal(use.body.application_reserved,2);assert.equal(use.body.application_remaining,1);
  });
  await pool.query('UPDATE ethiosms.settings SET global_daily_segments=200,tenant_daily_segments=50,application_daily_segments=50,key_requests_per_minute=20,application_requests_per_minute=30,tenant_requests_per_minute=60,global_requests_per_minute=120');
}
