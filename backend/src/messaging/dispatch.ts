import type pg from 'pg';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { transaction } from '../db/pool.js';
import { globalScopeId } from '../developer/common.js';
import { decryptPayload,payloadContext } from './crypto.js';
import { MockGateway,type MockScenario,type MockResult } from './mock.js';

export interface Gateway {
 submit(request:{requestId:string;scenario:MockScenario;to:string;message:string;expiresAt?:Date;priority?:number}):Promise<MockResult>;
 status(request:{scenario:MockScenario;submittedAt:number;providerId:string}):Promise<'accepted'|'sent'|'delivered'|'unknown'|'failed'>;
}
export async function settleRecipient(client:PoolClient,id:string,consume:boolean){
  const result=await client.query(`SELECT r.*,j.application_id,v.usage_date FROM ethiosms.message_recipients r
    JOIN ethiosms.message_jobs j ON j.id=r.job_id AND j.tenant_id=r.tenant_id
    JOIN ethiosms.usage_reservations v ON v.job_id=j.id AND v.tenant_id=j.tenant_id
    WHERE r.id=$1 FOR UPDATE OF r`,[id]);
  const row=result.rows[0];if(!row||row.usage_settled)return;
  for(const [scope,scopeId] of [['global',globalScopeId],['tenant',row.tenant_id],['application',row.application_id]]){
    const changed=await client.query(`UPDATE ethiosms.usage_counters SET reserved_segments=reserved_segments-$4,used_segments=used_segments+$5
      WHERE scope=$1 AND scope_id=$2 AND usage_date=$3 AND reserved_segments>=$4 RETURNING scope`,[scope,scopeId,row.usage_date,row.segments,consume?row.segments:0]);
    if(!changed.rowCount)throw new Error('Usage invariant failed');
  }
  await client.query('UPDATE ethiosms.message_recipients SET usage_settled=true WHERE id=$1',[id]);
  await client.query(`UPDATE ethiosms.usage_reservations SET state=CASE WHEN EXISTS(SELECT 1 FROM ethiosms.message_recipients WHERE job_id=$1 AND status IN ('accepted','sent','delivered','unknown')) THEN 'consumed' ELSE 'released' END
    WHERE job_id=$1 AND NOT EXISTS(SELECT 1 FROM ethiosms.message_recipients WHERE job_id=$1 AND NOT usage_settled)`,[row.job_id]);
}
export class Dispatcher {
  private running?:Promise<{processed:number;nextDelay:number|null}>;
  private timer?:ReturnType<typeof setTimeout>;
  private stopped=false;
  constructor(private pool:pg.Pool,private key:string,private gateway:Gateway=new MockGateway(),private mode:'mock'|'live'='mock'){}
  stop(){this.stopped=true;clearTimeout(this.timer);}
  kick(){if(this.stopped)return;clearTimeout(this.timer);void this.drain().then(result=>{
    if(!this.stopped&&result.nextDelay!==null)this.timer=setTimeout(()=>this.kick(),Math.max(1000,result.nextDelay));
  }).catch(()=>console.error('Dispatcher unavailable; pending jobs remain stored'));}
  drain(){if(!this.running)this.running=this.once().finally(()=>{this.running=undefined;});return this.running;}
  private async once(){
    let processed=0;
    for(let i=0;i<10;i++){
      const item=await transaction(this.pool,async client=>{
        const settings=(await client.query('SELECT sending_paused FROM ethiosms.settings WHERE singleton FOR SHARE')).rows[0];
        if(settings.sending_paused)return undefined;
        const result=await client.query(`SELECT r.*,j.application_id,j.idempotency_key,j.payload_ciphertext,j.expires_at,j.gateway_mode,j.priority,
          EXISTS(SELECT 1 FROM ethiosms.applications a JOIN ethiosms.tenants t ON t.id=a.tenant_id JOIN ethiosms.users u ON u.tenant_id=t.id WHERE a.id=j.application_id AND a.enabled AND t.enabled AND u.enabled) AS active
          FROM ethiosms.message_recipients r JOIN ethiosms.message_jobs j ON j.id=r.job_id AND j.tenant_id=r.tenant_id
          WHERE j.gateway_mode=$1 AND ((r.status='queued' AND (r.available_at<=now() OR j.expires_at<=now())) OR (r.status='claimed' AND r.lease_expires_at<=now()) OR (r.status IN ('accepted','sent') AND r.reconcile_at<=now()))
          ORDER BY j.priority DESC,r.available_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`,[this.mode]);
        const row=result.rows[0];if(!row)return undefined;
        if(row.status==='claimed'){
          await client.query("UPDATE ethiosms.message_recipients SET status='unknown',lease_token=NULL,lease_expires_at=NULL,last_error_code='LEASE_LOST',updated_at=now() WHERE id=$1",[row.id]);
          await client.query("UPDATE ethiosms.message_attempts SET outcome='unknown',error_code='LEASE_LOST' WHERE recipient_id=$1 AND outcome='started'",[row.id]);
          await settleRecipient(client,row.id,true);return {done:true};
        }
        if(row.status==='queued'&&(!row.active||new Date(row.expires_at).getTime()<=Date.now())){
          await client.query('UPDATE ethiosms.message_recipients SET status=$2,updated_at=now() WHERE id=$1',[row.id,row.active?'expired':'cancelled']);await settleRecipient(client,row.id,false);return {done:true};
        }
        const lease=randomUUID();
        if(row.status==='queued'){
          await client.query("UPDATE ethiosms.message_recipients SET status='claimed',lease_token=$2,lease_expires_at=now()+interval '60 seconds',attempt_count=attempt_count+1,updated_at=now() WHERE id=$1",[row.id,lease]);
          await client.query("INSERT INTO ethiosms.message_attempts(id,tenant_id,recipient_id,attempt_number,outcome) VALUES ($1,$2,$3,$4,'started')",[randomUUID(),row.tenant_id,row.id,row.attempt_count+1]);
        }else await client.query("UPDATE ethiosms.message_recipients SET reconcile_at=now()+interval '60 seconds' WHERE id=$1",[row.id]);
        return {...row,lease};
      });
      if(!item)break;processed++;
      if('done' in item)continue;
      const row=item as Record<string,any>;
      let payload:{message:string;mockScenario:MockScenario};
      try{payload=decryptPayload(this.key,payloadContext(row.tenant_id,row.application_id,row.idempotency_key),row.payload_ciphertext) as typeof payload;if(typeof payload.message!=='string')throw Error();}
      catch{if(row.status==='queued')await this.finish(row,{outcome:'rejected',code:'PAYLOAD_UNAVAILABLE'});else await this.pool.query("UPDATE ethiosms.message_recipients SET status='unknown',reconcile_at=NULL,last_error_code='PAYLOAD_UNAVAILABLE' WHERE id=$1 AND status IN ('accepted','sent')",[row.id]);continue;}
      if(row.status==='queued'){
        let result:MockResult;
        try{result=await this.gateway.submit({requestId:row.id,scenario:payload.mockScenario,to:row.phone_number,message:payload.message,expiresAt:new Date(row.expires_at),priority:row.priority});}
        catch{result={outcome:'unknown',code:'GATEWAY_TIMEOUT'};}
        await this.finish(row,result);
      }else{
        let status:'accepted'|'sent'|'delivered'|'unknown'|'failed'='unknown';
        try{status=await this.gateway.status({scenario:payload.mockScenario,submittedAt:new Date(row.submitted_at).getTime(),providerId:row.provider_message_id});}catch{}
        await this.pool.query(`UPDATE ethiosms.message_recipients SET status=CASE WHEN status='sent' AND $2='accepted' THEN 'sent' ELSE $2 END,reconcile_at=CASE WHEN $2 IN ('accepted','sent') AND submitted_at>now()-interval '24 hours' THEN now()+interval '30 seconds' ELSE NULL END,updated_at=now() WHERE id=$1 AND status IN ('accepted','sent')`,[row.id,status]);
      }
    }
    const paused=(await this.pool.query('SELECT sending_paused FROM ethiosms.settings WHERE singleton')).rows[0].sending_paused;
    if(paused)return {processed,nextDelay:null};
    const next=await this.pool.query(`SELECT min(due) AS due FROM (
      SELECT CASE WHEN r.status='queued' THEN least(r.available_at,j.expires_at) WHEN r.status='claimed' THEN r.lease_expires_at ELSE r.reconcile_at END AS due
      FROM ethiosms.message_recipients r JOIN ethiosms.message_jobs j ON j.id=r.job_id WHERE j.gateway_mode=$1 AND r.status IN ('queued','claimed','accepted','sent')) q`,[this.mode]);
    return {processed,nextDelay:next.rows[0].due?Math.max(1000,new Date(next.rows[0].due).getTime()-Date.now()):null};
  }
  private async finish(row:Record<string,any>,result:MockResult){
    await transaction(this.pool,async client=>{
      const current=await client.query("SELECT id FROM ethiosms.message_recipients WHERE id=$1 AND status='claimed' AND lease_token=$2 FOR UPDATE",[row.id,row.lease]);if(!current.rowCount)return;
      const attempts=row.attempt_count+1;
      const status=result.outcome==='accepted'?'accepted':result.outcome==='unknown'?'unknown':result.outcome==='retryable'&&attempts<5?'queued':'failed';
      await client.query(`UPDATE ethiosms.message_recipients SET status=$2,provider_message_id=$3,last_error_code=$4,lease_token=NULL,lease_expires_at=NULL,
        submitted_at=CASE WHEN $2='accepted' THEN now() ELSE submitted_at END,reconcile_at=CASE WHEN $2='accepted' THEN now() ELSE NULL END,
        available_at=now()+($5::int*interval '1 second'),updated_at=now() WHERE id=$1`,[row.id,status,result.outcome==='accepted'?result.providerId:null,'code' in result?result.code:null,Math.min(300,5*2**attempts)]);
      await client.query('UPDATE ethiosms.message_attempts SET outcome=$3,error_code=$4,provider_message_id=$5 WHERE recipient_id=$1 AND attempt_number=$2',[row.id,attempts,result.outcome==='accepted'?'accepted':result.outcome==='unknown'?'unknown':'rejected','code' in result?result.code:null,result.outcome==='accepted'?result.providerId:null]);
      if(status!=='queued')await settleRecipient(client,row.id,status==='accepted'||status==='unknown');
    });
  }
}
