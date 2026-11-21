import type { Offer, Search } from './types';

const currency = import.meta.env.VITE_DISPLAY_CURRENCY || 'INR';
function priceFormatter() {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 });
  } catch {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }
}
const formatter = priceFormatter();
export const money = (price: number) => formatter.format(price);
export const currencyCode = formatter.resolvedOptions().currency;
export const cityName = (city: string) => city ? city[0].toUpperCase() + city.slice(1) : '';

export function validateSearch(search: Search) {
  if (!search.city.trim()) return 'Enter a city to find hotel offers.';
  for (const price of [search.minPrice, search.maxPrice]) {
    if (price && (!/^\d+(?:\.\d+)?$/.test(price) || !Number.isFinite(Number(price)))) {
      return 'Enter valid, non-negative prices.';
    }
  }
  if (search.minPrice && search.maxPrice && Number(search.minPrice) > Number(search.maxPrice)) {
    return 'Minimum price cannot exceed maximum price.';
  }
  return '';
}

export function summarize(offers: Offer[]) {
  if (!offers.length) return null;
  return {
    min: Math.min(...offers.map(({ price }) => price)),
    max: Math.max(...offers.map(({ price }) => price)),
    average: offers.reduce((sum, { price }) => sum + price, 0) / offers.length,
    suppliers: new Set(offers.map(({ supplier }) => supplier)).size,
  };
}

export function distribution(offers: Offer[]) {
  const stats = summarize(offers);
  if (!stats) return [];
  const width = Math.max(1, Math.ceil((stats.max - stats.min + 1) / 5));
  const count = stats.max === stats.min ? 1 : 5;
  const buckets = Array.from({ length: count }, (_, index) => {
    const start = stats.min + index * width;
    const end = stats.min + (index + 1) * width;
    return { label: stats.max === stats.min ? money(start) : money(start) + '–<' + money(end), count: 0 };
  });
  for (const offer of offers) buckets[Math.floor((offer.price - stats.min) / width)].count++;
  return buckets;
}
