import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { digest,token } from '../src/auth/security.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
export async function dashboardTests(pool:pg.Pool,t:TestContext){
  await t.test('dashboard operations are tenant-scoped, protected and content-free',async()=>{
    const tenant=randomUUID(),user=randomUUID(),application=randomUUID(),raw=token();
    await pool.query('INSERT INTO ethiosms.tenants(id,name,enabled) VALUES ($1,$2,true)',[tenant,'dashboard']);
    await pool.query('INSERT INTO ethiosms.users(id,tenant_id,username,enabled) VALUES ($1,$2,$3,true)',[user,tenant,'dashboard_owner']);
    await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name,enabled) VALUES ($1,$2,$3,true)',[application,tenant,'dashboard']);
    await pool.query("INSERT INTO ethiosms.sessions(token_hash,tenant_id,user_id,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')",[digest(raw),tenant,user]);
    const headers={Cookie:`ethiosms_session=${raw}`,'X-EthioSMS-Request':'1','Idempotency-Key':'dashboard-fixture'};
    const app=createApp(loadConfig({PAYLOAD_ENCRYPTION_KEY:'8'.repeat(64)}),'/nonexistent',undefined,pool);
    await request(app).get('/api/admin/overview').set(headers).expect(403);
    await request(app).post(`/api/dashboard/messages?applicationId=${application}`).send({to:'0912345678',message:'Private dashboard text'}).expect(403);
    const result=await request(app).post(`/api/dashboard/messages?applicationId=${application}`).set(headers).send({to:'0912345678',message:'Private dashboard text'}).expect(202);
    assert.equal(result.body.status,'queued');assert.ok(!JSON.stringify(result.body).includes('Private dashboard text'));
    const history=await request(app).get(`/api/dashboard/messages?applicationId=${application}`).set(headers).expect(200);assert.equal(history.body.messages.length,1);
    const other=(await pool.query('SELECT id FROM ethiosms.applications WHERE tenant_id<>$1 LIMIT 1',[tenant])).rows[0].id;
    await request(app).get(`/api/dashboard/messages?applicationId=${other}`).set(headers).expect(404);
    await request(app).get(`/api/dashboard/messages/${result.body.id}?applicationId=${other}`).set(headers).expect(404);
  });
}
