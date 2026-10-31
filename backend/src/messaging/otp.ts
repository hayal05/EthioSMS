import express,{type Request,type Response,type NextFunction} from 'express';
import type pg from 'pg';
import { createHmac,randomInt,randomUUID,timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.js';
import { authenticateKey,enforceApiRate,type ApiIdentity } from '../developer/keys.js';
import { AccessError,normalizePhone,uuid,type Scope } from '../developer/common.js';
import { transaction } from '../db/pool.js';
import { reserveMessageInTransaction } from '../developer/quotas.js';
import { encryptPayload,payloadContext,requestDigest } from './crypto.js';
import { settleRecipient,type Dispatcher } from './dispatch.js';
import { digest } from '../auth/security.js';
const purposeValid=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,80}$/.test(value);
const codeDigest=(secret:string,id:string,purpose:string,code:string)=>createHmac('sha256',Buffer.from(secret,'hex')).update(`${id}:${purpose}:${code}`).digest('hex');
async function rate(pool:pg.Pool,key:string,max:number){
  const row=(await pool.query(`INSERT INTO ethiosms.auth_limits(key_hash,bucket,hits) VALUES ($1,to_timestamp(floor(extract(epoch FROM now())/900)*900),1)
    ON CONFLICT(key_hash,bucket) DO UPDATE SET hits=ethiosms.auth_limits.hits+1 RETURNING hits`,[digest(key)])).rows[0];
  if(row.hits>max)throw new AccessError(429,'OTP attempt limit reached');
}
export function otpRouter(pool:pg.Pool,config:Config,dispatcher?:Dispatcher){
  const router=express.Router();
  const guard=(scope:Scope)=>async(req:Request,res:Response,next:NextFunction)=>{
    const auth=req.get('Authorization')??'';const identity=await authenticateKey(pool,auth.startsWith('Bearer ')?auth.slice(7):undefined,scope);
    await enforceApiRate(pool,identity);if(!config.otpSecret||!config.payloadEncryptionKey)throw new AccessError(503,'OTP service is not configured');
    await rate(pool,`otp-ip:${req.ip}`,100);res.locals.identity=identity;next();
  };
  router.post('/request',guard('otp:request'),express.json({limit:'4kb'}),async(req,res)=>{
    const identity=res.locals.identity as ApiIdentity,to=normalizePhone(req.body?.to),purpose=req.body?.purpose,key=req.get('Idempotency-Key');
    if(!purposeValid(purpose)||!key||!/^[A-Za-z0-9._:-]{1,128}$/.test(key))throw new AccessError(400,'Purpose and valid Idempotency-Key required');
    if(config.gateway==='smsgate'&&!config.liveRecipients.includes(to))throw new AccessError(403,'Recipient is not on live allowlist');
    const fingerprint=requestDigest(config.otpSecret!,{to,purpose});
    const result=await transaction(pool,async client=>{
      // Serialize requests for this application, recipient and purpose across processes.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${identity.application_id}:${to}:${purpose}`]);
      const replay=(await client.query('SELECT id,expires_at,request_hash FROM ethiosms.otp_challenges WHERE tenant_id=$1 AND application_id=$2 AND request_key=$3',[identity.tenant_id,identity.application_id,key])).rows[0];
      if(replay){if(replay.request_hash!==fingerprint)throw new AccessError(409,'Conflicting OTP request');return {id:replay.id,expiresAt:replay.expires_at};}
      const previous=(await client.query('SELECT * FROM ethiosms.otp_challenges WHERE tenant_id=$1 AND application_id=$2 AND phone_number=$3 AND purpose=$4 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',[identity.tenant_id,identity.application_id,to,purpose])).rows[0];
      if(previous&&Date.now()-new Date(previous.created_at).getTime()<config.otpCooldown*1000)throw new AccessError(429,'Wait before requesting another code');
      const recent=(await client.query("SELECT count(*) FROM ethiosms.otp_challenges WHERE tenant_id=$1 AND application_id=$2 AND phone_number=$3 AND created_at>now()-interval '15 minutes'",[identity.tenant_id,identity.application_id,to])).rows[0];
      if(Number(recent.count)>=5)throw new AccessError(429,'Recipient OTP request limit reached');
      const old=(await client.query('UPDATE ethiosms.otp_challenges SET superseded_at=now() WHERE tenant_id=$1 AND application_id=$2 AND phone_number=$3 AND purpose=$4 AND consumed_at IS NULL AND superseded_at IS NULL RETURNING job_id',[identity.tenant_id,identity.application_id,to,purpose])).rows;
      for(const item of old){const cancelled=(await client.query("UPDATE ethiosms.message_recipients SET status='cancelled',updated_at=now() WHERE job_id=$1 AND status='queued' RETURNING id",[item.job_id])).rows;for(const recipient of cancelled)await settleRecipient(client,recipient.id,false);}
      const id=randomUUID(),code=randomInt(0,1000000).toString().padStart(6,'0'),expiresAt=new Date(Date.now()+config.otpTtl*1000),requestKey=`otp:${digest(key)}`;
      const jobId=await reserveMessageInTransaction(client,{tenantId:identity.tenant_id,applicationId:identity.application_id,idempotencyKey:requestKey,requestHash:fingerprint,kind:'otp',encoding:'GSM-7',mode:config.gateway==='smsgate'?'live':'mock',expiresAt,payloadCiphertext:encryptPayload(config.payloadEncryptionKey!,payloadContext(identity.tenant_id,identity.application_id,requestKey),{message:`Your verification code is ${code}. Do not share this code.`,mockScenario:'success'}),recipients:[{phoneNumber:to,segments:1}]});
      await client.query(`INSERT INTO ethiosms.otp_challenges(id,tenant_id,application_id,job_id,phone_number,purpose,code_digest,max_attempts,expires_at,request_key,request_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,identity.tenant_id,identity.application_id,jobId,to,purpose,codeDigest(config.otpSecret!,id,purpose,code),config.otpAttempts,expiresAt,key,fingerprint]);
      return {id,expiresAt};
    });res.status(202).json({challengeId:result.id,expiresAt:result.expiresAt,mode:config.gateway==='smsgate'?'live':'mock'});dispatcher?.kick();
  });
  router.post('/verify',guard('otp:verify'),express.json({limit:'4kb'}),async(req,res)=>{
    const identity=res.locals.identity as ApiIdentity,id=req.body?.challengeId,purpose=req.body?.purpose,code=req.body?.code;
    if(!uuid(id)||!purposeValid(purpose)||typeof code!=='string'||!/^\d{6}$/.test(code))throw new AccessError(400,'Valid challenge, purpose and six-digit code required');
    const verified=await transaction(pool,async client=>{
      const row=(await client.query('SELECT * FROM ethiosms.otp_challenges WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND purpose=$4 FOR UPDATE',[identity.tenant_id,identity.application_id,id,purpose])).rows[0];
      if(!row||row.consumed_at||row.superseded_at||new Date(row.expires_at).getTime()<=Date.now()||row.attempts>=row.max_attempts)return false;
      const correct=timingSafeEqual(Buffer.from(row.code_digest,'hex'),Buffer.from(codeDigest(config.otpSecret!,id,purpose,code),'hex'));
      await client.query('UPDATE ethiosms.otp_challenges SET attempts=attempts+1,consumed_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1',[id,correct]);if(correct||row.attempts+1>=row.max_attempts){
        const cancelled=(await client.query("UPDATE ethiosms.message_recipients SET status='cancelled' WHERE job_id=$1 AND status='queued' RETURNING id",[row.job_id])).rows;
        for(const recipient of cancelled)await settleRecipient(client,recipient.id,false);
      }return correct;
    });res.json({verified});
  });
  router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{if(error instanceof AccessError){res.status(error.status).json({error:error.message});return;}if((error as Error)?.message==='Idempotency conflict'){res.status(409).json({error:'Conflicting OTP request'});return;}const status=(error as {status?:number})?.status;res.status(status===400||status===413?status:503).json({error:status===400?'Invalid JSON':status===413?'Request too large':'OTP service unavailable'});});
  return router;
}
