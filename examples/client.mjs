/** Server-side only. Importing this file performs no network requests. */
export class EthioSMS {
  constructor({baseUrl,apiKey,http=fetch}) {
    const url=new URL(baseUrl);
    if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash)throw new Error('Use an HTTPS API base URL');
    if(typeof apiKey!=='string'||!/^esms_[a-f0-9]{64}$/.test(apiKey))throw new Error('Configure a private EthioSMS API key');
    this.baseUrl=url.toString().replace(/\/$/,'');this.apiKey=apiKey;this.http=http;
  }
  async request(method,path,body,idempotencyKey) {
    let response;
    try{response=await this.http(this.baseUrl+path,{method,headers:{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});}
    catch{throw new Error('Request outcome is unconfirmed. Retry the same event with the same Idempotency-Key.');}
    if(!response.ok){const error=new Error(`EthioSMS rejected the request (${response.status})`);error.status=response.status;throw error;}
    return response.json();
  }
  send({to,message,eventId}) {
    if(!/^[A-Za-z0-9._:-]{1,100}$/.test(eventId??''))throw new Error('Persist a valid unique eventId');
    return this.request('POST','/api/v1/messages',{to,message},`event:${eventId}`);
  }
  status(id){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid message ID');return this.request('GET',`/api/v1/messages/${id}`);}
  usage(){return this.request('GET','/api/v1/usage');}
  requestOtp({to,purpose,eventId}){return this.request('POST','/api/v1/otp/request',{to,purpose},eventId);}
  verifyOtp({challengeId,purpose,code}){return this.request('POST','/api/v1/otp/verify',{challengeId,purpose,code});}
}
