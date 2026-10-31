import { normalizePhone } from './developer/common.js';
export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  trustProxyHops: number;
  readinessToken?: string;
  adminSetupKey?: string;
  databaseUrl?: string;
  payloadEncryptionKey?: string;
  otpSecret?:string;
  otpTtl:number;
  otpCooldown:number;
  otpAttempts:number;
  gateway: 'mock'|'smsgate';
  smsEnabled: boolean;
  liveApproved:boolean;
  liveRecipients:string[];
  smsGateToken?:string;
  smsGateUsername?:string;
  smsGatePassword?:string;
  smsGateDeviceId?:string;
  smsGateSim:number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV');
  const port = env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid PORT');
  const gateway=env.SMS_GATEWAY??'mock';
  if(!['mock','smsgate'].includes(gateway))throw new Error('Invalid SMS_GATEWAY');
  if(!['true','false'].includes(env.SMS_ENABLED??'false')||!['true','false'].includes(env.LIVE_SMS_APPROVED??'false'))throw new Error('Invalid live SMS flag');
  const smsEnabled=env.SMS_ENABLED==='true',liveApproved=env.LIVE_SMS_APPROVED==='true';
  let liveRecipients:string[]=[];
  try{liveRecipients=env.LIVE_SMS_RECIPIENTS?env.LIVE_SMS_RECIPIENTS.split(',').map(normalizePhone):[];}catch{throw new Error('Invalid LIVE_SMS_RECIPIENTS');}
  const smsGateSim=Number(env.SMSGATE_SIM??'1');if(![1,2,3].includes(smsGateSim))throw new Error('Invalid SMSGATE_SIM');
  if(gateway==='mock'&&smsEnabled)throw new Error('Mock mode cannot enable live SMS');
  if(gateway==='smsgate'&&(!smsEnabled||!liveApproved||!liveRecipients.length||!env.PAYLOAD_ENCRYPTION_KEY||!env.SMSGATE_DEVICE_ID||!(/^[a-zA-Z0-9_-]{1,100}$/.test(env.SMSGATE_DEVICE_ID))||!(env.SMSGATE_TOKEN||(env.SMSGATE_USERNAME&&env.SMSGATE_PASSWORD))))throw new Error('Live gateway requires explicit approval, allowlist, encryption, device and credentials');
  const trustProxyHops=env.TRUST_PROXY_HOPS??'0';
  if (!/^[01]$/.test(trustProxyHops)) throw new Error('TRUST_PROXY_HOPS must be 0 or 1');
  let databaseUrl: string | undefined;
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
      const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if (!local) {
        if (!['require','verify-full'].includes(url.searchParams.get('sslmode') ?? '')) throw new Error();
        if (['sslcert','sslkey','sslrootcert','uselibpqcompat','ssl'].some(key => url.searchParams.has(key))) throw new Error();
        url.searchParams.set('sslmode','verify-full');
      }
      databaseUrl = url.toString();
    } catch { throw new Error('Invalid DATABASE_URL; use PostgreSQL with verified TLS for remote databases'); }
  }
  const payloadEncryptionKey=env.PAYLOAD_ENCRYPTION_KEY;
  if(payloadEncryptionKey && !/^[a-f0-9]{64}$/.test(payloadEncryptionKey))throw new Error('PAYLOAD_ENCRYPTION_KEY must be 64 lowercase hexadecimal characters');
  const otpSecret=env.OTP_SECRET;
  if(otpSecret&&!/^[a-f0-9]{64}$/.test(otpSecret))throw new Error('OTP_SECRET must be 64 lowercase hexadecimal characters');
  const otpTtl=Number(env.OTP_TTL_SECONDS??300),otpCooldown=Number(env.OTP_RESEND_SECONDS??60),otpAttempts=Number(env.OTP_MAX_ATTEMPTS??5);
  if(!Number.isInteger(otpTtl)||otpTtl<60||otpTtl>600||!Number.isInteger(otpCooldown)||otpCooldown<30||otpCooldown>300||!Number.isInteger(otpAttempts)||otpAttempts<3||otpAttempts>10)throw new Error('Invalid OTP policy');
  const adminSetupKey=env.ADMIN_SETUP_KEY;
  if(adminSetupKey && (adminSetupKey.length<32 || adminSetupKey.trim()!==adminSetupKey || /\\s/.test(adminSetupKey))) throw new Error('ADMIN_SETUP_KEY must be at least 32 characters without whitespace');
  const token = env.READINESS_TOKEN;
  if (token && (token.length < 32 || token.trim() !== token || /\s/.test(token))) throw new Error('READINESS_TOKEN must be at least 32 characters without whitespace');
  if (nodeEnv === 'production' && !token) throw new Error('READINESS_TOKEN is required in production');
  return { nodeEnv: nodeEnv as Config['nodeEnv'], port: Number(port), trustProxyHops:Number(trustProxyHops), readinessToken: token || undefined, adminSetupKey:adminSetupKey||undefined, databaseUrl, payloadEncryptionKey,otpSecret,otpTtl,otpCooldown,otpAttempts, gateway:gateway as Config['gateway'],smsEnabled,liveApproved,liveRecipients,smsGateToken:env.SMSGATE_TOKEN,smsGateUsername:env.SMSGATE_USERNAME,smsGatePassword:env.SMSGATE_PASSWORD,smsGateDeviceId:env.SMSGATE_DEVICE_ID,smsGateSim };
}
