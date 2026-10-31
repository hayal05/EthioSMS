import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PoolClient } from 'pg';
import { transaction } from './pool.js';

export interface StoredMessageInput {
  tenantId: string; applicationId: string; idempotencyKey: string; requestHash: string;
  kind: 'notification' | 'otp' | 'bulk'; payloadCiphertext: string; expiresAt: Date;
  recipients: {phoneNumber:string; segments:number}[];
}
// Internal persistence only. Authentication, validation, encryption, quotas, and dispatch
// must be layered on before exposing a send API (Tasks 3–6 and 8).
export async function storeMessage(pool: pg.Pool, input: StoredMessageInput): Promise<string> {
  return transaction(pool,async client => (await storeMessageInTransaction(client,input)).id);
}
// Low-level persistence; public submission must use reserveMessage to enforce quotas.
export async function storeMessageInTransaction(client:PoolClient,input:StoredMessageInput):Promise<{id:string;created:boolean}> {
  if (!input.recipients.length || input.recipients.length > 20) throw new Error('Recipient count outside pilot batch limit');
    const id = randomUUID();
    const inserted = await client.query<{id:string}>(`INSERT INTO ethiosms.message_jobs
      (id,tenant_id,application_id,idempotency_key,request_hash,kind,priority,payload_ciphertext,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (tenant_id,application_id,idempotency_key) DO NOTHING RETURNING id`,
      [id,input.tenantId,input.applicationId,input.idempotencyKey,input.requestHash,input.kind,input.kind === 'otp' ? 100 : 0,input.payloadCiphertext,input.expiresAt]);
    if (!inserted.rowCount) {
      const existing = await client.query<{id:string;request_hash:string}>(`SELECT id,request_hash FROM ethiosms.message_jobs
        WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3`, [input.tenantId,input.applicationId,input.idempotencyKey]);
      if (!existing.rows[0] || existing.rows[0].request_hash !== input.requestHash) throw new Error('Idempotency conflict');
      return {id:existing.rows[0].id,created:false};
    }
    for (const recipient of input.recipients) {
      await client.query(`INSERT INTO ethiosms.message_recipients (id,tenant_id,job_id,phone_number,segments)
        VALUES ($1,$2,$3,$4,$5)`,[randomUUID(),input.tenantId,id,recipient.phoneNumber,recipient.segments]);
    }
    return {id,created:true};
}
export async function getMessage(pool: pg.Pool, tenantId: string, applicationId: string, id: string) {
  const result = await pool.query(`SELECT j.id,j.kind,j.created_at,j.expires_at,
    r.id AS recipient_id,r.phone_number,r.segments,r.status
    FROM ethiosms.message_jobs j JOIN ethiosms.message_recipients r ON r.tenant_id=j.tenant_id AND r.job_id=j.id
    WHERE j.tenant_id=$1 AND j.application_id=$2 AND j.id=$3 ORDER BY r.id`,[tenantId,applicationId,id]);
  return result.rows;
}
