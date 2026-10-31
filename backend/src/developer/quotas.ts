import type pg from 'pg';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { transaction } from '../db/pool.js';
import { storeMessageInTransaction, type StoredMessageInput } from '../db/messages.js';
import { AccessError,globalScopeId,normalizePhone,checkDestination } from './common.js';

// This internal entry point is for the forthcoming message API. No public reserve/send endpoint exists yet.
export async function reserveMessage(pool:pg.Pool,input:StoredMessageInput) {
  return transaction(pool,client=>reserveMessageInTransaction(client,input));
}
export async function reserveMessageInTransaction(client:PoolClient,input:StoredMessageInput){
    const settings=(await client.query('SELECT * FROM ethiosms.settings WHERE singleton FOR SHARE')).rows[0];
    const active=await client.query(`SELECT a.id FROM ethiosms.applications a JOIN ethiosms.tenants t ON t.id=a.tenant_id
      JOIN ethiosms.users u ON u.tenant_id=t.id WHERE a.tenant_id=$1 AND a.id=$2 AND a.enabled AND t.enabled AND u.enabled FOR SHARE OF a,t,u`,[input.tenantId,input.applicationId]);
    if(!active.rowCount)throw new AccessError(403,'Application unavailable');
    const recipients=input.recipients.map(recipient=>{
      const phoneNumber=normalizePhone(recipient.phoneNumber);checkDestination(phoneNumber,settings.allowed_destination_prefixes);
      if(!Number.isInteger(recipient.segments)||recipient.segments<1||recipient.segments>100)throw new AccessError(400,'Invalid segment count');
      return {...recipient,phoneNumber};
    });
    // Duplicate requests are checked before charging; failed reservations roll back the job and recipients too.
    const message=await storeMessageInTransaction(client,{...input,recipients});
    if(!message.created){
      const reservation=await client.query('SELECT id FROM ethiosms.usage_reservations WHERE tenant_id=$1 AND job_id=$2',[input.tenantId,message.id]);
      if(!reservation.rowCount)throw new AccessError(409,'Existing message has no quota reservation');
      return message.id;
    }
    const segments=recipients.reduce((sum,item)=>sum+item.segments,0);
    const day=(await client.query<{day:string}>("SELECT to_char(now() AT TIME ZONE 'Africa/Addis_Ababa','YYYY-MM-DD') AS day")).rows[0]!.day;
    const scopes=[['global',globalScopeId,settings.global_daily_segments],['tenant',input.tenantId,settings.tenant_daily_segments],['application',input.applicationId,settings.application_daily_segments]] as const;
    for(const [scope,id,limit] of scopes){
      await client.query('INSERT INTO ethiosms.usage_counters(scope,scope_id,usage_date) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[scope,id,day]);
      const updated=await client.query(`UPDATE ethiosms.usage_counters SET reserved_segments=reserved_segments+$4
        WHERE scope=$1 AND scope_id=$2 AND usage_date=$3 AND reserved_segments+used_segments+$4<=$5 RETURNING scope`,[scope,id,day,segments,limit]);
      if(!updated.rowCount)throw new AccessError(429,'Daily SMS segment quota reached');
    }
    await client.query('INSERT INTO ethiosms.usage_reservations(id,tenant_id,job_id,usage_date,segments) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),input.tenantId,message.id,day,segments]);
    return message.id;
}
export async function usage(pool:pg.Pool,tenantId:string,applicationId:string) {
  const result=await pool.query(`WITH today AS (SELECT (now() AT TIME ZONE 'Africa/Addis_Ababa')::date AS day)
    SELECT to_char(today.day,'YYYY-MM-DD') AS date,'Africa/Addis_Ababa' AS timezone,
    s.application_daily_segments AS application_limit,s.tenant_daily_segments AS tenant_limit,
    COALESCE(a.reserved_segments,0)::int AS application_reserved,COALESCE(a.used_segments,0)::int AS application_used,
    COALESCE(t.reserved_segments,0)::int AS tenant_reserved,COALESCE(t.used_segments,0)::int AS tenant_used
    FROM ethiosms.settings s CROSS JOIN today
    LEFT JOIN ethiosms.usage_counters a ON a.scope='application' AND a.scope_id=$2 AND a.usage_date=today.day
    LEFT JOIN ethiosms.usage_counters t ON t.scope='tenant' AND t.scope_id=$1 AND t.usage_date=today.day WHERE s.singleton`,[tenantId,applicationId]);
  const row=result.rows[0];
  return {...row,application_remaining:Math.max(0,row.application_limit-row.application_reserved-row.application_used),tenant_remaining:Math.max(0,row.tenant_limit-row.tenant_reserved-row.tenant_used)};
}
