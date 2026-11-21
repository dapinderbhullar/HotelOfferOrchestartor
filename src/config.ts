function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid setting ' + name);
  return value;
}

const port = positiveInteger('PORT', 3000);
if (port > 65535) throw new Error('Invalid setting PORT');
const runningOnRender = process.env.RENDER === 'true';
const supplierAddress = process.env.SUPPLIER_PRIVATE_ADDRESS;
const supplierOrigin = supplierAddress ? 'http://' + supplierAddress : 'http://127.0.0.1:' + port;

function allowedOrigins() {
  return (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const url = URL.parse(entry);
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.origin !== entry) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins');
    }
    return entry;
  });
}

export const config = {
  port,
  host: process.env.HOST ?? (runningOnRender ? '0.0.0.0' : '127.0.0.1'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  temporalApiKey: process.env.TEMPORAL_API_KEY || undefined,
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offers',
  supplierAUrl: process.env.SUPPLIER_A_URL ?? supplierOrigin,
  supplierBUrl: process.env.SUPPLIER_B_URL ?? supplierOrigin,
  mountSupplierRoutes: !runningOnRender && !supplierAddress,
  corsAllowedOrigins: allowedOrigins(),
  cacheTtl: positiveInteger('CACHE_TTL_SECONDS', 300),
  partialTtl: positiveInteger('PARTIAL_CACHE_TTL_SECONDS', 30),
};

export function temporalConnectionOptions() {
  const { temporalAddress: address, temporalApiKey: apiKey } = config;
  return apiKey ? { address, tls: true as const, apiKey } : { address };
}
