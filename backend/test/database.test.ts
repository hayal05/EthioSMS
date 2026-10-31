import assert from 'node:assert/strict';
import { developerTests } from './developer.integration.js';
import { campaignTests } from './campaign.integration.js';
import { dashboardTests } from './dashboard.integration.js';
import { otpTests } from './otp.integration.js';
import { dispatchTests } from './dispatch.integration.js';
import { messageTests } from './messages.integration.js';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createAccount, recoverAdmin } from '../src/auth/accounts.js';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../src/db/pool.js';
import { migrate, databaseReady, migrationDirectory, readMigrations } from '../src/db/migrations.js';
import { storeMessage, getMessage, type StoredMessageInput } from '../src/db/messages.js';

const url = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_DATABASE_TESTS === 'true' && !url) throw new Error('TEST_DATABASE_URL is required for CI');

test('PostgreSQL migrations, isolation, rollback, and persistent messages', { skip: !url }, async t => {
  // Destructive fixtures are restricted to an explicitly selected disposable local database.
  const parsed = new URL(url!);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) && parsed.pathname.endsWith('_test'), 'Use a disposable local database ending in _test');
  let pool = createDatabase(url!);
  const reset = async () => { await pool.query('DROP SCHEMA IF EXISTS ethiosms CASCADE; DROP TABLE IF EXISTS public.ethiosms_migrations'); };
  try {
    await reset();
    await t.test('concurrent fresh migrations apply once and readiness validates history', async () => {
      const applied = await Promise.all([migrate(pool),migrate(pool)]);
      assert.equal(applied.flat().length, (await readMigrations()).length);
      assert.deepEqual(await migrate(pool), []);
      assert.equal(await databaseReady(pool), true);
      const defaults = await pool.query('SELECT sending_paused FROM ethiosms.settings');
      assert.equal(defaults.rows[0].sending_paused, true);
    });
    const tenant = randomUUID(), otherTenant = randomUUID(), application = randomUUID(), otherApp = randomUUID();
    await pool.query('INSERT INTO ethiosms.tenants(id,name) VALUES ($1,$2),($3,$4)',[tenant,'First',otherTenant,'Second']);
    await pool.query('INSERT INTO ethiosms.applications(id,tenant_id,name) VALUES ($1,$2,$3),($4,$5,$6)',[application,tenant,'ERP',otherApp,otherTenant,'Other']);
    const input: StoredMessageInput = { tenantId:tenant, applicationId:application, idempotencyKey:'persist-test', requestHash:'a'.repeat(64), kind:'notification', payloadCiphertext:'encrypted-fixture-only', expiresAt:new Date(Date.now()+60_000), recipients:[{phoneNumber:'+251900000001',segments:1}] };
    let messageId = '';
    await t.test('stores atomically and deduplicates simultaneous submissions', async () => {
      const ids = await Promise.all([storeMessage(pool,input),storeMessage(pool,input)]);
      assert.equal(ids[0],ids[1]); messageId = ids[0]!;
      assert.equal((await getMessage(pool,tenant,application,messageId)).length,1);
      await assert.rejects(storeMessage(pool,{...input,requestHash:'b'.repeat(64)}), /Idempotency conflict/);
    });
    await t.test('wrong tenant/application cannot read or link data', async () => {
      assert.deepEqual(await getMessage(pool,otherTenant,otherApp,messageId),[]);
      assert.deepEqual(await getMessage(pool,tenant,otherApp,messageId),[]);
      await assert.rejects(storeMessage(pool,{...input,idempotencyKey:'wrong-owner',applicationId:otherApp}), {code:'23503'});
      await assert.rejects(pool.query(`INSERT INTO ethiosms.message_recipients(id,tenant_id,job_id,phone_number,segments) VALUES ($1,$2,$3,$4,1)`,[randomUUID(),otherTenant,messageId,'+251900000002']), {code:'23503'});
    });
    await t.test('invalid recipient rolls back the entire job', async () => {
      await assert.rejects(storeMessage(pool,{...input,idempotencyKey:'rollback',recipients:[...input.recipients,{phoneNumber:'invalid',segments:1}]}), {code:'23514'});
      const count = await pool.query("SELECT count(*) FROM ethiosms.message_jobs WHERE idempotency_key='rollback'");
      assert.equal(count.rows[0].count,'0');
    });
    await t.test('data remains after closing and recreating the connection pool', async () => {
      await pool.end(); pool = createDatabase(url!);
      const rows = await getMessage(pool,tenant,application,messageId);
      assert.equal(rows[0].status,'queued');
      assert.equal(rows[0].phone_number,'+251900000001');
      assert.equal(await databaseReady(pool), true);
    });
    await t.test('invites, sessions, roles, recovery, expiry, and disabling accounts', async () => {
      const app=createApp(loadConfig({}),'/nonexistent',undefined,pool);
      const admin=await createAccount(pool,'pilot_admin',undefined,true);
      await assert.rejects(createAccount(pool,'second_admin',undefined,true),/already exists/);
      const header={'X-EthioSMS-Request':'1'};
      const password='a sufficiently long password';
      await request(app).post('/api/auth/setup').send({token:admin.setupToken,password}).expect(403);
      await request(app).post('/api/auth/setup').set(header).send({token:admin.setupToken,password}).expect(200);
      await request(app).post('/api/auth/setup').set(header).send({token:admin.setupToken,password}).expect(400);
      const adminAgent=request.agent(app);
      const login=await adminAgent.post('/api/auth/login').set(header).send({username:'pilot_admin',password}).expect(200);
      assert.equal(login.body.user.role,'admin');
      assert.ok(!JSON.stringify(login.body).includes('password_hash'));
      assert.match(String(login.headers['set-cookie']),/HttpOnly/);
      assert.match(String(login.headers['set-cookie']),/SameSite=Strict/);
      await adminAgent.patch(`/api/admin/applications/${application}`).set(header).send({enabled:true}).expect(200);
      const invite=await adminAgent.post('/api/admin/users').set(header).send({username:'invited_one'}).expect(201);
      const second=await adminAgent.post('/api/admin/users').set(header).send({username:'invited_two'}).expect(201);
      const stored=await pool.query('SELECT token_hash FROM ethiosms.setup_tokens WHERE user_id=$1',[invite.body.id]);
      assert.notEqual(stored.rows[0].token_hash,invite.body.setupToken);
      await request(app).post('/api/auth/setup').set(header).send({token:invite.body.setupToken,password}).expect(200);
      const user=request.agent(app);
      await user.post('/api/auth/login').set(header).send({username:'invited_one',password}).expect(200);
      await user.get('/api/admin/users').expect(403);
      await user.patch(`/api/admin/applications/${application}`).set(header).send({enabled:false}).expect(403);
      await user.post('/api/admin/users').set(header).send({username:'not_allowed'}).expect(403);
      await user.patch(`/api/admin/users/${second.body.id}`).set(header).send({enabled:false}).expect(403);
      const disabled=await adminAgent.patch(`/api/admin/users/${invite.body.id}`).set(header).send({enabled:false}).expect(200);
      await user.get('/api/auth/me').expect(401);
      await user.post('/api/auth/login').set(header).send({username:'invited_one',password}).expect(401);
      await adminAgent.patch(`/api/admin/users/${invite.body.id}`).set(header).send({enabled:true}).expect(200);
      await user.post('/api/auth/login').set(header).send({username:'invited_one',password}).expect(200);
      const recovery=await adminAgent.post(`/api/admin/users/${invite.body.id}/recovery`).set(header).expect(200);
      await user.get('/api/auth/me').expect(401);
      await user.post('/api/auth/login').set(header).send({username:'invited_one',password}).expect(401);
      await request(app).post('/api/auth/setup').set(header).send({token:recovery.body.setupToken,password:'a different long password'}).expect(200);
      await user.post('/api/auth/login').set(header).send({username:'invited_one',password:'a different long password'}).expect(200);
      await user.post('/api/auth/logout').set(header).expect(204);
      await user.get('/api/auth/me').expect(401);
      await pool.query("UPDATE ethiosms.setup_tokens SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=$1",[second.body.id]);
      await request(app).post('/api/auth/setup').set(header).send({token:second.body.setupToken,password}).expect(400);
      // Unknown and disabled users share the same login response, and repeated attempts are limited.
      for(let i=0;i<10;i++)await request(app).post('/api/auth/login').set(header).send({username:'absent_user',password:'wrong'}).expect(401);
      await request(app).post('/api/auth/login').set(header).send({username:'absent_user',password:'wrong'}).expect(429);
      await recoverAdmin(pool,'pilot_admin');
      await adminAgent.get('/api/auth/me').expect(401);
    });
    await developerTests(pool,t);
    await messageTests(pool,t);
    await dispatchTests(pool,t);
    await otpTests(pool,t);
    await dashboardTests(pool,t);
    await campaignTests(pool,t);
    await t.test('edited history is rejected and failed migration is fully rolled back', async () => {
      const directory = await mkdtemp(join(tmpdir(),'ethiosms-migrations-'));
      const migrations = await readMigrations();
      for (const item of migrations) await writeFile(join(directory,item.name),item.sql);
      const original = migrations[0]!.sql;
      try {
        await writeFile(join(directory,'001_initial.sql'),original+'\n-- changed');
        await assert.rejects(migrate(pool,directory),/history differs/);
        await writeFile(join(directory,'001_initial.sql'),original);
        await writeFile(join(directory,'999_failure.sql'),'CREATE TABLE ethiosms.rollback_probe(id int); SELECT * FROM ethiosms.missing_table;');
        await assert.rejects(migrate(pool,directory),{code:'42P01'});
        const probe = await pool.query("SELECT to_regclass('ethiosms.rollback_probe') AS relation");
        assert.equal(probe.rows[0].relation,null);
        assert.equal(await databaseReady(pool),true);
      } finally { await rm(directory,{recursive:true,force:true}); }
    });
  } finally { await reset(); await pool.end(); }
});
