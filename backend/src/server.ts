import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';

const app = await buildApp();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Graceful shutdown started');
  await app.close();
  await closePool();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  await closePool();
  process.exit(1);
}
