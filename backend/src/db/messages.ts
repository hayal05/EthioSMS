import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PoolClient } from 'pg';
import { transaction } from './pool.js';
import { AccessError } from '../developer/common.js';

export interface StoredMessageInput {
  tenantId:string;applicationId:string;idempotencyKey:string;requestHash:string;
  kind:'notification'|'otp'|'bulk';encoding?:'GSM-7'|'UTF-16';mode?:'mock'|'live';payloadCiphertext:string;expiresAt:Date;
  recipients:{phoneNumber:string;segments:number}[];
}
// Internal low-level persistence. Public submission uses reserveMessage and server-calculated segments.
export async function storeMessage(pool:pg.Pool,input:StoredMessageInput):Promise<string>{
  return transaction(pool,async client=>(await storeMessageInTransaction(client,input)).id);
}
export async function storeMessageInTransaction(client:PoolClient,input:StoredMessageInput):Promise<{id:string;created:boolean}>{
  if(!input.recipients.length||input.recipients.length>20)throw new Error('Recipient count outside pilot batch limit');
  const id=randomUUID();
  const identity=await client.query(`INSERT INTO ethiosms.request_history(tenant_id,application_id,idempotency_key,request_hash,message_id)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,application_id,idempotency_key) DO NOTHING RETURNING message_id`,[input.tenantId,input.applicationId,input.idempotencyKey,input.requestHash,id]);
  if(!identity.rowCount){
    const previous=(await client.query<{message_id:string;request_hash:string}>('SELECT message_id,request_hash FROM ethiosms.request_history WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3',[input.tenantId,input.applicationId,input.idempotencyKey])).rows[0];
    if(!previous||previous.request_hash!==input.requestHash)throw new Error('Idempotency conflict');
    const existing=await client.query('SELECT id FROM ethiosms.message_jobs WHERE id=$1 AND tenant_id=$2 AND application_id=$3',[previous.message_id,input.tenantId,input.applicationId]);
    if(!existing.rowCount)throw new AccessError(410,'Message history expired; this request cannot be resubmitted');
    return {id:previous.message_id,created:false};
  }
  await client.query(`INSERT INTO ethiosms.message_jobs(id,tenant_id,application_id,idempotency_key,request_hash,kind,priority,payload_ciphertext,expires_at,encoding,gateway_mode)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,input.tenantId,input.applicationId,input.idempotencyKey,input.requestHash,input.kind,input.kind==='otp'?100:0,input.payloadCiphertext,input.expiresAt,input.encoding??null,input.mode??'mock']);
  for(const recipient of input.recipients)await client.query('INSERT INTO ethiosms.message_recipients(id,tenant_id,job_id,phone_number,segments) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),input.tenantId,id,recipient.phoneNumber,recipient.segments]);
  return {id,created:true};
}
export async function getMessage(pool:pg.Pool,tenantId:string,applicationId:string,id:string){
  return (await pool.query(`SELECT j.id,j.kind,j.created_at,j.expires_at,r.id AS recipient_id,r.phone_number,r.segments,r.status
    FROM ethiosms.message_jobs j JOIN ethiosms.message_recipients r ON r.tenant_id=j.tenant_id AND r.job_id=j.id
    WHERE j.tenant_id=$1 AND j.application_id=$2 AND j.id=$3 ORDER BY r.id`,[tenantId,applicationId,id])).rows;
}
