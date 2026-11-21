export type Supplier = 'Supplier A' | 'Supplier B';

export interface Listing {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface Offer {
  name: string;
  price: number;
  supplier: Supplier;
  commissionPct: number;
}

export interface Aggregation {
  offers: Offer[];
  failedSuppliers: Supplier[];
}

export interface PriceRange {
  min?: number;
  max?: number;
}
