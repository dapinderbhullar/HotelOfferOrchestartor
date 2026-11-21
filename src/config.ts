function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid setting ' + name);
  return value;
}

const port = positiveInteger('PORT', 3000);
if (port > 65535) throw new Error('Invalid setting PORT');

export const config = {
  port,
  host: process.env.HOST ?? '127.0.0.1',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offers',
  supplierAUrl: process.env.SUPPLIER_A_URL ?? 'http://127.0.0.1:' + port,
  supplierBUrl: process.env.SUPPLIER_B_URL ?? 'http://127.0.0.1:' + port,
  cacheTtl: positiveInteger('CACHE_TTL_SECONDS', 300),
  partialTtl: positiveInteger('PARTIAL_CACHE_TTL_SECONDS', 30),
};
