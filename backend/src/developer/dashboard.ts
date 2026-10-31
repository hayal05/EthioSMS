import express,{type RequestHandler,type Request,type Response,type NextFunction} from 'express';
import type pg from 'pg';
import type { Config } from '../config.js';
import type { Dispatcher } from '../messaging/dispatch.js';
import { enforceApiRate } from './keys.js';
import { AccessError,uuid,globalScopeId } from './common.js';
import { listMessages,messageDetail,submitMessage } from '../messaging/router.js';
export function dashboardRouter(pool:pg.Pool,config:Config,authenticate:RequestHandler,admin:RequestHandler,dispatcher?:Dispatcher){
  const router=express.Router();
  const ownApp=async(req:Request,res:Response,next:NextFunction)=>{
    const id=req.query.applicationId;
    if(!uuid(id))throw new AccessError(400,'Select an application');
    const own=await pool.query('SELECT id FROM ethiosms.applications WHERE id=$1 AND tenant_id=$2',[id,res.locals.user.tenant_id]);
    if(!own.rowCount)throw new AccessError(404,'Application not found');res.locals.identity={tenant_id:res.locals.user.tenant_id,application_id:id};await enforceApiRate(pool,{...res.locals.identity,key_id:res.locals.user.id,scopes:[]});next();
  };
  router.get('/dashboard/config',authenticate,(_req,res)=>res.json({mode:config.gateway==='smsgate'?'live':'mock'}));
  router.get('/dashboard/messages',authenticate,ownApp,async(req,res)=>res.json(await listMessages(pool,res.locals.identity,req.query)));
  router.get('/dashboard/messages/:id',authenticate,ownApp,async(req,res)=>{if(!uuid(req.params.id))throw new AccessError(400,'Invalid message ID');res.json(await messageDetail(pool,res.locals.identity,req.params.id));});
  router.post('/dashboard/messages',authenticate,ownApp,async(req,res)=>{const result=await submitMessage(pool,config,res.locals.identity,req.body,req.get('Idempotency-Key'));res.status(202).json(result);dispatcher?.kick();});
  router.get('/dashboard/audit',authenticate,async(_req,res)=>{
    const actor=res.locals.user;
    const result=await pool.query(`SELECT a.action,a.created_at,u.username FROM ethiosms.audit_events a LEFT JOIN ethiosms.users u ON u.id=a.actor_user_id
      WHERE ($1::boolean OR a.tenant_id=$2) ORDER BY a.created_at DESC,a.id DESC LIMIT 20`,[actor.role==='admin',actor.tenant_id]);res.json({events:result.rows});
  });
  router.get('/admin/overview',authenticate,admin,async(_req,res)=>{
    const settings=(await pool.query('SELECT sending_paused FROM ethiosms.settings')).rows[0];
    const counts=(await pool.query('SELECT status,count(*)::int AS count FROM ethiosms.message_recipients GROUP BY status')).rows;
    const usage=(await pool.query("SELECT reserved_segments,used_segments FROM ethiosms.usage_counters WHERE scope='global' AND scope_id=$1 AND usage_date=(now() AT TIME ZONE 'Africa/Addis_Ababa')::date",[globalScopeId])).rows[0]??{reserved_segments:0,used_segments:0};
    const contact=(await pool.query('SELECT last_api_contact_at FROM ethiosms.gateway_health')).rows[0];
    const failures=(await pool.query("SELECT r.id,r.status,r.last_error_code,r.updated_at,j.gateway_mode AS mode,a.name AS application FROM ethiosms.message_recipients r JOIN ethiosms.message_jobs j ON j.id=r.job_id JOIN ethiosms.applications a ON a.id=j.application_id WHERE r.status IN ('failed','unknown') ORDER BY r.updated_at DESC LIMIT 20")).rows;
    res.json({paused:settings.sending_paused,mode:config.gateway==='smsgate'?'live':'mock',counts,usage,lastApiContact:contact?.last_api_contact_at??null,failures});
  });
  router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{if(error instanceof AccessError){res.status(error.status).json({error:error.message});return;}res.status((error as Error)?.message==='Idempotency conflict'?409:503).json({error:(error as Error)?.message==='Idempotency conflict'?'Conflicting message request':'Dashboard unavailable'});});
  return router;
}
