import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { transaction } from '../db/pool.js';
import { digest, token, validUsername, validEmail, validPassword, hashPassword, verifyPassword } from './security.js';
import { maintain } from '../db/maintenance.js';
import { createAccount, createInitialAdmin } from './accounts.js';
import type { Dispatcher } from '../messaging/dispatch.js';
import { campaignRouter } from '../messaging/campaigns.js';
import { dashboardRouter } from '../developer/dashboard.js';
import type { Config } from '../config.js';
import { developerRouter } from '../developer/router.js';

interface User { id:string; tenant_id:string; username:string; email:string|null; role:'admin'|'user' }
const cookieName='ethiosms_session';
function sessionToken(req:Request) {
  const parts=(req.get('cookie')??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(`${cookieName}=`));
  if (parts.length!==1) return undefined;
  const value=parts[0]!.slice(cookieName.length+1);
  return /^[a-f0-9]{64}$/.test(value)?value:undefined;
}
export function accountRouter(pool:pg.Pool, production:boolean,dispatcher?:Dispatcher,config?:Config) {
  const router=express.Router();
  const cookieOptions={httpOnly:true,secure:production,sameSite:'strict' as const,path:'/'};
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  // Cross-origin forms cannot attach this header; no CORS is enabled.
  router.use((req,res,next)=>{
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('X-EthioSMS-Request')!=='1') { res.status(403).json({error:'Request header required'});return; }
    next();
  });
  router.use(express.json({limit:'8kb'}));
  const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
    const raw=sessionToken(req);
    if (!raw) {res.status(401).json({error:'Authentication required'});return;}
    const result=await pool.query<User>(`SELECT u.id,u.tenant_id,u.username,u.email,u.role FROM ethiosms.sessions s
      JOIN ethiosms.users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id JOIN ethiosms.tenants t ON t.id=u.tenant_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled AND t.enabled`,[digest(raw)]);
    if (!result.rows[0]) {res.status(401).json({error:'Authentication required'});return;}
    res.locals.user=result.rows[0];next();
  };
  const admin=(req:Request,res:Response,next:NextFunction)=>{if ((res.locals.user as User).role!=='admin') {res.status(403).json({error:'Administrator required'});return;}next();};
  async function allowed(key:string,limit:number) {
    const result=await pool.query<{hits:number}>(`INSERT INTO ethiosms.auth_limits(key_hash,bucket,hits)
      VALUES ($1,to_timestamp(floor(extract(epoch FROM now())/900)*900),1)
      ON CONFLICT(key_hash,bucket) DO UPDATE SET hits=ethiosms.auth_limits.hits+1 RETURNING hits`,[digest(key)]);
    return result.rows[0]!.hits<=limit;
  }
  router.get('/auth/setup/status',async(_req,res)=>{
    const result=await pool.query<{has_users:boolean}>('SELECT EXISTS(SELECT 1 FROM ethiosms.users) AS has_users');
    const available=!result.rows[0]?.has_users;
    res.json({setupRequired:available,setupAvailable:available});
  });
  router.post('/auth/setup/initial',async(req,res)=>{
    if(!await allowed(`initial-setup-ip:${req.ip}`,5)){res.status(429).json({error:'Too many attempts; try later'});return;}
    const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
    const password=req.body?.password,confirm=req.body?.confirmPassword;
    if(!validEmail(email)||!validPassword(password)){res.status(400).json({error:'Enter a valid email and password of 12–128 characters'});return;}
    if(password!==confirm){res.status(400).json({error:'Passwords do not match'});return;}
    try{
      const raw=token(),user=await createInitialAdmin(pool,email,password,digest(raw));
      res.cookie(cookieName,raw,{...cookieOptions,maxAge:8*60*60*1000});
      res.status(201).json({status:'created',user});
    }catch(error){
      if(error instanceof Error&&error.message==='Initial registration is closed'){res.status(409).json({error:'The first account has already been created. Sign in instead.'});return;}
      if((error as {code?:string}).code==='23505'){res.status(409).json({error:'Account already exists'});return;}
      throw error;
    }
  });
  router.post('/auth/login',async(req,res)=>{
    const identifier=req.body?.identifier??req.body?.email??req.body?.username;
    const username=typeof identifier==='string'?identifier.trim().toLowerCase():'';
    const password=req.body?.password;
    if (!await allowed(`login-ip:${req.ip}`,30) || !await allowed(`login-user:${username.slice(0,254)}`,10)) {res.status(429).json({error:'Too many attempts; try later'});return;}
    if ((!validUsername(username)&&!validEmail(username)) || typeof password!=='string' || password.length>128) {res.status(401).json({error:'Invalid email/username or password'});return;}
    const result=await pool.query<User & {password_hash:string;enabled:boolean;tenant_enabled:boolean}>(`SELECT u.*,t.enabled AS tenant_enabled FROM ethiosms.users u JOIN ethiosms.tenants t ON t.id=u.tenant_id WHERE username=$1 OR email=$1`,[username]);
    const user=result.rows[0];
    if (!await verifyPassword(password,user?.password_hash) || !user?.enabled || !user.tenant_enabled) {res.status(401).json({error:'Invalid email/username or password'});return;}
    const raw=token();
    // Recheck account state under lock so a concurrent disable/reset cannot create a usable session.
    const created=await transaction(pool,async client=>{
      const active=await client.query(`SELECT 1 FROM ethiosms.users u JOIN ethiosms.tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.enabled AND t.enabled AND u.password_hash=$2 FOR UPDATE OF u,t`,[user.id,user.password_hash]);
      if (!active.rowCount) return false;
      await client.query("INSERT INTO ethiosms.sessions(token_hash,tenant_id,user_id,expires_at) VALUES ($1,$2,$3,now()+interval '8 hours')",[digest(raw),user.tenant_id,user.id]);return true;
    });
    if (!created) {res.status(401).json({error:'Invalid email/username or password'});return;}
    res.cookie(cookieName,raw,{...cookieOptions,maxAge:8*60*60*1000});res.json({user:{id:user.id,username:user.username,email:user.email,role:user.role}});
  });
  router.post('/auth/setup',async(req,res)=>{
    if (!await allowed(`setup-ip:${req.ip}`,20)) {res.status(429).json({error:'Too many attempts; try later'});return;}
    const raw=req.body?.token,password=req.body?.password;
    if (typeof raw!=='string' || !/^[a-f0-9]{64}$/.test(raw) || !validPassword(password)) {res.status(400).json({error:'Valid setup token and 12–128 character password required'});return;}
    const encoded=await hashPassword(password);
    const changed=await transaction(pool,async client=>{
      // Consistent lock order: user first, then token; matches administrator recovery.
      const found=await client.query('SELECT user_id FROM ethiosms.setup_tokens WHERE token_hash=$1',[digest(raw)]);
      if (!found.rows[0]) return false;
      const active=await client.query(`SELECT u.id FROM ethiosms.users u JOIN ethiosms.tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.enabled AND t.enabled FOR UPDATE OF u,t`,[found.rows[0].user_id]);
      if (!active.rowCount) return false;
      const redeemed=await client.query(`UPDATE ethiosms.setup_tokens SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING user_id,tenant_id`,[digest(raw)]);
      const item=redeemed.rows[0];if (!item) return false;
      await client.query('UPDATE ethiosms.users SET password_hash=$1 WHERE id=$2',[encoded,item.user_id]);
      await client.query('DELETE FROM ethiosms.sessions WHERE user_id=$1',[item.user_id]);
      await client.query('DELETE FROM ethiosms.setup_tokens WHERE user_id=$1 AND token_hash<>$2',[item.user_id,digest(raw)]);
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action) VALUES ($1,$2,$3,'account.password_set')",[randomUUID(),item.tenant_id,item.user_id]);return true;
    });
    if (!changed) {res.status(400).json({error:'Invalid or expired setup token'});return;}
    res.clearCookie(cookieName,cookieOptions);res.json({status:'password_set'});
  });
  router.get('/auth/me',authenticate,(_req,res)=>{const user=res.locals.user as User;res.json({user:{id:user.id,username:user.username,email:user.email,role:user.role}});});
  router.post('/auth/logout',async(req,res)=>{
    const raw=sessionToken(req);if(raw)await pool.query('DELETE FROM ethiosms.sessions WHERE token_hash=$1',[digest(raw)]);
    res.clearCookie(cookieName,cookieOptions);res.status(204).end();
  });
  router.get('/admin/users',authenticate,admin,async(_req,res)=>{
    const result=await pool.query('SELECT id,username,email,role,enabled,created_at FROM ethiosms.users ORDER BY created_at DESC LIMIT 100');res.json({users:result.rows});
  });
  router.post('/admin/users',authenticate,admin,async(req,res)=>{
    if(!validUsername(req.body?.username)){res.status(400).json({error:'Username must be 3–80 lowercase letters, digits, dots, underscores or hyphens'});return;}
    const actor=res.locals.user as User;
    try {const result=await createAccount(pool,req.body.username,{id:actor.id,tenantId:actor.tenant_id});res.status(201).json(result);}
    catch(error){if((error as {code?:string}).code==='23505'){res.status(409).json({error:'Username unavailable'});return;}throw error;}
  });
  router.patch('/admin/users/:id',authenticate,admin,async(req,res)=>{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(req.params.id)) || typeof req.body?.enabled!=='boolean'){res.status(400).json({error:'Valid user ID and enabled flag required'});return;}
    const actor=res.locals.user as User;
    const changed=await transaction(pool,async client=>{
      const updated=await client.query("UPDATE ethiosms.users SET enabled=$1 WHERE id=$2 AND role='user' RETURNING tenant_id",[req.body.enabled,req.params.id]);
      if(!updated.rows[0])return false;
      await client.query('UPDATE ethiosms.tenants SET enabled=$1 WHERE id=$2',[req.body.enabled,updated.rows[0].tenant_id]);
      if(!req.body.enabled)await client.query('DELETE FROM ethiosms.sessions WHERE user_id=$1',[req.params.id]);
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,$4,$5)",[randomUUID(),actor.tenant_id,actor.id,req.body.enabled?'account.enabled':'account.disabled',req.params.id]);return true;
    });
    res.status(changed?200:404).json(changed?{status:'updated'}:{error:'User not found'});
  });
  router.post('/admin/users/:id/recovery',authenticate,admin,async(req,res)=>{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(req.params.id))){res.status(400).json({error:'Valid user ID required'});return;}
    const actor=res.locals.user as User;
    const setupToken=token();
    const changed=await transaction(pool,async client=>{
      const found=await client.query("SELECT tenant_id FROM ethiosms.users WHERE id=$1 AND role='user' AND enabled FOR UPDATE",[req.params.id]);
      const user=found.rows[0];if(!user)return false;
      await client.query('UPDATE ethiosms.users SET password_hash=NULL WHERE id=$1',[req.params.id]);
      await client.query('DELETE FROM ethiosms.sessions WHERE user_id=$1',[req.params.id]);
      await client.query('DELETE FROM ethiosms.setup_tokens WHERE user_id=$1',[req.params.id]);
      await client.query("INSERT INTO ethiosms.setup_tokens(token_hash,tenant_id,user_id,expires_at) VALUES ($1,$2,$3,now()+interval '24 hours')",[digest(setupToken),user.tenant_id,req.params.id]);
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,'account.recovery_issued',$4)",[randomUUID(),actor.tenant_id,actor.id,req.params.id]);return true;
    });
    res.status(changed?200:404).json(changed?{setupToken,expiresInHours:24}:{error:'User not found'});
  });
  router.patch('/admin/applications/:id',authenticate,admin,async(req,res)=>{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(req.params.id)) || typeof req.body?.enabled!=='boolean'){res.status(400).json({error:'Valid application ID and enabled flag required'});return;}
    const actor=res.locals.user as User;
    const changed=await transaction(pool,async client=>{
      const updated=await client.query('UPDATE ethiosms.applications SET enabled=$1 WHERE id=$2 RETURNING id',[req.body.enabled,req.params.id]);
      if(!updated.rowCount)return false;
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,$4,$5)",[randomUUID(),actor.tenant_id,actor.id,req.body.enabled?'application.enabled':'application.disabled',req.params.id]);return true;
    });
    res.status(changed?200:404).json(changed?{status:'updated'}:{error:'Application not found'});
  });
  router.post('/admin/maintenance',authenticate,admin,async(_req,res)=>{
    const result=await maintain(pool);
    await pool.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action) VALUES ($1,$2,$3,'maintenance.executed')",[randomUUID(),res.locals.user.tenant_id,res.locals.user.id]);
    res.json(result);
  });
  router.patch('/admin/retention',authenticate,admin,async(req,res)=>{
    const values=[req.body?.messageDays,req.body?.otpHours,req.body?.auditDays];
    if(values.some((value,i)=>!Number.isInteger(value)||value<1||value>[365,168,730][i]!)){res.status(400).json({error:'Invalid retention policy'});return;}
    await transaction(pool,async client=>{
      await client.query('UPDATE ethiosms.settings SET message_retention_days=$1,otp_retention_hours=$2,audit_retention_days=$3',values);
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action) VALUES ($1,$2,$3,'retention.updated')",[randomUUID(),res.locals.user.tenant_id,res.locals.user.id]);
    });res.json({status:'updated'});
  });
  router.post('/admin/dispatch',authenticate,admin,async(req,res)=>{
    if(typeof req.body?.paused!=='boolean'){res.status(400).json({error:'Boolean paused flag required'});return;}
    await transaction(pool,async client=>{
      await client.query('UPDATE ethiosms.settings SET sending_paused=$1',[req.body.paused]);
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action) VALUES ($1,$2,$3,$4)",[randomUUID(),res.locals.user.tenant_id,res.locals.user.id,req.body.paused?'dispatch.paused':'dispatch.resumed']);
    });
    if(!req.body.paused)dispatcher?.kick();res.json({paused:req.body.paused});
  });
  router.post('/admin/dispatch/drain',authenticate,admin,async(_req,res)=>{
    if(!dispatcher){res.status(503).json({error:'Dispatcher not configured'});return;}
    res.json(await dispatcher.drain());
  });
  if(config)router.use(campaignRouter(pool,config,authenticate,admin,dispatcher));
  if(config)router.use(dashboardRouter(pool,config,authenticate,admin,dispatcher));
  router.use(developerRouter(pool,authenticate,admin));
  router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    const status=(error as {status?:number})?.status;
    res.status(status===400||status===413?status:503).json({error:status===400?'Invalid JSON':status===413?'Request too large':'Account service unavailable'});
  });
  return router;
}
