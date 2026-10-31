import { createCipheriv,createDecipheriv,createHmac,randomBytes } from 'node:crypto';
export function encryptPayload(key:string,context:string,payload:unknown) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function decryptPayload(key:string,context:string,value:string):unknown {
  const [version,iv,tag,ciphertext,...extra]=value.split('.');
  if(version!=='v1'||!iv||!tag||!ciphertext||extra.length)throw new Error('Invalid encrypted payload');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64url'));
  decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8'));
}
export function requestDigest(key:string,canonical:unknown) {
  return createHmac('sha256',Buffer.from(key,'hex')).update('ethiosms-request-v1\0').update(JSON.stringify(canonical)).digest('hex');
}
export const payloadContext=(tenantId:string,applicationId:string,idempotencyKey:string)=>`${tenantId}:${applicationId}:${idempotencyKey}`;
