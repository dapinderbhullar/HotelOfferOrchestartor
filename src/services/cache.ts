import { createClient } from 'redis';
import { config } from '../config';
import { errorKind, log } from '../log';
import type { Aggregation, Offer, PriceRange, Supplier } from '../types/hotel';

export function createRedis() {
  const client = createClient({
    url: config.redisUrl,
    disableOfflineQueue: true,
    pingInterval: 1500,
    socket: {
      connectTimeout: 3000,
      socketTimeout: 3000,
      reconnectStrategy: (attempt) => Math.min(200 * (attempt + 1), 2000),
    },
  });
  client.on('error', (error) => log('error', 'redis.connection', { error: errorKind(error) }));
  return client;
}

type Redis = ReturnType<typeof createRedis>;

export interface HotelCache {
  read(city: string, range: PriceRange): Promise<Aggregation | null>;
  save(city: string, result: Aggregation): Promise<void>;
}

export function hotelCache(redis: Redis, ttl = config.cacheTtl, partialTtl = config.partialTtl): HotelCache {
  return {
    async read(city, { min, max }) {
      const key = 'hotels:' + city;
      const [metadata, members] = await redis.multi()
        .get(key + ':status')
        .zRangeByScore(key, min ?? '-inf', max ?? '+inf')
        .execTyped();
      if (metadata === null) return null;
      return {
        failedSuppliers: JSON.parse(metadata) as Supplier[],
        offers: members.map((member) => JSON.parse(member) as Offer),
      };
    },

    async save(city, result) {
      const key = 'hotels:' + city;
      const lifetime = result.failedSuppliers.length ? partialTtl : ttl;
      const transaction = redis.multi().del(key);
      if (result.offers.length) {
        transaction.zAdd(key, result.offers.map((offer) => ({
          score: offer.price, value: JSON.stringify(offer),
        }))).expire(key, lifetime);
      }
      // The marker distinguishes an empty successful dataset from a cache miss.
      await transaction.set(key + ':status', JSON.stringify(result.failedSuppliers), { EX: lifetime }).exec();
    },
  };
}
