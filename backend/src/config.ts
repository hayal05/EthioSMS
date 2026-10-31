export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  trustProxyHops: number;
  readinessToken?: string;
  databaseUrl?: string;
  payloadEncryptionKey?: string;
  gateway: 'mock';
  smsEnabled: false;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV');
  const port = env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid PORT');
  if ((env.SMS_GATEWAY ?? 'mock') !== 'mock') throw new Error('Only mock gateway is available');
  if ((env.SMS_ENABLED ?? 'false') !== 'false') throw new Error('Live SMS is unavailable in this release');
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
  const token = env.READINESS_TOKEN;
  if (token && (token.length < 32 || token.trim() !== token || /\s/.test(token))) throw new Error('READINESS_TOKEN must be at least 32 characters without whitespace');
  if (nodeEnv === 'production' && !token) throw new Error('READINESS_TOKEN is required in production');
  return { nodeEnv: nodeEnv as Config['nodeEnv'], port: Number(port), trustProxyHops:Number(trustProxyHops), readinessToken: token || undefined, databaseUrl, payloadEncryptionKey, gateway: 'mock', smsEnabled: false };
}
