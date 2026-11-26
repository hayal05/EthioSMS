import { test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { loadConfig } from '../src/config.js';
import { SmsGate } from '../src/messaging/smsgate.js';
const config=loadConfig({SMS_GATEWAY:'smsgate',SMS_ENABLED:'true',LIVE_SMS_APPROVED:'true',LIVE_SMS_RECIPIENTS:'+251912345678',PAYLOAD_ENCRYPTION_KEY:'5'.repeat(64),SMSGATE_DEVICE_ID:'fixture-device',SMSGATE_TOKEN:'fixture-token'});
const pool={query:async()=>({rows:[]})} as unknown as pg.Pool;
test('live adapter is allowlisted, targeted and timeout-safe with simulated HTTP only',async()=>{
  let calls=0;const http:typeof fetch=async(url,options)=>{calls++;assert.equal(String(url),'https://api.sms-gate.app/3rdparty/v1/messages');const body=JSON.parse(String(options?.body));assert.equal(body.deviceId,'fixture-device');assert.equal(body.textMessage.text,'Fixture');assert.equal(body.phoneNumbers[0],'+251912345678');assert.equal(body.simNumber,1);assert.equal('id' in body,false);assert.equal('withDeliveryReport' in body,false);return new Response(JSON.stringify({id:'provider-generated-id'}),{status:202});};
  const adapter=new SmsGate(config,pool,http);
  assert.equal((await adapter.submit({requestId:'fixture-id',scenario:'success',to:'+251900000000',message:'No send'})).outcome,'rejected');assert.equal(calls,0);
  const accepted=await adapter.submit({requestId:'fixture-id',scenario:'success',to:'+251912345678',message:'Fixture'});assert.equal(accepted.outcome,'accepted');assert.equal(accepted.providerId,'provider-generated-id');
  const timeout=new SmsGate(config,pool,async()=>{throw Error('private credential detail');});
  const result=await timeout.submit({requestId:'fixture-id',scenario:'success',to:'+251912345678',message:'Fixture'});assert.equal(result.outcome,'unknown');assert.ok(!JSON.stringify(result).includes('private'));
});
test('provider status mapping uses authenticated reads and never invents a receipt',async()=>{
  for(const [state,expected] of [['Pending','accepted'],['Sent','sent'],['Delivered','delivered'],['Failed','failed'],['unexpected','unknown']]){
    const adapter=new SmsGate(config,pool,async()=>new Response(JSON.stringify({id:'fixture-id',state})));
    assert.equal(await adapter.status({providerId:'fixture-id',scenario:'success',submittedAt:Date.now()}),expected);
  }
  assert.throws(()=>loadConfig({SMS_GATEWAY:'smsgate',SMS_ENABLED:'true'}));
});
