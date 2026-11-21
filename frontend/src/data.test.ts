import { describe, expect, it } from 'vitest';
import { searchParams } from './api';
import { distribution, summarize, validateSearch } from './data';
import type { Offer } from './types';

const offers: Offer[] = [
  { name: 'A', price: 3800, supplier: 'Supplier A', commissionPct: 8 },
  { name: 'B', price: 4000, supplier: 'Supplier B', commissionPct: 15 },
  { name: 'C', price: 8100, supplier: 'Supplier B', commissionPct: 17 },
];

describe('search utility', () => {
  it.each([
    [{ city: '', minPrice: '', maxPrice: '' }, 'Enter a city'],
    [{ city: 'delhi', minPrice: '-1', maxPrice: '' }, 'non-negative'],
    [{ city: 'delhi', minPrice: '12', maxPrice: '0' }, 'cannot exceed'],
  ])('rejects invalid searches %j', (search, message) => {
    expect(validateSearch(search)).toContain(message);
  });

  it('includes a zero bound and omits absent bounds', () => {
    const search = { city: 'delhi', minPrice: '', maxPrice: '0' };
    expect(validateSearch(search)).toBe('');
    expect(searchParams(search).toString()).toBe('city=delhi&maxPrice=0');
  });
});

describe('snapshot analytics', () => {
  it('calculates metrics from the returned offers', () => {
    expect(summarize(offers)).toEqual({ min: 3800, max: 8100, average: 5300, suppliers: 2 });
    expect(summarize([])).toBeNull();
  });

  it('counts every price once, including equal and boundary prices', () => {
    expect(distribution(offers).reduce((sum, band) => sum + band.count, 0)).toBe(3);
    expect(distribution([offers[0], offers[0]])).toHaveLength(1);
    expect(distribution([offers[0], offers[0]])[0].count).toBe(2);
  });
});
