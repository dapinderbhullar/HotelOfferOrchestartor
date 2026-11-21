import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type Dependencies } from '../src/app';
import { hotelService } from '../src/services/hotels';
import { selectBestOffers } from '../src/services/deduplicate';
import { fetchListings, InvalidSupplierData } from '../src/services/suppliers';
import { listings } from '../src/suppliers/catalog';
import type { Aggregation } from '../src/types/hotel';

const sample: Aggregation = { offers: selectBestOffers(listings('Supplier A', 'delhi'), listings('Supplier B', 'delhi')), failedSuppliers: [] };

describe('best offer selection', () => {
  it('keeps the cheaper supplier and commission, gives A the tie, and preserves exclusives', () => {
    const b = listings('Supplier B', 'delhi');
    b[0].name = '  HOLTIN ';
    const offers = selectBestOffers(listings('Supplier A', 'delhi'), b);
    expect(offers).toHaveLength(10);
    expect(offers).toEqual(expect.arrayContaining([
      { name: 'HOLTIN', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
      { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
      { name: 'Aerocity Grand', price: 7000, supplier: 'Supplier A', commissionPct: 14 },
      expect.objectContaining({ name: 'Saket Park Hotel', supplier: 'Supplier A' }),
      expect.objectContaining({ name: 'Lotus Temple Inn', supplier: 'Supplier B' }),
    ]));
    expect(selectBestOffers([], [])).toEqual([]);
  });
});

describe('hotel cache coordination', () => {
  it('joins concurrent misses, then serves filtered and empty hits from the cache', async () => {
    let snapshot: Aggregation | null = null;
    const read = vi.fn(async () => snapshot);
    const aggregate = vi.fn(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      snapshot = sample;
      return sample;
    });
    const service = hotelService({ read, save: vi.fn() }, aggregate);
    await Promise.all([service('delhi', {}), service('delhi', { max: 7000 })]);
    expect(aggregate).toHaveBeenCalledTimes(1);
    snapshot = { offers: [], failedSuppliers: [] };
    expect(await service('delhi', { min: 9999 })).toEqual(snapshot);
    expect(read).toHaveBeenLastCalledWith('delhi', { min: 9999 });
    expect(aggregate).toHaveBeenCalledTimes(1);
    await service('delhi', {}, true);
    expect(aggregate).toHaveBeenCalledTimes(2);
  });
});

describe('Express endpoints', () => {
  let server: Server;
  let base: string;
  let deps: Dependencies;

  beforeEach(async () => {
    const healthy = async () => true;
    deps = {
      hotels: vi.fn(async () => sample),
      health: { redis: healthy, temporal: healthy, supplierA: healthy, supplierB: healthy },
    };
    server = createApp(deps).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server');
    base = 'http://127.0.0.1:' + address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it.each([['supplierA', 'a', 6000], ['supplierB', 'b', 5340]])('returns %s data', async (path, prefix, price) => {
    const response = await fetch(base + '/' + path + '/hotels?city=Delhi');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(7);
    expect(data[0]).toMatchObject({ hotelId: prefix + '1', price, city: 'delhi' });
  });

  it.each([
    ['', 'CITY_REQUIRED'],
    ['?city=unknown', 'UNSUPPORTED_CITY'],
    ['?city=delhi&city=mumbai', 'UNSUPPORTED_CITY'],
    ['?city=delhi&minPrice=NaN', 'INVALID_PRICE'],
    ['?city=delhi&minPrice=1&minPrice=2', 'INVALID_PRICE'],
    ['?city=delhi&maxPrice=-1', 'INVALID_PRICE'],
    ['?city=delhi&minPrice=8&maxPrice=7', 'INVALID_PRICE_RANGE'],
  ])('validates %s', async (query, code) => {
    const response = await fetch(base + '/api/hotels' + query);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(deps.hotels).not.toHaveBeenCalled();
  });

  it('passes inclusive bounds through and exposes a partial result warning', async () => {
    deps.hotels = vi.fn(async () => ({ offers: [], failedSuppliers: ['Supplier A'] }));
    const response = await fetch(base + '/api/hotels?city=delhi&minPrice=0&maxPrice=4.5');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Hotel-Failed-Suppliers')).toBe('Supplier A');
    expect(await response.json()).toEqual([]);
    expect(deps.hotels).toHaveBeenCalledWith('delhi', { min: 0, max: 4.5 });
  });

  it('reports healthy, degraded, and unhealthy', async () => {
    const down = async () => { throw new Error('unavailable'); };
    const healthy = await fetch(base + '/health');
    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toMatchObject({ status: 'healthy' });
    deps.health.supplierA = down;
    const degraded = await fetch(base + '/health');
    expect(degraded.status).toBe(503);
    expect(await degraded.json()).toMatchObject({ status: 'degraded', services: { supplierA: 'unhealthy' } });
    deps.health.redis = down;
    const unhealthy = await fetch(base + '/health');
    expect(unhealthy.status).toBe(503);
    expect(await unhealthy.json()).toMatchObject({ status: 'unhealthy', services: { redis: 'unhealthy' } });
  });

  it('rejects cross-origin refreshes before starting an aggregation', async () => {
    const path = base + '/api/hotels/refresh?city=delhi';
    const blocked = await fetch(path, { method: 'POST', headers: { Origin: 'https://other.example' } });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } });
    expect(deps.hotels).not.toHaveBeenCalled();
    const allowed = await fetch(path, { method: 'POST', headers: { Origin: base } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(deps.hotels).toHaveBeenCalledWith('delhi', {}, true);
  });
});

describe('supplier payload validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a valid empty feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    await expect(fetchListings('http://example.test', 'Supplier A', 'mumbai')).resolves.toEqual([]);
  });

  it('does not follow supplier redirects', async () => {
    const supplier = vi.fn(async () => Response.redirect('https://other.example'));
    vi.stubGlobal('fetch', supplier);
    await expect(fetchListings('http://example.test', 'Supplier A', 'delhi')).rejects.toBeInstanceOf(InvalidSupplierData);
    expect(supplier).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'manual' }));
  });

  it('caps supplier bodies and drops fields outside the listing schema', async () => {
    const row = listings('Supplier A', 'delhi')[0];
    const supplier = vi.fn()
      .mockResolvedValueOnce(Response.json([{ ...row, extra: 'undeclared' }]))
      .mockResolvedValueOnce(new Response(' '.repeat(256 * 1024 + 1)));
    vi.stubGlobal('fetch', supplier);
    await expect(fetchListings('http://example.test', 'Supplier A', 'delhi')).resolves.toEqual([row]);
    await expect(fetchListings('http://example.test', 'Supplier A', 'delhi')).rejects.toThrow('byte limit');
  });

  it.each([
    'not JSON',
    '{"name":"not an array"}',
    '[{"hotelId":"a1","name":"Holtin","city":"delhi","price":6000,"commissionPct":101}]',
    '[{"hotelId":"a1","name":"Holtin","city":"mumbai","price":6000,"commissionPct":10}]',
  ])('rejects invalid payload %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
    await expect(fetchListings('http://example.test', 'Supplier A', 'delhi')).rejects.toBeInstanceOf(InvalidSupplierData);
  });
});
