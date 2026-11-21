import { Client } from '@temporalio/client';
import { config } from '../config';
import { errorKind, log } from '../log';
import type { Aggregation, PriceRange } from '../types/hotel';
import type { hotelAggregationWorkflow } from '../temporal/workflows';
import type { HotelCache } from './cache';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function temporalAggregation(client: Client) {
  return async (city: string): Promise<Aggregation> => {
    try {
      const handle = await client.connection.withDeadline(Date.now() + 5000, () =>
        client.workflow.start<typeof hotelAggregationWorkflow>('hotelAggregationWorkflow', {
          args: [city],
          taskQueue: config.taskQueue,
          workflowId: 'hotel-aggregation:' + city,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
          workflowExecutionTimeout: '70 seconds',
        }));
      return await client.connection.withDeadline(Date.now() + 75000, () => handle.result());
    } catch (error) {
      log('error', 'aggregation.failed', { city, error: errorKind(error) });
      throw new ApiError(503, 'AGGREGATION_UNAVAILABLE', 'Hotel aggregation is temporarily unavailable.');
    }
  };
}

export function hotelService(cache: HotelCache, aggregate: (city: string) => Promise<Aggregation>) {
  const pending = new Map<string, Promise<Aggregation>>();
  async function read(city: string, range: PriceRange) {
    try {
      return await cache.read(city, range);
    } catch (error) {
      log('error', 'cache.read_failed', { city, error: errorKind(error) });
      throw new ApiError(503, 'CACHE_UNAVAILABLE', 'Hotel cache is temporarily unavailable.');
    }
  }

  return async (city: string, range: PriceRange, refresh = false) => {
    if (!refresh) {
      const cached = await read(city, range);
      if (cached) return cached;
    }
    let run = pending.get(city);
    if (!run) {
      run = aggregate(city).finally(() => pending.delete(city));
      pending.set(city, run);
    }
    await run;

    const cached = await read(city, range);
    if (!cached) throw new ApiError(503, 'CACHE_UNAVAILABLE', 'Aggregated hotel data is temporarily unavailable.');
    return cached;
  };
}
