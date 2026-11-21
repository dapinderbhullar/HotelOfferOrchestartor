import { queryOptions } from '@tanstack/react-query';
import { getHealth, getOffers } from './api';
import type { Search } from './types';

export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: ({ signal }) => getHealth(signal),
  refetchInterval: 30_000,
  staleTime: 10_000,
});

export const offerKey = (search: Search) => ['offers', search.city, search.minPrice, search.maxPrice] as const;
export const offersQuery = (search: Search, enabled: boolean) => queryOptions({
  queryKey: offerKey(search),
  queryFn: ({ signal }) => getOffers(search, signal),
  enabled,
  staleTime: 20_000,
});
