import express,{type RequestHandler,type Request,type Response,type NextFunction} from 'express';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import { AccessError,uuid,normalizePhone,checkDestination } from '../developer/common.js';
import { estimateSegments } from './segments.js';
import { enforceApiRate } from '../developer/keys.js';
import { decryptPayload,encryptPayload,payloadContext,requestDigest } from './crypto.js';
import { digest } from '../auth/security.js';
import { transaction } from '../db/pool.js';
import { reserveMessageInTransaction } from '../developer/quotas.js';
import { settleRecipient,type Dispatcher } from './dispatch.js';
export function parseContacts(value:unknown){
 if(typeof value!=='string'||value.length>8192)throw new AccessError(400,'Paste a single phone-number column, at most 8 KB');
 const raw=value.split(/[\r\n,;]+/).map(v=>v.trim().replace(/^"|"$/g,'')).filter(v=>v&&!/^(phone|mobile|phone_number)$/i.test(v));
 if(!raw.length||raw.length>100)throw new AccessError(400,'Provide 1–100 input rows');
 const unique=new Set<string>();let duplicates=0;const invalid:number[]=[];
 raw.forEach((phone,index)=>{try{const normalized=normalizePhone(phone);if(unique.has(normalized))duplicates++;unique.add(normalized);}catch{invalid.push(index+1);}});
 if(invalid.length)throw new AccessError(400,`Invalid phone entries at positions ${invalid.join(', ')}`);
 return {phones:[...unique],duplicates};
}
export function campaignRouter(pool:pg.Pool,config:Config,authenticate:RequestHandler,admin:RequestHandler,dispatcher?:Dispatcher){
 const router=express.Router();
 const own=async(req:Request,res:Response,next:NextFunction)=>{if(!uuid(req.params.id))throw new AccessError(400,'Invalid application');const result=await pool.query('SELECT id FROM ethiosms.applications WHERE tenant_id=$1 AND id=$2',[res.locals.user.tenant_id,req.params.id]);if(!result.rowCount)throw new AccessError(404,'Application not found');await enforceApiRate(pool,{tenant_id:res.locals.user.tenant_id,application_id:String(req.params.id),key_id:res.locals.user.id,scopes:[]});next();};
 async function preview(client:Pick<pg.Pool,'query'>|pg.PoolClient,tenant:string,body:any){
   const parsed=parseContacts(body?.contacts),estimate=estimateSegments(typeof body?.message==='string'?body.message+(typeof body?.optOutInstructions==='string'?'\n'+body.optOutInstructions.trim():''):body?.message);
   const prefixes=(await client.query('SELECT allowed_destination_prefixes FROM ethiosms.settings')).rows[0].allowed_destination_prefixes;
   const suppressed=new Set((await client.query('SELECT phone_number FROM ethiosms.suppressions WHERE tenant_id=$1',[tenant])).rows.map((r:any)=>r.phone_number));
   const eligible=parsed.phones.filter(phone=>!suppressed.has(phone));
   for(const phone of eligible){checkDestination(phone,prefixes);if(config.gateway==='smsgate'&&!config.liveRecipients.includes(phone))throw new AccessError(403,'A recipient is outside the live pilot allowlist');}
   if(eligible.length>20)throw new AccessError(400,'Pilot campaigns allow at most 20 eligible recipients');
   return {...parsed,eligible,suppressed:parsed.phones.length-eligible.length,segmentsPerRecipient:estimate.segments,totalSegments:estimate.segments*eligible.length,encoding:estimate.encoding};
 }
 router.post('/applications/:id/campaigns/preview',authenticate,own,async(req,res)=>{
   const result=await preview(pool,res.locals.user.tenant_id,req.body);res.json({eligible:result.eligible.map(number=>'+'+'*'.repeat(number.length-5)+number.slice(-4)),duplicates:result.duplicates,suppressed:result.suppressed,segmentsPerRecipient:result.segmentsPerRecipient,totalSegments:result.totalSegments});
 });
 router.post('/applications/:id/campaigns',authenticate,own,async(req,res)=>{
   if(!config.payloadEncryptionKey)throw new AccessError(503,'Message encryption not configured');
   const consent=req.body?.consentNote,optout=req.body?.optOutInstructions,key=req.get('Idempotency-Key');
   if(req.body?.consentConfirmed!==true||typeof consent!=='string'||consent.trim().length<5||consent.length>500||typeof optout!=='string'||optout.trim().length<5||optout.length>300||!key||!/^[A-Za-z0-9._:-]{1,100}$/.test(key))throw new AccessError(400,'Consent confirmation, consent note, opt-out instructions and Idempotency-Key required');
   const actor=res.locals.user,applicationId=String(req.params.id),requestKey=`bulk:${digest(key)}`;
   const result=await transaction(pool,async client=>{
     const checked=await preview(client,actor.tenant_id,req.body);if(!checked.eligible.length)throw new AccessError(400,'No eligible recipients remain');
     const text=req.body.message+'\n'+optout.trim(),estimate=estimateSegments(text);
     const id=await reserveMessageInTransaction(client,{tenantId:actor.tenant_id,applicationId,idempotencyKey:requestKey,requestHash:requestDigest(config.payloadEncryptionKey!,{phones:checked.eligible.slice().sort(),message:text,consent}),kind:'bulk',encoding:estimate.encoding,mode:config.gateway==='smsgate'?'live':'mock',expiresAt:new Date(Date.now()+86400000),payloadCiphertext:encryptPayload(config.payloadEncryptionKey!,payloadContext(actor.tenant_id,applicationId,requestKey),{message:text,mockScenario:'success'}),recipients:checked.eligible.map(phone=>({phoneNumber:phone,segments:estimate.segments}))});
     await client.query('UPDATE ethiosms.message_jobs SET approval_required=true WHERE id=$1',[id]);
     await client.query('INSERT INTO ethiosms.campaigns(job_id,tenant_id,application_id,consent_note,opt_out_instructions,submitted_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[id,actor.tenant_id,applicationId,consent.trim(),optout.trim(),actor.id]);
     return {id,status:'pending_approval',recipientCount:checked.eligible.length,totalSegments:estimate.segments*checked.eligible.length};
   });res.status(202).json(result);
 });
 router.get('/applications/:id/campaigns',authenticate,own,async(req,res)=>res.json({campaigns:(await pool.query('SELECT c.job_id AS id,c.created_at,j.approved_at,j.expires_at,(SELECT count(*)::int FROM ethiosms.message_recipients r WHERE r.job_id=j.id) AS recipients FROM ethiosms.campaigns c JOIN ethiosms.message_jobs j ON j.id=c.job_id WHERE c.tenant_id=$1 AND c.application_id=$2 ORDER BY c.created_at DESC LIMIT 50',[res.locals.user.tenant_id,req.params.id])).rows}));
 router.post('/applications/:id/campaigns/:campaignId/cancel',authenticate,own,async(req,res)=>{
   if(!uuid(req.params.campaignId))throw new AccessError(400,'Invalid campaign');
   const cancelled=await transaction(pool,async client=>{
     const job=await client.query('SELECT job_id FROM ethiosms.campaigns WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3 FOR UPDATE',[res.locals.user.tenant_id,req.params.id,req.params.campaignId]);if(!job.rowCount)throw new AccessError(404,'Campaign not found');
     const rows=(await client.query("UPDATE ethiosms.message_recipients SET status='cancelled',updated_at=now() WHERE job_id=$1 AND status='queued' RETURNING id",[req.params.campaignId])).rows;
     for(const row of rows)await settleRecipient(client,row.id,false);return rows.length;
   });res.json({cancelled});
 });
 router.post('/applications/:id/suppressions',authenticate,own,async(req,res)=>{
   const phone=normalizePhone(req.body?.to);await pool.query('INSERT INTO ethiosms.suppressions(tenant_id,phone_number) VALUES ($1,$2) ON CONFLICT DO NOTHING',[res.locals.user.tenant_id,phone]);res.status(201).json({status:'suppressed'});
 });
 router.get('/admin/campaigns',authenticate,admin,async(_req,res)=>res.json({campaigns:(await pool.query(`SELECT c.job_id AS id,c.consent_note,c.opt_out_instructions,c.created_at,a.name AS application,j.approved_at,j.expires_at,
   (SELECT count(*)::int FROM ethiosms.message_recipients r WHERE r.job_id=j.id AND r.status='queued') AS pending
   FROM ethiosms.campaigns c JOIN ethiosms.message_jobs j ON j.id=c.job_id JOIN ethiosms.applications a ON a.id=c.application_id ORDER BY c.created_at DESC LIMIT 100`)).rows}));
 router.get('/admin/campaigns/:id',authenticate,admin,async(req,res)=>{
   if(!uuid(req.params.id))throw new AccessError(400,'Invalid campaign');
   const row=(await pool.query("SELECT j.* FROM ethiosms.campaigns c JOIN ethiosms.message_jobs j ON j.id=c.job_id WHERE j.id=$1 AND j.kind='bulk'",[req.params.id])).rows[0];
   if(!row||!config.payloadEncryptionKey)throw new AccessError(404,'Campaign not found');
   const payload=decryptPayload(config.payloadEncryptionKey,payloadContext(row.tenant_id,row.application_id,row.idempotency_key),row.payload_ciphertext) as {message:string};
   const recipients=(await pool.query('SELECT phone_number,status FROM ethiosms.message_recipients WHERE job_id=$1',[row.id])).rows;
   res.json({id:row.id,message:payload.message,recipients:recipients.map(item=>({to:'+'+'*'.repeat(item.phone_number.length-5)+item.phone_number.slice(-4),status:item.status}))});
 });
 router.post('/admin/campaigns/:id/reject',authenticate,admin,async(req,res)=>{
   if(!uuid(req.params.id))throw new AccessError(400,'Invalid campaign');
   await transaction(pool,async client=>{
     const campaign=await client.query('SELECT job_id FROM ethiosms.campaigns WHERE job_id=$1 FOR UPDATE',[req.params.id]);if(!campaign.rowCount)throw new AccessError(404,'Campaign not found');
     const rows=(await client.query("UPDATE ethiosms.message_recipients SET status='cancelled',updated_at=now() WHERE job_id=$1 AND status='queued' RETURNING id",[req.params.id])).rows;
     for(const row of rows)await settleRecipient(client,row.id,false);
     await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,'campaign.rejected',$4)",[randomUUID(),res.locals.user.tenant_id,res.locals.user.id,req.params.id]);
   });res.json({status:'rejected'});
 });
 router.post('/admin/campaigns/:id/approve',authenticate,admin,async(req,res)=>{
   if(!uuid(req.params.id)||req.body?.reviewConfirmed!==true)throw new AccessError(400,'Confirm campaign review');
   await transaction(pool,async client=>{
     const job=await client.query('UPDATE ethiosms.message_jobs j SET approved_at=COALESCE(approved_at,now()) WHERE id=$1 AND approval_required AND expires_at>now() AND EXISTS(SELECT 1 FROM ethiosms.message_recipients WHERE job_id=j.id AND status=\'queued\') RETURNING id',[req.params.id]);if(!job.rowCount)throw new AccessError(404,'Pending campaign not found');
     await client.query('UPDATE ethiosms.campaigns SET approved_by=$2 WHERE job_id=$1',[req.params.id,res.locals.user.id]);
     await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,'campaign.approved',$4)",[randomUUID(),res.locals.user.tenant_id,res.locals.user.id,req.params.id]);
   });res.json({status:'approved'});dispatcher?.kick();
 });
 router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{if(error instanceof AccessError){res.status(error.status).json({error:error.message});return;}res.status((error as Error)?.message==='Idempotency conflict'?409:503).json({error:'Campaign request could not be completed'});});
 return router;
}
