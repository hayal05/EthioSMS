import express,{type Request,type Response,type NextFunction} from 'express';
import type pg from 'pg';
import type { Config } from '../config.js';
import { AccessError,normalizePhone,uuid,type Scope } from '../developer/common.js';
import { authenticateKey,enforceApiRate,type ApiIdentity } from '../developer/keys.js';
import { reserveMessage } from '../developer/quotas.js';
import { estimateSegments } from './segments.js';
import { encryptPayload,requestDigest,payloadContext } from './crypto.js';
import type { Dispatcher } from './dispatch.js';
import { mockScenarios,type MockScenario } from './mock.js';

const combinedStatus=(statuses:string[])=>statuses.length===1?statuses[0]!:statuses.length?'mixed':'unknown';
const mask=(phone:string)=>'+'+'*'.repeat(Math.max(0,phone.length-5))+phone.slice(-4);
function cursor(value:unknown):{createdAt:string;id:string}|undefined {
  if(value===undefined)return;
  if(typeof value!=='string'||value.length>512||!/^[A-Za-z0-9_-]+$/.test(value))throw new AccessError(400,'Invalid cursor');
  try{
    const decoded=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(!uuid(decoded.id)||typeof decoded.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(decoded.createdAt)||!Number.isFinite(Date.parse(decoded.createdAt)))throw new Error();
    if(Number(decoded.createdAt.slice(0,4))<1||new Date(decoded.createdAt).toISOString()!==decoded.createdAt.slice(0,23)+'Z')throw new Error();
    return {createdAt:decoded.createdAt,id:decoded.id};
  }catch{throw new AccessError(400,'Invalid cursor');}
}
async function detail(pool:pg.Pool,identity:ApiIdentity,id:string){
  const job=(await pool.query('SELECT id,kind,encoding,gateway_mode,created_at,expires_at FROM ethiosms.message_jobs j WHERE tenant_id=$1 AND application_id=$2 AND id=$3',[identity.tenant_id,identity.application_id,id])).rows[0];
  if(!job)throw new AccessError(404,'Message not found');
  const recipients=(await pool.query('SELECT id,phone_number,segments,status,last_error_code FROM ethiosms.message_recipients WHERE tenant_id=$1 AND job_id=$2 ORDER BY id',[identity.tenant_id,id])).rows;
  return {id:job.id,kind:job.kind,encoding:job.encoding,mode:job.gateway_mode,createdAt:job.created_at,expiresAt:job.expires_at,
    status:combinedStatus([...new Set(recipients.map(row=>row.status as string))]),totalSegments:recipients.reduce((sum,row)=>sum+row.segments,0),recipients:recipients.map(row=>({id:row.id,to:mask(row.phone_number),segments:row.segments,status:row.status,errorCode:row.last_error_code}))};
}
export function messageRouter(pool:pg.Pool,config:Config,dispatcher?:Dispatcher){
  const router=express.Router();
  const guard=(scope:Scope)=>async(req:Request,res:Response,next:NextFunction)=>{
    const auth=req.get('Authorization')??'';
    const identity=await authenticateKey(pool,auth.startsWith('Bearer ')?auth.slice(7):undefined,scope);
    await enforceApiRate(pool,identity);res.locals.identity=identity;next();
  };
  router.post('/',guard('messages:send'),express.json({limit:'16kb'}),async(req,res)=>{
    if(!req.is('application/json'))throw new AccessError(415,'Content-Type must be application/json');
    if(!config.payloadEncryptionKey)throw new AccessError(503,'Message storage encryption is not configured');
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['to','message','expiresInSeconds','mockScenario'].includes(key)))throw new AccessError(400,'Unsupported message fields');
    const idempotencyKey=req.get('Idempotency-Key');
    if(!idempotencyKey||idempotencyKey.startsWith('otp:')||idempotencyKey.startsWith('bulk:')||!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey))throw new AccessError(400,'A valid Idempotency-Key header is required');
    const to=normalizePhone(body.to),estimate=estimateSegments(body.message);
    const ttl=body.expiresInSeconds??3600;
    if(!Number.isInteger(ttl)||ttl<30||ttl>86400)throw new AccessError(400,'Expiry must be 30–86400 seconds');
    if(config.gateway==='smsgate'&&body.mockScenario!==undefined)throw new AccessError(400,'Mock scenarios are unavailable for live messages');
    if(config.gateway==='smsgate'&&!config.liveRecipients.includes(to))throw new AccessError(403,'Recipient is not on the live pilot allowlist');
    const scenario=body.mockScenario??'success';
    if(!mockScenarios.includes(scenario))throw new AccessError(400,'Invalid mock scenario');
    const identity=res.locals.identity as ApiIdentity;
    const canonical={to,message:body.message,expiresInSeconds:ttl,mockScenario:scenario as MockScenario,mode:config.gateway==='smsgate'?'live':'mock'};
    const id=await reserveMessage(pool,{tenantId:identity.tenant_id,applicationId:identity.application_id,idempotencyKey,
      requestHash:requestDigest(config.payloadEncryptionKey,canonical),kind:'notification',mode:config.gateway==='smsgate'?'live':'mock',encoding:estimate.encoding,
      payloadCiphertext:encryptPayload(config.payloadEncryptionKey,payloadContext(identity.tenant_id,identity.application_id,idempotencyKey),{message:body.message,mockScenario:scenario}),
      expiresAt:new Date(Date.now()+ttl*1000),recipients:[{phoneNumber:to,segments:estimate.segments}]});
    const result=await detail(pool,identity,id);
    res.location(`/api/v1/messages/${id}`).status(202).json(result);dispatcher?.kick();
  });
  router.get('/',guard('messages:read'),async(req,res)=>{
    const raw=req.query.limit??'20';
    if(typeof raw!=='string'||!/^\d{1,3}$/.test(raw)||Number(raw)<1||Number(raw)>100)throw new AccessError(400,'Limit must be 1–100');
    const page=cursor(req.query.cursor),limit=Number(raw),identity=res.locals.identity as ApiIdentity;
    // Keep PostgreSQL microsecond precision in cursors (JS Dates truncate it).
    const rows=(await pool.query(`SELECT id,kind,encoding,gateway_mode AS mode,created_at,expires_at,
      ARRAY(SELECT DISTINCT r.status FROM ethiosms.message_recipients r WHERE r.tenant_id=j.tenant_id AND r.job_id=j.id) AS statuses,
      (SELECT COALESCE(sum(r.segments),0)::int FROM ethiosms.message_recipients r WHERE r.tenant_id=j.tenant_id AND r.job_id=j.id) AS total_segments,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
      FROM ethiosms.message_jobs j WHERE tenant_id=$1 AND application_id=$2
      AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,
      [identity.tenant_id,identity.application_id,page?.createdAt??null,page?.id??null,limit+1])).rows;
    const more=rows.length>limit,selected=rows.slice(0,limit),last=selected[selected.length-1];
    res.json({messages:selected.map(item=>({id:item.id,kind:item.kind,encoding:item.encoding,mode:item.mode,status:combinedStatus(item.statuses),totalSegments:item.total_segments,createdAt:item.created_at,expiresAt:item.expires_at})),nextCursor:more&&last?Buffer.from(JSON.stringify({createdAt:last.cursor_time,id:last.id})).toString('base64url'):null});
  });
  router.get('/:id',guard('messages:read'),async(req,res)=>{
    if(!uuid(req.params.id))throw new AccessError(400,'Invalid message ID');
    res.json(await detail(pool,res.locals.identity as ApiIdentity,req.params.id));
  });
  router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(error instanceof AccessError){res.status(error.status).json({error:error.message});return;}
    if((error as Error)?.message==='Idempotency conflict'){res.status(409).json({error:'Idempotency key was used for a different request'});return;}
    const status=(error as {status?:number})?.status;
    res.status(status===400||status===413?status:503).json({error:status===400?'Invalid JSON':status===413?'Request too large':'Message service unavailable'});
  });
  return router;
}
