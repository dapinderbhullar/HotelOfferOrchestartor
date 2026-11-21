import type { Listing, Supplier } from '../types/hotel';

const delhi: Record<Supplier, readonly (readonly [string, number, number])[]> = {
  'Supplier A': [
    ['Holtin', 6000, 10], ['Radison', 5900, 13], ['Lodhi Garden Suites', 8500, 12],
    ['Aerocity Grand', 7000, 14], ['Chandni Courtyard', 3800, 8],
    ['Connaught Residency', 4900, 11], ['Saket Park Hotel', 4400, 9],
  ],
  'Supplier B': [
    ['Holtin', 5340, 20], ['Radison', 6400, 16], ['Lodhi Garden Suites', 8100, 17],
    ['Aerocity Grand', 7000, 19], ['Lotus Temple Inn', 4000, 15],
    ['Yamuna Riverside Hotel', 7200, 18], ['Mehrauli Heritage House', 6800, 12],
  ],
};

export const supportedCities = new Set(['delhi', 'mumbai']);

export function listings(supplier: Supplier, city: string): Listing[] {
  if (city !== 'delhi') return [];
  const prefix = supplier === 'Supplier A' ? 'a' : 'b';
  return delhi[supplier].map(([name, price, commissionPct], index) => ({
    hotelId: prefix + (index + 1), name, price, city, commissionPct,
  }));
}
