import assert from 'node:assert/strict';
import type pg from 'pg';
import type { TestContext } from 'node:test';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createInitialAdmin } from '../src/auth/accounts.js';
export async function initialAdminTests(pool:pg.Pool,t:TestContext){
 await t.test('email-only first account becomes the sole master admin and closes public registration',async()=>{
  const app=createApp(loadConfig({}),'/nonexistent',undefined,pool),header={'X-EthioSMS-Request':'1'},password='a strong first admin password';
  try{
   const initial=await request(app).get('/api/auth/setup/status').expect(200);assert.equal(initial.body.setupAvailable,true);
   await request(app).post('/api/auth/setup/initial').send({email:'owner@example.com',password,confirmPassword:password}).expect(403);
   await request(app).post('/api/auth/setup/initial').set(header).send({email:'bad-email',password,confirmPassword:password}).expect(400);
   await request(app).post('/api/auth/setup/initial').set(header).send({email:'owner@example.com',password,confirmPassword:'different'}).expect(400);
   const responses=await Promise.all(['OwnerA@Example.com','OwnerB@Example.com'].map(email=>request(app).post('/api/auth/setup/initial').set(header).send({email,password,confirmPassword:password})));
   assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
   const created=responses.find(r=>r.status===201)!;assert.equal(created.body.user.role,'admin');assert.equal(created.body.user.email,created.body.user.email.toLowerCase());assert.ok(!JSON.stringify(created.body).includes(password));
   assert.equal((await pool.query('SELECT count(*) FROM ethiosms.users')).rows[0].count,'1');
   assert.equal((await pool.query('SELECT count(*) FROM ethiosms.setup_tokens')).rows[0].count,'0');
   assert.ok(created.headers['set-cookie']);
   await request(app).get('/api/auth/me').set('Cookie',String(created.headers['set-cookie'])).expect(200);
   const login=await request(app).post('/api/auth/login').set(header).send({identifier:created.body.user.email.toUpperCase(),password}).expect(200);assert.equal(login.body.user.id,created.body.user.id);
   const status=await request(app).get('/api/auth/setup/status').expect(200);assert.equal(status.body.setupRequired,false);assert.equal(status.body.setupAvailable,false);
   await request(app).post('/api/auth/setup/initial').set(header).send({email:'other@example.com',password,confirmPassword:password}).expect(409);
   await pool.query('UPDATE ethiosms.users SET enabled=false');assert.equal((await request(app).get('/api/auth/setup/status').expect(200)).body.setupAvailable,false);
  }finally{
   // This suite runs before other fixtures on the explicitly disposable test database.
   await pool.query('DELETE FROM ethiosms.sessions; DELETE FROM ethiosms.audit_events; DELETE FROM ethiosms.setup_tokens; DELETE FROM ethiosms.users; DELETE FROM ethiosms.tenants');
  }
  const tenant=randomUUID();
  try{
   await pool.query('INSERT INTO ethiosms.tenants(id,name) VALUES ($1,$2)',[tenant,'legacy']);
   await pool.query('INSERT INTO ethiosms.users(id,tenant_id,username) VALUES ($1,$2,$3)',[randomUUID(),tenant,'legacy_user']);
   assert.equal((await request(app).get('/api/auth/setup/status').expect(200)).body.setupAvailable,false);
   await assert.rejects(createInitialAdmin(pool,'owner@example.com',password),/registration is closed/);
  }finally{await pool.query('DELETE FROM ethiosms.users;DELETE FROM ethiosms.tenants');}
 });
}
