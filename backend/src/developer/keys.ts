import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { digest,token } from '../auth/security.js';
import { transaction } from '../db/pool.js';
import { AccessError, validScopes, type Scope, globalScopeId } from './common.js';

export interface ApiIdentity {key_id:string;tenant_id:string;application_id:string;scopes:Scope[]}
export async function issueKey(pool:pg.Pool,tenantId:string,applicationId:string,requested:unknown,rotateId?:string) {
  if(!rotateId && !validScopes(requested))throw new AccessError(400,'Select valid, unique permissions');
  return transaction(pool,async client=>{
    const application=await client.query('SELECT id FROM ethiosms.applications WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,applicationId]);
    if(!application.rowCount)throw new AccessError(404,'Application not found');
    let permissions=requested as Scope[];
    if(rotateId){
      const previous=await client.query<{scopes:Scope[]}>(`UPDATE ethiosms.api_keys SET revoked_at=now() WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND revoked_at IS NULL RETURNING scopes`,[tenantId,applicationId,rotateId]);
      if(!previous.rows[0])throw new AccessError(404,'Active key not found');
      permissions=previous.rows[0].scopes;
    }
    const active=await client.query('SELECT count(*) FROM ethiosms.api_keys WHERE tenant_id=$1 AND application_id=$2 AND revoked_at IS NULL',[tenantId,applicationId]);
    if(Number(active.rows[0].count)>=5)throw new AccessError(409,'Maximum five active keys per application');
    const raw='esms_'+token(),id=randomUUID(),prefix=raw.slice(0,13);
    await client.query('INSERT INTO ethiosms.api_keys(id,tenant_id,application_id,key_hash,prefix,scopes) VALUES ($1,$2,$3,$4,$5,$6)',[id,tenantId,applicationId,digest(raw),prefix,permissions]);
    await client.query(`INSERT INTO ethiosms.audit_events(id,tenant_id,action,resource_id) VALUES ($1,$2,$3,$4)`,[randomUUID(),tenantId,rotateId?'api_key.rotated':'api_key.created',id]);
    return {id,prefix,scopes:permissions,apiKey:raw};
  });
}
export async function authenticateKey(pool:pg.Pool,raw:unknown,scope:Scope):Promise<ApiIdentity> {
  if(typeof raw!=='string'||!/^esms_[a-f0-9]{64}$/.test(raw))throw new AccessError(401,'Invalid API key');
  const result=await pool.query<ApiIdentity>(`SELECT k.id AS key_id,k.tenant_id,k.application_id,k.scopes FROM ethiosms.api_keys k
    JOIN ethiosms.applications a ON a.id=k.application_id AND a.tenant_id=k.tenant_id
    JOIN ethiosms.tenants t ON t.id=k.tenant_id
    WHERE k.key_hash=$1 AND k.revoked_at IS NULL AND a.enabled AND t.enabled
    AND EXISTS(SELECT 1 FROM ethiosms.users u WHERE u.tenant_id=t.id AND u.enabled)`,[digest(raw)]);
  const identity=result.rows[0];if(!identity)throw new AccessError(401,'Invalid API key');
  if(!identity.scopes.includes(scope))throw new AccessError(403,'API key lacks required permission');
  return identity;
}
export async function enforceApiRate(pool:pg.Pool,identity:ApiIdentity) {
  const allowed=await transaction(pool,async client=>{
    const result=await client.query('SELECT * FROM ethiosms.settings WHERE singleton');
    const settings=result.rows[0];
    const entries=[['global',globalScopeId,settings.global_requests_per_minute],['tenant',identity.tenant_id,settings.tenant_requests_per_minute],['application',identity.application_id,settings.application_requests_per_minute],['key',identity.key_id,settings.key_requests_per_minute]] as const;
    let allowed=true;
    // Always the same scope order. Persist denied attempts too, including higher scopes.
    for(const [scope,id,limit] of entries){
      const counter=await client.query<{hits:number}>(`INSERT INTO ethiosms.api_rate_limits(scope,scope_id,bucket,hits) VALUES ($1,$2,date_trunc('minute',now()),1)
        ON CONFLICT(scope,scope_id,bucket) DO UPDATE SET hits=ethiosms.api_rate_limits.hits+1 RETURNING hits`,[scope,id]);
      if(counter.rows[0]!.hits>limit)allowed=false;
    }
    return allowed;
  });
  if(!allowed)throw new AccessError(429,'API request limit reached; retry after the current minute');
}
