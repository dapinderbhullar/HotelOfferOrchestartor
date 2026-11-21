import { afterEach, expect, it, vi } from 'vitest';
import { getHealth, getOffers } from './api';

afterEach(() => vi.unstubAllGlobals());

it('accepts structured health failures as health data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    status: 'degraded',
    services: { api: 'healthy', redis: 'healthy', temporal: 'healthy', supplierA: 'unhealthy', supplierB: 'healthy' },
  }, { status: 503 })));
  await expect(getHealth()).resolves.toMatchObject({ status: 'degraded', services: { supplierA: 'unhealthy' } });
});

it('preserves partial supplier metadata without altering the offers', async () => {
  const offers = [{ name: 'Holtin', price: 5340, commissionPct: 20, supplier: 'Supplier B' }];
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(offers, { headers: { 'X-Hotel-Failed-Suppliers': 'Supplier A' } })));
  await expect(getOffers({ city: 'delhi', minPrice: '', maxPrice: '' })).resolves.toEqual({ offers, failedSuppliers: ['Supplier A'] });
});

it('rejects unexpected response bodies', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ name: 'Holtin' }])));
  await expect(getOffers({ city: 'delhi', minPrice: '', maxPrice: '' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

it('uses a safe message for failures without exposing server text', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    error: { code: 'CACHE_UNAVAILABLE', message: 'Internal endpoint details' },
  }, { status: 503 })));
  await expect(getOffers({ city: 'delhi', minPrice: '', maxPrice: '' })).rejects.toMatchObject({
    code: 'CACHE_UNAVAILABLE', message: expect.stringContaining('Check Redis'),
  });
});
