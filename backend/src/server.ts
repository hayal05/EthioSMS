import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/pool.js';
import { Dispatcher } from './messaging/dispatch.js';
import { databaseReady } from './db/migrations.js';

try {
  const config = loadConfig();
  const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
  const dispatcher=database&&config.payloadEncryptionKey?new Dispatcher(database,config.payloadEncryptionKey):undefined;
  const server = createApp(config, undefined, database ? () => databaseReady(database) : undefined, database,dispatcher).listen(config.port, '0.0.0.0', () => {
    dispatcher?.kick();
    console.info(`EthioSMS listening on port ${config.port}; mock gateway; SMS disabled`);
  });
  server.on('error', () => { console.error('Server failed to listen'); process.exitCode = 1; });
  const shutdown = () => {
    dispatcher?.stop();
    server.close(() => {
      void (database?.end() ?? Promise.resolve()).then(() => process.exit(0), () => process.exit(1));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Startup failed');
  process.exitCode = 1;
}
