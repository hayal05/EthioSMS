import express from 'express';
import helmet from 'helmet';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import type pg from 'pg';
import { accountRouter } from './auth/router.js';
import type { Dispatcher } from './messaging/dispatch.js';
import { apiRouter } from './developer/router.js';

export function createApp(config: Config, webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist'), readiness?: () => Promise<boolean>, database?: pg.Pool,dispatcher?:Dispatcher) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  // Liveness intentionally never touches a database, gateway, or secret.
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'EthioSMS' }));
  app.get('/api/ready', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const expected = config.readinessToken;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!expected || !timingSafeEqual(digest(req.get('authorization') ?? ''), digest(`Bearer ${expected}`))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    let database = 'not_configured';
    if (config.databaseUrl) {
      try { database = readiness && await readiness() ? 'ready' : 'unavailable'; }
      catch { database = 'unavailable'; }
    }
    const ready = database === 'ready';
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', stage: 'database', gateway: config.gateway, smsEnabled: config.smsEnabled, database });
  });
  if (database) app.use('/api/v1',apiRouter(database,config,dispatcher));
  if (database) app.use('/api', accountRouter(database, config.nodeEnv === 'production',dispatcher,config));
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Endpoint not available' }); });
  if (existsSync(resolve(webRoot, 'index.html'))) {
    app.use(express.static(webRoot, { index: false }));
    app.get(['/', '/dashboard'], (_req, res) => res.sendFile(resolve(webRoot, 'index.html')));
  }
  app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  return app;
}
