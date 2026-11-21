import { serviceNames, type Health, type Offer, type OfferResult, type Search, type Supplier } from './types';

const base = (import.meta.env.VITE_API_BASE_URL || '/gateway').replace(/\/$/, '');
export const temporalUrl = import.meta.env.VITE_TEMPORAL_UI_URL || undefined;

export class ApiError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

const errorMessages: Record<string, string> = {
  CITY_REQUIRED: 'Enter a city to find hotel offers.',
  UNSUPPORTED_CITY: 'This city is unavailable. Try Delhi or Mumbai.',
  INVALID_PRICE: 'Enter finite, non-negative prices.',
  INVALID_PRICE_RANGE: 'Minimum price cannot exceed maximum price.',
  CACHE_UNAVAILABLE: 'The offer cache is unavailable. Check Redis in System Health.',
  AGGREGATION_UNAVAILABLE: 'Offers could not be aggregated. Check Temporal and the suppliers in System Health.',
  ORIGIN_NOT_ALLOWED: 'This dashboard origin is not authorized to refresh offers. Check the API deployment configuration.',
};

const validSupplier = (value: unknown): value is Supplier => value === 'Supplier A' || value === 'Supplier B';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const invalidResponse = () => new ApiError('The backend returned an unexpected response. Try again or check System Health.', 'INVALID_RESPONSE');

function isOffer(value: unknown): value is Offer {
  return record(value) && typeof value.name === 'string'
    && validNumber(value.price) && value.price >= 0
    && validSupplier(value.supplier) && validNumber(value.commissionPct)
    && value.commissionPct >= 0 && value.commissionPct <= 100;
}

async function request(path: string, signal?: AbortSignal, method = 'GET', health = false) {
  const deadline = AbortSignal.timeout(health ? 7000 : 82000);
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(base + path, {
      method,
      headers: { Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) payload = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (deadline.aborted) throw new ApiError('The request timed out. Try again.', 'TIMEOUT');
    if (error instanceof SyntaxError) throw invalidResponse();
    throw new ApiError('Could not reach the backend. Check the API URL and service status.', 'NETWORK');
  }
  if (!response.ok && !(health && response.status === 503 && payload !== undefined)) {
    const details = record(payload) && record(payload.error) ? payload.error : null;
    const code = details && typeof details.code === 'string' ? details.code : 'HTTP_ERROR';
    throw new ApiError(Object.hasOwn(errorMessages, code) ? errorMessages[code] :
      response.status >= 500 ? 'The backend is unavailable. Try again or check System Health.' : 'The request could not be completed.', code);
  }
  return { response, payload };
}

export function searchParams(search: Search) {
  const params = new URLSearchParams({ city: search.city });
  if (search.minPrice) params.set('minPrice', search.minPrice);
  if (search.maxPrice) params.set('maxPrice', search.maxPrice);
  return params;
}

async function parseOffers(path: string, signal?: AbortSignal, method?: string): Promise<OfferResult> {
  const { response, payload } = await request(path, signal, method);
  if (!Array.isArray(payload) || !payload.every(isOffer)) throw invalidResponse();
  const failedSuppliers = (response.headers.get('X-Hotel-Failed-Suppliers') ?? '').split(',').map((part) => part.trim()).filter(validSupplier);
  return { offers: payload, failedSuppliers };
}

export const getOffers = (search: Search, signal?: AbortSignal) =>
  parseOffers('/api/hotels?' + searchParams(search), signal);
export const refreshOffers = (city: string) =>
  parseOffers('/api/hotels/refresh?' + new URLSearchParams({ city }), undefined, 'POST');

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const { payload } = await request('/health', signal, 'GET', true);
  if (!record(payload) || !['healthy', 'degraded', 'unhealthy'].includes(String(payload.status))) throw invalidResponse();
  const services = payload.services;
  if (!record(services) || !serviceNames.every((key) => services[key] === 'healthy' || services[key] === 'unhealthy')) {
    throw invalidResponse();
  }
  return { status: payload.status, services } as Health;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
