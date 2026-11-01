import type pg from 'pg';
import type { Gateway } from './dispatch.js';
import type { Config } from '../config.js';
import type { MockResult,MockScenario } from './mock.js';
export class SmsGate implements Gateway {
  constructor(private config:Config,private pool:pg.Pool,private http:typeof fetch=fetch){}
  private async call(path:string,method:string,body?:unknown){
    const c=this.config;
    const authorization=c.smsGateToken?`Bearer ${c.smsGateToken}`:`Basic ${Buffer.from(`${c.smsGateUsername}:${c.smsGatePassword}`).toString('base64')}`;
    const response=await this.http(`https://api.sms-gate.app/3rdparty/v1${path}`,{method,headers:{Authorization:authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10_000),redirect:'error'});
    if(response.ok)await this.pool.query('UPDATE ethiosms.gateway_health SET last_api_contact_at=now() WHERE singleton');
    return response;
  }
  async submit(request:{requestId:string;scenario:MockScenario;to:string;message:string;expiresAt?:Date;priority?:number}):Promise<MockResult>{
    if(!this.config.smsEnabled||!this.config.liveApproved||!this.config.liveRecipients.includes(request.to))return {outcome:'rejected',code:'LIVE_NOT_ALLOWED'};
    const ttl=Math.floor(((request.expiresAt?.getTime()??Date.now()+60000)-Date.now())/1000);
    if(ttl<=0)return {outcome:'rejected',code:'EXPIRED'};
    try{
      const response=await this.call('/messages','POST',{deviceId:this.config.smsGateDeviceId,textMessage:{text:request.message},phoneNumbers:[request.to],simNumber:this.config.smsGateSim,ttl,priority:request.priority??0});
      if([400,401,403,422].includes(response.status))return {outcome:'rejected',code:'GATEWAY_REJECTED'};
      // No response body or server error is evidence that the POST did not reach the phone.
      if(!response.ok)return {outcome:'unknown',code:'GATEWAY_UNCERTAIN'};
      const data=await response.json() as {id?:unknown};
      if(typeof data.id!=='string'||!data.id)return {outcome:'unknown',code:'GATEWAY_RESPONSE_MISMATCH'};
      return {outcome:'accepted',providerId:data.id};
    }catch{return {outcome:'unknown',code:'GATEWAY_TIMEOUT'};}
  }
  async status(request:{scenario:MockScenario;submittedAt:number;providerId:string}):Promise<'accepted'|'sent'|'delivered'|'unknown'|'failed'>{
    try{
      const response=await this.call(`/messages/${encodeURIComponent(request.providerId)}`,'GET');if(!response.ok)return 'unknown';
      const data=await response.json() as {id?:unknown;state?:unknown};if(data.id!==request.providerId)return 'unknown';
      switch(data.state){case 'Pending':case 'Cancelling':return 'accepted';case 'Processed':return Date.now()-request.submittedAt>300000?'unknown':'accepted';case 'Sent':return 'sent';case 'Delivered':return 'delivered';case 'Failed':case 'Cancelled':return 'failed';default:return 'unknown';}
    }catch{return 'unknown';}
  }
}
