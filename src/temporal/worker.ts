import { NativeConnection, Runtime, Worker } from '@temporalio/worker';
import { config, temporalConnectionOptions } from '../config';
import { errorKind, log } from '../log';
import { connectWithRetry } from '../runtime';
import { createRedis, hotelCache } from '../services/cache';
import { hotelActivities } from './activities';

async function main() {
  Runtime.install({ shutdownSignals: ['SIGINT', 'SIGTERM'] });
  const redis = createRedis();
  const connection = await connectWithRetry('temporal', () => NativeConnection.connect(temporalConnectionOptions()));
  try {
    void redis.connect().catch((error: unknown) => log('error', 'redis.startup', { error: errorKind(error) }));
    const worker = await Worker.create({
      connection,
      namespace: config.namespace,
      taskQueue: config.taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities: hotelActivities(hotelCache(redis)),
      shutdownGraceTime: '10 seconds',
      shutdownForceTime: '15 seconds',
    });
    log('info', 'worker.ready', { taskQueue: config.taskQueue });
    await worker.run();
  } finally {
    if (redis.isOpen) redis.destroy();
    await connection.close();
  }
}

main().catch((error: unknown) => {
  log('error', 'worker.failed', { error: errorKind(error) });
  process.exitCode = 1;
});
