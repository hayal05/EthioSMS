import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { transaction } from '../db/pool.js';
import { digest, token, validUsername } from './security.js';

export async function createAccount(pool:pg.Pool, username:string, actor?:{tenantId:string;id:string}, bootstrap=false) {
  if (!validUsername(username)) throw new Error('Invalid username');
  return transaction(pool, async client => {
    if (bootstrap) {
      await client.query('SELECT pg_advisory_xact_lock(174962, 2)');
      const existing = await client.query("SELECT 1 FROM ethiosms.users WHERE role='admin' LIMIT 1");
      if (existing.rowCount) throw new Error('Administrator already exists');
    } else if (!actor) throw new Error('Administrator required');
    if (actor) {
      const admin = await client.query(`SELECT 1 FROM ethiosms.users u JOIN ethiosms.tenants t ON t.id=u.tenant_id
        WHERE u.id=$1 AND u.tenant_id=$2 AND u.role='admin' AND u.enabled AND t.enabled FOR UPDATE OF u,t`,[actor.id,actor.tenantId]);
      if (!admin.rowCount) throw new Error('Administrator required');
    }
    const tenantId = randomUUID(), userId = randomUUID(), setupToken = token();
    await client.query('INSERT INTO ethiosms.tenants(id,name,enabled) VALUES ($1,$2,true)',[tenantId,username]);
    await client.query(`INSERT INTO ethiosms.users(id,tenant_id,username,role,enabled) VALUES ($1,$2,$3,$4,true)`,[userId,tenantId,username,bootstrap?'admin':'user']);
    await client.query(`INSERT INTO ethiosms.setup_tokens(token_hash,tenant_id,user_id,expires_at) VALUES ($1,$2,$3,now()+interval '24 hours')`,[digest(setupToken),tenantId,userId]);
    await client.query(`INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,'account.created',$4)`,[randomUUID(),actor?.tenantId??tenantId,actor?.id??userId,userId]);
    return {id:userId,username,setupToken,expiresInHours:24};
  });
}
// This offline recovery function is for the administrator with database-host access.
export async function recoverAdmin(pool:pg.Pool, username:string) {
  if (!validUsername(username)) throw new Error('Invalid username');
  return transaction(pool, async client => {
    const result=await client.query("SELECT id,tenant_id FROM ethiosms.users WHERE username=$1 AND role='admin' FOR UPDATE",[username]);
    const user=result.rows[0]; if (!user) throw new Error('Administrator not found');
    const setupToken=token();
    await client.query('DELETE FROM ethiosms.sessions WHERE user_id=$1',[user.id]);
    await client.query('DELETE FROM ethiosms.setup_tokens WHERE user_id=$1',[user.id]);
    await client.query('UPDATE ethiosms.users SET password_hash=NULL,enabled=true WHERE id=$1',[user.id]);
    await client.query('UPDATE ethiosms.tenants SET enabled=true WHERE id=$1',[user.tenant_id]);
    await client.query("INSERT INTO ethiosms.setup_tokens(token_hash,tenant_id,user_id,expires_at) VALUES ($1,$2,$3,now()+interval '24 hours')",[digest(setupToken),user.tenant_id,user.id]);
    await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,action,resource_id) VALUES ($1,$2,'admin.offline_recovery',$3)",[randomUUID(),user.tenant_id,user.id]);
    return {username,setupToken,expiresInHours:24};
  });
}
