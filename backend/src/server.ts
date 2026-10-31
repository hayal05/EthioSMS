import { createApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const server = createApp(config).listen(config.port, '0.0.0.0', () => {
    console.info(`EthioSMS listening on port ${config.port}; mock gateway; SMS disabled`);
  });
  server.on('error', () => { console.error('Server failed to listen'); process.exitCode = 1; });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Startup failed');
  process.exitCode = 1;
}
