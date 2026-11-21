import { beforeEach, expect, it, vi } from 'vitest';

const activities = vi.hoisted(() => ({
  fetchSupplierA: vi.fn(),
  fetchSupplierB: vi.fn(),
  deduplicateOffers: vi.fn(),
  saveOffers: vi.fn(),
}));
vi.mock('@temporalio/workflow', async (importOriginal) => ({
  ...await importOriginal<typeof import('@temporalio/workflow')>(),
  proxyActivities: () => activities,
}));

import { hotelAggregationWorkflow } from '../src/temporal/workflows';

beforeEach(() => {
  vi.resetAllMocks();
  activities.fetchSupplierA.mockResolvedValue([]);
  activities.fetchSupplierB.mockResolvedValue([]);
  activities.deduplicateOffers.mockReturnValue([]);
});

it('dispatches both activities before waiting and caches a valid empty result', async () => {
  let release!: (offers: []) => void;
  activities.fetchSupplierA.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  const run = hotelAggregationWorkflow('mumbai');
  expect(activities.fetchSupplierA).toHaveBeenCalledWith('mumbai');
  expect(activities.fetchSupplierB).toHaveBeenCalledWith('mumbai');
  expect(activities.deduplicateOffers).not.toHaveBeenCalled();
  release([]);
  const result = { offers: [], failedSuppliers: [] };
  expect(await run).toEqual(result);
  expect(activities.saveOffers).toHaveBeenCalledWith('mumbai', result);
});

it('labels and persists partial results when one supplier fails', async () => {
  const good = [{ name: 'Holtin' }];
  const offers = [{ name: 'Holtin', supplier: 'Supplier B' }];
  activities.fetchSupplierA.mockRejectedValue(new Error('outage'));
  activities.fetchSupplierB.mockResolvedValue(good);
  activities.deduplicateOffers.mockReturnValue(offers);
  const result = await hotelAggregationWorkflow('delhi');
  expect(result).toEqual({ offers, failedSuppliers: ['Supplier A'] });
  expect(activities.deduplicateOffers).toHaveBeenCalledWith([], good);
  expect(activities.saveOffers).toHaveBeenCalledWith('delhi', result);
});

it('fails without replacing the cache when both suppliers fail', async () => {
  activities.fetchSupplierA.mockRejectedValue(new Error('outage'));
  activities.fetchSupplierB.mockRejectedValue(new Error('outage'));
  await expect(hotelAggregationWorkflow('delhi')).rejects.toMatchObject({ type: 'SuppliersUnavailable' });
  expect(activities.saveOffers).not.toHaveBeenCalled();
});
