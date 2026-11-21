import express, { type ErrorRequestHandler } from 'express';
import { ApiError } from './services/hotels';
import { listings, supportedCities } from './suppliers/catalog';
import { errorKind, log } from './log';
import type { Aggregation, PriceRange } from './types/hotel';

export interface Dependencies {
  hotels(city: string, range: PriceRange, refresh?: boolean): Promise<Aggregation>;
  health: Record<'redis' | 'temporal' | 'supplierA' | 'supplierB', () => Promise<unknown>>;
}

function cityParameter(value: unknown) {
  if (value === undefined || (typeof value === 'string' && !value.trim())) {
    throw new ApiError(400, 'CITY_REQUIRED', 'The city parameter is required.');
  }
  if (typeof value !== 'string' || !supportedCities.has(value.trim().toLowerCase())) {
    throw new ApiError(400, 'UNSUPPORTED_CITY', 'Supported cities are delhi and mumbai.');
  }
  return value.trim().toLowerCase();
}

function priceParameter(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
    throw new ApiError(400, 'INVALID_PRICE', name + ' must be a finite non-negative decimal.');
  }
  return Number(value);
}

export function createApp(deps: Dependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  for (const [path, supplier] of [['supplierA', 'Supplier A'], ['supplierB', 'Supplier B']] as const) {
    app.get('/' + path + '/hotels', (req, res) => {
      res.json(listings(supplier, cityParameter(req.query.city)));
    });
  }

  app.get('/api/hotels', async (req, res) => {
    const city = cityParameter(req.query.city);
    const min = priceParameter(req.query.minPrice, 'minPrice');
    const max = priceParameter(req.query.maxPrice, 'maxPrice');
    if (min !== undefined && max !== undefined && min > max) {
      throw new ApiError(400, 'INVALID_PRICE_RANGE', 'minPrice must be less than or equal to maxPrice.');
    }
    const result = await deps.hotels(city, { min, max });
    if (result.failedSuppliers.length) res.set('X-Hotel-Failed-Suppliers', result.failedSuppliers.join(', '));
    res.json(result.offers);
  });

  app.post('/api/hotels/refresh', async (req, res) => {
    const origin = req.get('origin');
    if (origin !== undefined && origin !== req.protocol + '://' + req.get('host')) {
      throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Refresh requires a same-origin browser request.');
    }
    const result = await deps.hotels(cityParameter(req.query.city), {}, true);
    if (result.failedSuppliers.length) res.set('X-Hotel-Failed-Suppliers', result.failedSuppliers.join(', '));
    res.json(result.offers);
  });

  app.get('/health', async (_req, res) => {
    const checks = await Promise.all(Object.entries(deps.health).map(async ([name, check]) => {
      try {
        await check();
        return [name, 'healthy'] as const;
      } catch {
        return [name, 'unhealthy'] as const;
      }
    }));
    const services: Record<string, string> = { api: 'healthy', ...Object.fromEntries(checks) };
    const status = services.redis === 'unhealthy' || services.temporal === 'unhealthy'
      ? 'unhealthy'
      : Object.values(services).includes('unhealthy') ? 'degraded' : 'healthy';
    res.status(status === 'healthy' ? 200 : 503).json({ status, services });
  });

  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')));
  const errors: ErrorRequestHandler = (error: unknown, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    log('error', 'http.unexpected', { method: req.method, error: errorKind(error) });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  };
  app.use(errors);
  return app;
}
