import express from 'express';
import helmet from 'helmet';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';

export function createApp(config: Config, webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist')) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  // Liveness intentionally never touches a database, gateway, or secret.
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'EthioSMS' }));
  app.get('/api/ready', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const expected = config.readinessToken;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!expected || !timingSafeEqual(digest(req.get('authorization') ?? ''), digest(`Bearer ${expected}`))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    // Readiness applies only to this foundation; database and phone are not connected.
    res.json({ status: 'ready', stage: 'foundation', gateway: config.gateway, smsEnabled: config.smsEnabled, database: 'not_configured' });
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Endpoint not available' }); });
  if (existsSync(resolve(webRoot, 'index.html'))) {
    app.use(express.static(webRoot, { index: false }));
    app.get(['/', '/dashboard'], (_req, res) => res.sendFile(resolve(webRoot, 'index.html')));
  }
  app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  return app;
}
