import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
test('ERP example is server-side, stable on retries and import has no sending side effect',async()=>{
 const {EthioSMS}=await import(pathToFileURL(resolve('../examples/client.mjs')).href);
 const {notifyLeaveDecision}=await import(pathToFileURL(resolve('../examples/erp-leave-notification.mjs')).href);
 const calls:any[]=[];
 const client=new EthioSMS({baseUrl:'https://example.invalid',apiKey:'esms_'+'a'.repeat(64),http:async(_url:any,options:any)=>{calls.push(options);return new Response(JSON.stringify({id:'fixture',status:'queued',mode:'mock'}),{status:202});}});
 await notifyLeaveDecision({eventId:'leave-change-123',employeePhone:'+251912345678',decision:'approved',client});
 await notifyLeaveDecision({eventId:'leave-change-123',employeePhone:'+251912345678',decision:'approved',client});
 assert.equal(calls.length,2);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(calls[0].body,calls[1].body);
 await assert.rejects(notifyLeaveDecision({eventId:'bad',employeePhone:'+251912345678',decision:'invalid',client}));assert.equal(calls.length,2);
});
