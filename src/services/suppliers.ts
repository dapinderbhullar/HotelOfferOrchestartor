import type { Listing, Supplier } from '../types/hotel';

export class InvalidSupplierData extends Error {}

const maxResponseBytes = 256 * 1024;

async function readSupplierJson(response: Response): Promise<unknown> {
  if (!response.body) throw new InvalidSupplierData('Missing supplier response body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) {
        await reader.cancel().catch(() => {});
        throw new InvalidSupplierData('Supplier response exceeds the byte limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')) as unknown;
  } catch {
    throw new InvalidSupplierData('Invalid supplier JSON');
  }
}

function isListing(value: unknown, city: string): value is Listing {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.hotelId === 'string' && Boolean(row.hotelId.trim())
    && typeof row.name === 'string' && Boolean(row.name.trim())
    && row.city === city
    && typeof row.price === 'number' && Number.isFinite(row.price) && row.price >= 0
    && typeof row.commissionPct === 'number' && Number.isFinite(row.commissionPct)
    && row.commissionPct >= 0 && row.commissionPct <= 100;
}

export async function fetchListings(baseUrl: string, supplier: Supplier, city: string, signal?: AbortSignal): Promise<Listing[]> {
  const path = supplier === 'Supplier A' ? '/supplierA/hotels' : '/supplierB/hotels';
  const url = new URL(path, baseUrl);
  url.searchParams.set('city', city);
  const timeout = AbortSignal.timeout(2500);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) {
      throw new InvalidSupplierData('Supplier redirects are disabled');
    }
    throw new Error('Supplier HTTP status ' + response.status);
  }
  const data = await readSupplierJson(response);
  if (!Array.isArray(data) || !data.every((row: unknown) => isListing(row, city))) {
    throw new InvalidSupplierData('Invalid supplier listing schema');
  }
  return data.map(({ hotelId, name, price, city, commissionPct }: Listing) =>
    ({ hotelId, name, price, city, commissionPct }));
}
