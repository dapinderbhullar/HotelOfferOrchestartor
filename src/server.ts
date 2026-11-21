import { once } from 'node:events';
import { Client, Connection } from '@temporalio/client';
import { createApp } from './app';
import { config, temporalConnectionOptions } from './config';
import { errorKind, log } from './log';
import { connectWithRetry } from './runtime';
import { createRedis, hotelCache } from './services/cache';
import { hotelService, temporalAggregation } from './services/hotels';
import { fetchListings } from './services/suppliers';

async function main() {
  const redis = createRedis();
  const connection = await connectWithRetry('temporal', () => Connection.connect({
    ...temporalConnectionOptions(), connectTimeout: 3000,
  }));
  try {
    void redis.connect().catch((error: unknown) => log('error', 'redis.startup', { error: errorKind(error) }));
    const client = new Client({ connection, namespace: config.namespace });
    const app = createApp({
      hotels: hotelService(hotelCache(redis), temporalAggregation(client)),
      health: {
        redis: () => redis.ping(),
        temporal: () => connection.withDeadline(Date.now() + 2500, () =>
          connection.workflowService.describeNamespace({ namespace: config.namespace })),
        supplierA: () => fetchListings(config.supplierAUrl, 'Supplier A', 'delhi'),
        supplierB: () => fetchListings(config.supplierBUrl, 'Supplier B', 'delhi'),
      },
    }, { corsAllowedOrigins: config.corsAllowedOrigins, mountSupplierRoutes: config.mountSupplierRoutes });
    const server = app.listen(config.port, config.host);
    await once(server, 'listening');
    log('info', 'api.listening', { port: config.port });
    const shutdown = () => server.close();
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    try {
      await once(server, 'close');
    } finally {
      process.removeListener('SIGTERM', shutdown);
      process.removeListener('SIGINT', shutdown);
    }
  } finally {
    if (redis.isOpen) redis.destroy();
    await connection.close();
  }
}

main().catch((error: unknown) => {
  log('error', 'api.startup_failed', { error: errorKind(error) });
  process.exitCode = 1;
});
