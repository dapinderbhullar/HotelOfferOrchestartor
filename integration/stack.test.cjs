const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { Client, Connection } = require('@temporalio/client');

const api = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:' + (process.env.PORT ?? '3000');
const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';

async function request(path, method = 'GET') {
  const response = await fetch(api + path, { method, signal: AbortSignal.timeout(80000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Hotel-Failed-Suppliers'), null);
  return response.json();
}

function redis(...args) {
  return execFileSync('docker', ['compose', 'exec', '-T', 'redis', 'redis-cli', ...args], { encoding: 'utf8' }).trim();
}

function scoreQueryCount() {
  return Number(redis('INFO', 'commandstats').match(/cmdstat_zrangebyscore:calls=(\d+)/)?.[1] ?? 0);
}

test('Redis replaces complete and partial snapshots, expires both keys, and distinguishes empty snapshots', () => {
  execFileSync('docker', ['compose', 'exec', '-T', 'api', 'node'], {
    timeout: 15000,
    input: `
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createRedis, hotelCache } = require('./dist/services/cache');
const city = 'integration-' + randomUUID();
const key = 'hotels:' + city;
const redis = createRedis();
(async () => {
  await redis.connect();
  try {
    const cache = hotelCache(redis, 30, 2);
    const a = { name: 'Hotel A', supplier: 'Supplier A', price: 10, commissionPct: 12 };
    const b = { name: 'Hotel B', supplier: 'Supplier B', price: 20, commissionPct: 15 };
    await cache.save(city, { offers: [a, b], failedSuppliers: [] });
    assert.ok(await redis.pTTL(key) > 20000);
    assert.ok(await redis.pTTL(key + ':status') > 20000);
    const partial = { offers: [b], failedSuppliers: ['Supplier A'] };
    await cache.save(city, partial);
    assert.deepEqual(await cache.read(city, {}), partial);
    assert.equal(await redis.zCard(key), 1);
    const partialTtl = await redis.pTTL(key);
    assert.ok(partialTtl > 0 && partialTtl <= 2000);
    await delay(2100);
    assert.equal(await cache.read(city, {}), null);
    assert.equal(await redis.exists([key, key + ':status']), 0);
    const empty = { offers: [], failedSuppliers: [] };
    await cache.save(city, empty);
    assert.deepEqual(await cache.read(city, {}), empty);
    assert.equal(await redis.exists(key), 0);
  } finally {
    await redis.del([key, key + ':status']);
    redis.destroy();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
`,
  });
});

test('Compose serves best offers through Temporal and filters cache hits with Redis', { timeout: 115000 }, async () => {
  const health = await request('/health');
  assert.equal(health.status, 'healthy');
  assert.equal(Object.values(health.services).filter((status) => status === 'healthy').length, 5);
  assert.equal((await request('/supplierA/hotels?city=delhi')).length, 7);
  assert.equal((await request('/supplierB/hotels?city=delhi')).length, 7);
  const ui = await fetch('http://127.0.0.1:8080', { signal: AbortSignal.timeout(5000) });
  assert.equal(ui.status, 200);
  await ui.text();

  const connection = await Connection.connect({ address: process.env.TEST_TEMPORAL_ADDRESS ?? '127.0.0.1:7233' });
  try {
    const client = new Client({ connection, namespace });
    const handle = client.workflow.getHandle('hotel-aggregation:delhi');
    const offers = await request('/api/hotels/refresh?city=delhi', 'POST');
    assert.equal(offers.length, 10);
    for (const [name, price, supplier, commissionPct] of [
      ['Holtin', 5340, 'Supplier B', 20],
      ['Radison', 5900, 'Supplier A', 13],
      ['Aerocity Grand', 7000, 'Supplier A', 14],
    ]) {
      assert.deepEqual(offers.find((offer) => offer.name === name), { name, price, supplier, commissionPct });
    }

    const { runId } = await handle.describe();
    const events = (await handle.fetchHistory()).events;
    const supplierEvents = events.filter((event) =>
      /^fetchSupplier[AB]$/.test(event.activityTaskScheduledEventAttributes?.activityType?.name ?? ''));
    assert.equal(supplierEvents.length, 2);
    assert.equal(String(supplierEvents[0].activityTaskScheduledEventAttributes.workflowTaskCompletedEventId),
      String(supplierEvents[1].activityTaskScheduledEventAttributes.workflowTaskCompletedEventId));
    assert.equal(redis('TYPE', 'hotels:delhi'), 'zset');
    assert.equal(redis('ZCARD', 'hotels:delhi'), '10');
    const before = scoreQueryCount();

    assert.deepEqual(await request('/api/hotels?city=delhi'), offers);
    assert.deepEqual((await request('/api/hotels?city=delhi&minPrice=8100')).map((offer) => offer.price), [8100]);
    assert.deepEqual((await request('/api/hotels?city=delhi&maxPrice=3800')).map((offer) => offer.price), [3800]);
    assert.deepEqual((await request('/api/hotels?city=delhi&minPrice=5340&maxPrice=5900')).map((offer) => offer.price), [5340, 5900]);
    assert.deepEqual(await request('/api/hotels?city=delhi&minPrice=99999'), []);
    assert.ok(scoreQueryCount() >= before + 5, 'Redis should execute each score query');
    assert.equal((await handle.describe()).runId, runId);

    // Redis can retain an empty snapshot across recreation of the Temporal dev server.
    assert.deepEqual(await request('/api/hotels/refresh?city=mumbai', 'POST'), []);
    assert.equal(redis('GET', 'hotels:mumbai:status'), '[]');
    const empty = client.workflow.getHandle('hotel-aggregation:mumbai');
    const emptyRun = (await empty.describe()).runId;
    assert.deepEqual(await request('/api/hotels?city=mumbai&maxPrice=0'), []);
    assert.equal((await empty.describe()).runId, emptyRun);
  } finally {
    await connection.close();
  }
});
