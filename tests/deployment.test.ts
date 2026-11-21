import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, createSupplierApp, type Dependencies } from '../src/app';

const frontend = 'https://hotel-demo.vercel.app';
const ready = async () => undefined;
const down = async () => { throw new Error('Connection failed'); };

describe('hosted HTTP deployment', () => {
  let deps: Dependencies;
  let server: Server;
  let base: string;

  async function listen(app: ReturnType<typeof createApp>) {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
    return 'http://127.0.0.1:' + address.port;
  }

  beforeEach(() => {
    deps = {
      hotels: vi.fn(async () => ({ offers: [], failedSuppliers: ['Supplier A'] })),
      health: { redis: ready, temporal: ready, supplierA: ready, supplierB: ready },
    };
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  async function start() {
    base = await listen(createApp(deps, { mountSupplierRoutes: false, corsAllowedOrigins: [frontend] }));
  }

  it('allows the exact hosted origin on refresh and exposes partial-result metadata', async () => {
    await start();
    const response = await fetch(base + '/api/hotels/refresh?city=delhi', { method: 'POST', headers: { Origin: frontend } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(frontend);
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-Hotel-Failed-Suppliers');
    expect(response.headers.get('X-Hotel-Failed-Suppliers')).toBe('Supplier A');
    expect(response.headers.get('Vary')).toContain('Origin');
    expect(deps.hotels).toHaveBeenCalledWith('delhi', {}, true);
  });

  it('answers a matching preflight and rejects an unlisted refresh origin', async () => {
    await start();
    const path = base + '/api/hotels/refresh?city=delhi';
    const preflight = await fetch(path, { method: 'OPTIONS', headers: { Origin: frontend, 'Access-Control-Request-Method': 'POST' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    const blocked = await fetch(path, { method: 'POST', headers: { Origin: frontend + '.example.org' } });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(deps.hotels).not.toHaveBeenCalled();
  });

  it('continues serving offers during supplier degradation and fails readiness on a core dependency outage', async () => {
    deps.health.supplierA = down;
    await start();
    const health = await fetch(base + '/health', { headers: { Origin: frontend } });
    expect(health.status).toBe(503);
    expect(health.headers.get('Access-Control-Allow-Origin')).toBe(frontend);
    expect((await health.json()).status).toBe('degraded');
    expect((await fetch(base + '/ready')).status).toBe(200);
    deps.health.redis = down;
    const unready = await fetch(base + '/ready');
    expect(unready.status).toBe(503);
    expect(await unready.json()).toEqual({ status: 'unready' });
  });

  it('omits supplier routes from the hosted public API', async () => {
    await start();
    for (const supplier of ['supplierA', 'supplierB']) {
      expect((await fetch(base + '/' + supplier + '/hotels?city=delhi')).status).toBe(404);
    }
  });

  it('serves the same supplier contracts from the private process', async () => {
    base = await listen(createSupplierApp());
    for (const supplier of ['supplierA', 'supplierB']) {
      const response = await fetch(base + '/' + supplier + '/hotels?city=delhi');
      expect(response.status).toBe(200);
      expect(await response.json()).toHaveLength(7);
    }
    expect((await fetch(base + '/api/hotels?city=delhi')).status).toBe(404);
  });
});

it('enables TLS on both Temporal connection paths when API-key authentication is configured', async () => {
  vi.stubEnv('TEMPORAL_ADDRESS', 'namespace.account.tmprl.cloud:7233');
  vi.stubEnv('TEMPORAL_API_KEY', 'fixture-key');
  vi.resetModules();
  try {
    const { temporalConnectionOptions } = await import('../src/config');
    expect(temporalConnectionOptions()).toEqual({
      address: 'namespace.account.tmprl.cloud:7233', tls: true, apiKey: 'fixture-key',
    });
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

it('uses Render port and binding defaults with public supplier routes disabled', async () => {
  vi.stubEnv('RENDER', 'true');
  vi.stubEnv('HOST', undefined);
  vi.stubEnv('PORT', '10000');
  vi.stubEnv('SUPPLIER_PRIVATE_ADDRESS', undefined);
  vi.resetModules();
  try {
    const { config } = await import('../src/config');
    expect(config).toMatchObject({ port: 10000, host: '0.0.0.0', mountSupplierRoutes: false });
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
