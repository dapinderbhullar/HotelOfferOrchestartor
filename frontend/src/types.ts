export type Supplier = 'Supplier A' | 'Supplier B';
export interface Offer {
  name: string;
  price: number;
  supplier: Supplier;
  commissionPct: number;
}
export interface OfferResult {
  offers: Offer[];
  failedSuppliers: Supplier[];
}
export interface Search {
  city: string;
  minPrice: string;
  maxPrice: string;
}
export const serviceNames = ['api', 'redis', 'temporal', 'supplierA', 'supplierB'] as const;
export type Service = typeof serviceNames[number];
export interface Health {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<Service, 'healthy' | 'unhealthy'>;
}
