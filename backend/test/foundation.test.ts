import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const token = 'a'.repeat(64);
test('configuration defaults safe and rejects live or malformed settings', () => {
  assert.equal(loadConfig({}).smsEnabled, false);
  for (const env of [{SMS_ENABLED:'true'}, {SMS_ENABLED:'0'}, {SMS_GATEWAY:'smsgate'}, {PORT:'3000x'}, {PORT:'0'}, {NODE_ENV:'production'}, {READINESS_TOKEN:'short'}]) {
    assert.throws(() => loadConfig(env));
  }
  assert.equal(loadConfig({ NODE_ENV:'production', READINESS_TOKEN:token }).gateway, 'mock');
});
test('liveness works without dependencies; readiness requires exact secret', async () => {
  const app = createApp(loadConfig({ READINESS_TOKEN:token }), '/nonexistent');
  const live = await request(app).get('/health').expect(200);
  assert.deepEqual(live.body, {status:'ok', service:'EthioSMS'});
  for (const auth of ['', 'Bearer wrong', `Bearer ${token}extra`]) {
    await request(app).get('/api/ready').set('Authorization', auth).expect(401);
  }
  const ready = await request(app).get('/api/ready').set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(ready.body.smsEnabled, false);
  assert.equal(ready.headers['cache-control'], 'no-store');
  assert.ok(!JSON.stringify(ready.body).includes(token));
  await request(createApp(loadConfig({}), '/nonexistent')).get('/api/ready').expect(401);
});
test('API cannot send SMS and missing routes do not return dashboard HTML', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ethiosms-'));
  try {
    writeFileSync(join(root,'index.html'), '<!doctype html><title>EthioSMS</title>');
    const app = createApp(loadConfig({}), root);
    await request(app).get('/').expect(200).expect('Content-Type', /html/);
    await request(app).get('/dashboard').expect(200);
    await request(app).post('/api/v1/messages').send({to:'+251900000000', message:'test'}).expect(404);
    await request(app).get('/api/missing').expect(404).expect('Content-Type', /json/);
    await request(app).get('/missing.js').expect(404);
    await request(app).get('/.env').expect(404);
  } finally { rmSync(root, { recursive:true, force:true }); }
});
