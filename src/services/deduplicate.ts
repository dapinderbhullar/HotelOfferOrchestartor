import type { Listing, Offer } from '../types/hotel';

export function selectBestOffers(a: Listing[], b: Listing[]): Offer[] {
  const best = new Map<string, Offer>();
  // Iterating A first gives it priority at equal prices. Within a feed, first wins.
  for (const [supplier, hotels] of [['Supplier A', a], ['Supplier B', b]] as const) {
    for (const { name, price, commissionPct } of hotels) {
      const key = name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
      const current = best.get(key);
      if (current === undefined || price < current.price) {
        best.set(key, { name: name.trim(), price, commissionPct, supplier });
      }
    }
  }
  return [...best.values()];
}
