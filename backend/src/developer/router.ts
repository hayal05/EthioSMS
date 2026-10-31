import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Config } from '../config.js';
import { messageRouter } from '../messaging/router.js';
import { transaction } from '../db/pool.js';
import { AccessError,uuid,validScopes } from './common.js';
import { issueKey,authenticateKey,enforceApiRate } from './keys.js';
import { usage } from './quotas.js';

const safeError=(error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  if(error instanceof AccessError){res.status(error.status).json({error:error.message});return;}
  if((error as {code?:string})?.code==='23505'){res.status(409).json({error:'Name already in use'});return;}
  res.status(503).json({error:'Developer service unavailable'});
};
const limitFields=['global_daily_segments','tenant_daily_segments','application_daily_segments','key_requests_per_minute','application_requests_per_minute','tenant_requests_per_minute','global_requests_per_minute'] as const;
const settingsColumns=limitFields.join(',')+',allowed_destination_prefixes';
export function developerRouter(pool:pg.Pool,authenticate:RequestHandler,admin:RequestHandler) {
  const router=express.Router();
  router.get('/applications',authenticate,async(_req,res)=>{
    const result=await pool.query('SELECT id,name,enabled,created_at FROM ethiosms.applications WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20',[res.locals.user.tenant_id]);res.json({applications:result.rows});
  });
  router.post('/applications',authenticate,async(req,res)=>{
    const name=req.body?.name;
    if(typeof name!=='string'||name.trim().length<1||name.trim().length>120)throw new AccessError(400,'Application name must be 1–120 characters');
    const actor=res.locals.user;
    const application=await transaction(pool,async client=>{
      const tenant=await client.query('SELECT id FROM ethiosms.tenants WHERE id=$1 AND enabled FOR UPDATE',[actor.tenant_id]);
      if(!tenant.rowCount)throw new AccessError(403,'Account unavailable');
      const count=await client.query('SELECT count(*) FROM ethiosms.applications WHERE tenant_id=$1',[actor.tenant_id]);
      if(Number(count.rows[0].count)>=20)throw new AccessError(409,'Pilot limit of 20 applications reached');
      const id=randomUUID();
      const result=await client.query('INSERT INTO ethiosms.applications(id,tenant_id,name) VALUES ($1,$2,$3) RETURNING id,name,enabled,created_at',[id,actor.tenant_id,name.trim()]);
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,'application.created',$4)",[randomUUID(),actor.tenant_id,actor.id,id]);return result.rows[0];
    });res.status(201).json({application});
  });
  router.patch('/applications/:id',authenticate,async(req,res)=>{
    if(!uuid(req.params.id))throw new AccessError(400,'Invalid application ID');
    const name=req.body?.name;
    if((name!==undefined&&(typeof name!=='string'||name.trim().length<1||name.trim().length>120)) || (req.body?.enabled!==undefined&&req.body.enabled!==false) || (name===undefined&&req.body?.enabled!==false))throw new AccessError(400,'Provide a valid name or disable the application');
    const actor=res.locals.user;
    const updated=await transaction(pool,async client=>{
      const result=await client.query('UPDATE ethiosms.applications SET name=COALESCE($1,name),enabled=CASE WHEN $2 THEN false ELSE enabled END WHERE tenant_id=$3 AND id=$4 RETURNING id,name,enabled',[name?.trim()??null,req.body?.enabled===false,actor.tenant_id,req.params.id]);
      if(!result.rowCount)throw new AccessError(404,'Application not found');
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,'application.updated',$4)",[randomUUID(),actor.tenant_id,actor.id,req.params.id]);return result.rows[0];
    });res.json({application:updated});
  });
  router.get('/applications/:id/keys',authenticate,async(req,res)=>{
    if(!uuid(req.params.id))throw new AccessError(400,'Invalid application ID');
    const app=await pool.query('SELECT id FROM ethiosms.applications WHERE tenant_id=$1 AND id=$2',[res.locals.user.tenant_id,req.params.id]);
    if(!app.rowCount)throw new AccessError(404,'Application not found');
    const keys=await pool.query('SELECT id,prefix,scopes,created_at,revoked_at FROM ethiosms.api_keys WHERE tenant_id=$1 AND application_id=$2 ORDER BY created_at DESC LIMIT 100',[res.locals.user.tenant_id,req.params.id]);res.json({keys:keys.rows});
  });
  router.post('/applications/:id/keys',authenticate,async(req,res)=>{
    if(!uuid(req.params.id)||!validScopes(req.body?.scopes))throw new AccessError(400,'Valid application and permissions required');
    res.status(201).json(await issueKey(pool,res.locals.user.tenant_id,req.params.id,req.body.scopes));
  });
  router.post('/applications/:id/keys/:keyId/rotate',authenticate,async(req,res)=>{
    if(!uuid(req.params.id)||!uuid(req.params.keyId))throw new AccessError(400,'Invalid application or key ID');
    res.status(201).json(await issueKey(pool,res.locals.user.tenant_id,req.params.id,undefined,req.params.keyId));
  });
  router.delete('/applications/:id/keys/:keyId',authenticate,async(req,res)=>{
    if(!uuid(req.params.id)||!uuid(req.params.keyId))throw new AccessError(400,'Invalid application or key ID');
    const actor=res.locals.user;
    await transaction(pool,async client=>{
      const result=await client.query('UPDATE ethiosms.api_keys SET revoked_at=COALESCE(revoked_at,now()) WHERE tenant_id=$1 AND application_id=$2 AND id=$3 RETURNING id',[actor.tenant_id,req.params.id,req.params.keyId]);
      if(!result.rowCount)throw new AccessError(404,'Key not found');
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action,resource_id) VALUES ($1,$2,$3,'api_key.revoked',$4)",[randomUUID(),actor.tenant_id,actor.id,req.params.keyId]);
    });res.status(204).end();
  });
  router.get('/applications/:id/usage',authenticate,async(req,res)=>{
    if(!uuid(req.params.id))throw new AccessError(400,'Invalid application ID');
    const app=await pool.query('SELECT id FROM ethiosms.applications WHERE tenant_id=$1 AND id=$2',[res.locals.user.tenant_id,req.params.id]);
    if(!app.rowCount)throw new AccessError(404,'Application not found');
    res.json(await usage(pool,res.locals.user.tenant_id,req.params.id));
  });
  router.get('/admin/applications',authenticate,admin,async(_req,res)=>{
    const result=await pool.query('SELECT a.id,a.name,a.enabled,t.name AS account FROM ethiosms.applications a JOIN ethiosms.tenants t ON t.id=a.tenant_id ORDER BY a.created_at DESC LIMIT 100');res.json({applications:result.rows});
  });
  router.get('/admin/limits',authenticate,admin,async(_req,res)=>{
    res.json((await pool.query(`SELECT ${settingsColumns} FROM ethiosms.settings WHERE singleton`)).rows[0]);
  });
  router.patch('/admin/limits',authenticate,admin,async(req,res)=>{
    const values=limitFields.map(field=>req.body?.[field]);
    if(values.some((value,i)=>!Number.isInteger(value)||value<(i<3?0:1)||value>(i<3?100000:10000)))throw new AccessError(400,'All seven limits must be valid integers');
    const prefixes=req.body?.allowed_destination_prefixes;
    if(!Array.isArray(prefixes)||prefixes.length<1||prefixes.length>20||new Set(prefixes).size!==prefixes.length||!prefixes.every(value=>typeof value==='string'&&/^\+[1-9]\d{0,3}$/.test(value)))throw new AccessError(400,'Provide 1–20 unique destination prefixes');
    const actor=res.locals.user;
    const updated=await transaction(pool,async client=>{
      const result=await client.query(`UPDATE ethiosms.settings SET ${limitFields.map((field,i)=>`${field}=$${i+1}`).join(',')},allowed_destination_prefixes=$8 WHERE singleton RETURNING ${settingsColumns}`,[...values,prefixes]);
      await client.query("INSERT INTO ethiosms.audit_events(id,tenant_id,actor_user_id,action) VALUES ($1,$2,$3,'limits.updated')",[randomUUID(),actor.tenant_id,actor.id]);return result.rows[0];
    });res.json(updated);
  });
  router.use(safeError);return router;
}
export function apiRouter(pool:pg.Pool,config:Config) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/usage',async(req,res)=>{
    const authorization=req.get('Authorization')??'';
    const identity=await authenticateKey(pool,authorization.startsWith('Bearer ')?authorization.slice(7):undefined,'usage:read');
    await enforceApiRate(pool,identity);res.json(await usage(pool,identity.tenant_id,identity.application_id));
  });
  router.use('/messages',messageRouter(pool,config));
  router.use((_req,res)=>{res.status(404).json({error:'Endpoint not available'});});
  router.use(safeError);return router;
}
