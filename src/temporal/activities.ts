import { ApplicationFailure, Context } from '@temporalio/activity';
import { config } from '../config';
import { errorKind, log } from '../log';
import type { HotelCache } from '../services/cache';
import { selectBestOffers } from '../services/deduplicate';
import { fetchListings, InvalidSupplierData } from '../services/suppliers';
import type { Aggregation, Listing, Supplier } from '../types/hotel';

export function hotelActivities(cache: HotelCache) {
  async function fetchOffers(url: string, supplier: Supplier, city: string) {
    const { info, cancellationSignal } = Context.current();
    try {
      const rows = await fetchListings(url, supplier, city, cancellationSignal);
      log('info', 'supplier.fetched', { city, supplier, count: rows.length, attempt: info.attempt });
      return rows;
    } catch (error) {
      log('error', 'supplier.failed', { city, supplier, attempt: info.attempt, error: errorKind(error) });
      if (error instanceof InvalidSupplierData) {
        throw ApplicationFailure.nonRetryable(error.message, 'InvalidSupplierData');
      }
      // Activity failures are recorded in history. Network errors can contain URLs.
      if (cancellationSignal.aborted) throw cancellationSignal.reason;
      throw ApplicationFailure.retryable('Supplier request failed', 'SupplierUnavailable');
    }
  }

  return {
    fetchSupplierA: (city: string) => fetchOffers(config.supplierAUrl, 'Supplier A', city),
    fetchSupplierB: (city: string) => fetchOffers(config.supplierBUrl, 'Supplier B', city),
    async deduplicateOffers(a: Listing[], b: Listing[]) {
      return selectBestOffers(a, b);
    },
    async saveOffers(city: string, result: Aggregation) {
      try {
        await cache.save(city, result);
        log('info', 'cache.saved', { city, count: result.offers.length, failedSuppliers: result.failedSuppliers });
      } catch (error) {
        log('error', 'cache.write_failed', { city, error: errorKind(error) });
        throw ApplicationFailure.retryable('Redis cache write failed', 'CacheWriteFailed');
      }
    },
  };
}
