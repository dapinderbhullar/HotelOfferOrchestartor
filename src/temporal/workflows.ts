import { ApplicationFailure, isCancellation, proxyActivities } from '@temporalio/workflow';
import type { hotelActivities } from './activities';
import type { Aggregation, Listing, Supplier } from '../types/hotel';

const activities = proxyActivities<ReturnType<typeof hotelActivities>>({
  startToCloseTimeout: '5 seconds',
  scheduleToCloseTimeout: '20 seconds',
  retry: { maximumAttempts: 3, initialInterval: '500 milliseconds', maximumInterval: '2 seconds' },
});

type Feed = { offers: Listing[]; failed?: Supplier };

async function readFeed(supplier: Supplier, activity: Promise<Listing[]>): Promise<Feed> {
  try {
    return { offers: await activity };
  } catch (error) {
    if (isCancellation(error)) throw error;
    return { offers: [], failed: supplier };
  }
}

export async function hotelAggregationWorkflow(city: string): Promise<Aggregation> {
  const [a, b] = await Promise.all([
    readFeed('Supplier A', activities.fetchSupplierA(city)),
    readFeed('Supplier B', activities.fetchSupplierB(city)),
  ]);
  if (a.failed && b.failed) {
    throw ApplicationFailure.nonRetryable('Both hotel suppliers failed', 'SuppliersUnavailable');
  }

  const failedSuppliers = [a.failed, b.failed].filter((supplier) => supplier !== undefined);
  const offers = await activities.deduplicateOffers(a.offers, b.offers);
  const result = { offers, failedSuppliers };
  await activities.saveOffers(city, result);
  return result;
}
