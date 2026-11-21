# Hotel Offer Orchestrator interview preparation

## 1. Problem and project overview

Two suppliers may list the same hotel under different IDs and at different prices. The API combines both feeds for a city, returns one offer per normalized hotel name, preserves the winning supplier's commission, and filters prices without fetching every offer into the API process. Delhi has seven listings per supplier and ten distinct hotels. Mumbai exercises the empty-catalog path. All supplier data is local and deterministic. [Mock catalog](src/suppliers/catalog.ts)

## 2. System architecture

| Component | Responsibility |
| --- | --- |
| Express API | Validates city and price parameters, serves two mock supplier routes, reads Redis, starts or joins workflows, and reports health. |
| Temporal server | Stores workflow history and dispatches workflow and activity tasks through the configured namespace and task queue. |
| Temporal worker | Runs the workflow and activities, calls both supplier HTTP routes, selects offers, and writes Redis. |
| Redis | Stores a city snapshot and its status. Executes inclusive price range queries by sorted-set score. |
| Temporal UI | Displays execution status, workflow history, and individual activity events. |

A GET first queries Redis. A miss starts or joins an aggregation, waits for it to write the snapshot, then repeats the same bounded Redis query. A refresh POST skips the initial cache read. A normal GET can still serve an existing snapshot while a refresh runs. The client receives an array of offers and, for a partial snapshot, an HTTP warning header. [Express routes](src/app.ts) · [API composition](src/server.ts) · [Hotel service](src/services/hotels.ts)

## 3. Why Node.js and TypeScript

The API and worker spend much of their time waiting on network I/O, which suits Node's asynchronous runtime. The project uses built-in fetch and abort signals for supplier requests and the Temporal TypeScript SDK for both client and worker. Strict TypeScript makes the boundaries between supplier listings, selected offers, and aggregation status explicit. External supplier data is still validated at runtime because types are erased. [TypeScript settings](tsconfig.json) · [Domain types](src/types/hotel.ts) · [Supplier HTTP adapter](src/services/suppliers.ts)

## 4. Why Temporal

The workflow itself uses `Promise.all` for concurrency. Temporal adds execution history, task scheduling, and explicit timeout and retry policies. With promises in Express alone, a process restart loses that in-memory orchestration. With Temporal, a worker can resume a run from recorded history as long as the Temporal service retains it. The local Compose server's history is ephemeral across container recreation. Temporal also introduces extra services and a deterministic programming model. [Workflow](src/temporal/workflows.ts) · [Compose definition](docker-compose.yml)

## 5. Workflows versus activities

The workflow coordinates the calls, handles the results, and expresses the failure policy. It imports the activity implementation as a type only and calls activities through Temporal proxies. Activities perform supplier HTTP requests, run deduplication, and replace the Redis snapshot. Activity retries mean a side effect can be attempted again. Saving the same complete snapshot replaces the same keys and refreshes their expiry. [Workflow](src/temporal/workflows.ts) · [Activity implementations](src/temporal/activities.ts)

## 6. Supplier concurrency

Both proxy calls are evaluated before the workflow awaits the combined promise. Each call is wrapped independently, so a supplier error can become a labeled failure while the other supplier finishes. Cancellation propagates. The integration test compares the workflow-task completion IDs on both supplier scheduling events to verify that Temporal scheduled them in the same task. [Workflow fan-out](src/temporal/workflows.ts#L13-L28) · [Live integration test](integration/stack.test.cjs)

```ts
const [a, b] = await Promise.all([
  readFeed('Supplier A', activities.fetchSupplierA(city)),
  readFeed('Supplier B', activities.fetchSupplierB(city)),
]);
```

Each activity has a 5-second limit per attempt, a 20-second schedule-to-close budget, and at most three attempts. The HTTP adapter has a separate 2.5-second deadline. [Retry settings](src/temporal/workflows.ts#L5-L9) · [Fetch deadline](src/services/suppliers.ts#L44-L52)

## 7. Deduplication and winning offers

A map keyed by normalized name gives expected linear processing time and memory proportional to unique names. Normalization applies Unicode NFKC, trims outer whitespace, collapses internal whitespace, and lowercases the result. Supplier A is visited first. Only strictly lower prices replace a winner, so A wins cross-supplier ties and the first listing wins ties within a supplier. The code stores the winning price, display name, supplier, and commission together. [Deduplication implementation](src/services/deduplicate.ts)

```ts
const key = name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const current = best.get(key);
if (current === undefined || price < current.price) {
  best.set(key, { name: name.trim(), price, commissionPct, supplier });
}
```

Holtin demonstrates B winning at 5340 with 20% commission. Radison demonstrates A winning at 5900 with 13%. Aerocity Grand is tied at 7000 and A's 14% commission is kept. [Supplier fixtures](src/suppliers/catalog.ts)

## 8. Why Redis Sorted Sets

A sorted-set member is a serialized public offer and its score is the numeric price. This representation provides a price index and ascending price order through one command. With `N` members and `M` matches, a range costs `O(log N + M)`. Redis orders equal scores lexicographically by member, which is independent of the business tie-break used during deduplication. [Cache implementation](src/services/cache.ts)

## 9. Redis-side price filtering

The following read fetches the marker and only matching prices in one transaction. Score bounds are inclusive. An omitted minimum becomes `-inf`, and an omitted maximum becomes `+inf`. The API parses the returned members into objects. [Redis range query](src/services/cache.ts#L28-L40)

```ts
const [metadata, members] = await redis.multi()
  .get(key + ':status')
  .zRangeByScore(key, min ?? '-inf', max ?? '+inf')
  .execTyped();
```

## 10. Cache storage and TTL

`hotels:delhi` contains the sorted set. `hotels:delhi:status` contains the failed-supplier array, including `[]` for a complete result. Redis has no persistent empty sorted set, so an empty catalog is represented by its marker only. An absent marker means a cache miss. An existing marker with zero matching members means a valid empty response. One write transaction deletes the old set, adds current offers, and sets expiry on the relevant keys. Complete snapshots default to 300 seconds and partial snapshots to 30 seconds. Compose uses standalone Redis with AOF persistence and a named volume. [Cache writes](src/services/cache.ts#L43-L54) · [TTL defaults](src/config.ts#L19-L20) · [Redis service](docker-compose.yml)

## 11. Supplier failure policy

| Outcome | Workflow and HTTP behavior |
| --- | --- |
| Both succeed | Save the complete snapshot. Return HTTP 200, including an empty array for an empty catalog. |
| One fails | Save the surviving snapshot with the shorter TTL. Return HTTP 200 and identify the failed feed in `X-Hotel-Failed-Suppliers`. |
| Both fail | Fail the workflow before the cache write. The triggering request returns HTTP 503 with `AGGREGATION_UNAVAILABLE`. An existing snapshot can still be read until expiry. |

Transient supplier errors are retryable within the activity budget. Redirects, oversized responses, and invalid JSON or listing data are treated as non-retryable supplier failures. A successful empty response remains distinct from a failed request. [Activity failure mapping](src/temporal/activities.ts#L9-L24) · [Workflow outcome policy](src/temporal/workflows.ts#L22-L35) · [HTTP warning headers](src/app.ts#L45-L65)

## 12. Workflow IDs and duplicate prevention

The API shares a pending promise per city within one process. Across API instances, two starts that overlap use the same Temporal workflow ID and the `USE_EXISTING` conflict policy. `ALLOW_DUPLICATE` permits a new run after the old one closes. This prevents simultaneous runs for the same city and still allows a later refresh. Two requests separated by a run's completion can start sequential runs. [Aggregation coordinator](src/services/hotels.ts)

```ts
workflowId: 'hotel-aggregation:' + city,
workflowIdConflictPolicy: 'USE_EXISTING',
workflowIdReusePolicy: 'ALLOW_DUPLICATE',
workflowExecutionTimeout: '70 seconds',
```

## 13. Docker Compose and networking

Compose starts the API, worker, Temporal development server, Temporal UI, and Redis. The API and worker share an image but run different entry points. Containers use service DNS, including `temporal:7233`, `redis:6379`, and `api:3000`. Redis stays internal. The API, Temporal gRPC endpoint, and UI are published to host loopback only. The API's host port defaults to 3000 and can be changed without changing its internal port. Temporal, UI, and Redis build from pinned Alpine image references and apply available distribution updates. [Compose services](docker-compose.yml) · [App image](Dockerfile) · [Dependency image build](Dockerfile.dependencies)

## 14. Health checks and graceful shutdown

`GET /health` probes Redis PING, the configured Temporal namespace, and both supplier HTTP feeds in parallel. All healthy yields 200. A supplier-only failure yields 503 `degraded`, while Redis or Temporal failure yields 503 `unhealthy`. Worker execution is demonstrated through a real workflow because this endpoint does not check worker polling. On SIGINT or SIGTERM the API closes its HTTP listener and connections. Temporal's runtime handles worker signals with a 10-second grace and a 15-second force deadline. Compose gives the worker a 20-second stop window. [Health and HTTP shutdown](src/server.ts) · [Health response](src/app.ts#L67-L81) · [Worker lifecycle](src/temporal/worker.ts)

## 15. Error handling and logging

Express validates allowlisted cities and finite, non-negative price bounds before orchestration. Invalid input returns a 400 with a stable error code. Redis reads and workflow failures map to separate 503 codes. Unexpected route errors return a generic 500. Structured logs include timestamps, event names, and selected fields such as city, supplier and attempt number. Client responses contain neither internal stacks nor dependency connection details. [HTTP error handling](src/app.ts#L12-L28) · [Error middleware](src/app.ts#L83-L94) · [Dependency errors](src/services/hotels.ts) · [Logger](src/log.ts)

## 16. Security decisions and current limits

The local deployment uses loopback host bindings and an internal Redis port. API and worker run as non-root with capabilities dropped and privilege escalation disabled. Supplier URLs come from trusted configuration, the city is allowlisted, redirects are disabled, and supplier bodies are bounded and projected to defined fields. Refresh rejects a cross-origin browser `Origin` header. CLI calls can omit `Origin`, so the refresh route still needs authentication and request limits for public deployment. Add TLS and access controls before exposing the stack. Temporal history can contain validated offer data, so protect access to the service and its UI. The last image audit reported no critical findings and remaining high-severity findings in the app, Temporal, and UI images. [Supplier defenses](src/services/suppliers.ts) · [Refresh origin check](src/app.ts#L57-L65) · [Deployment notes](README.md#run-with-docker-compose)

## 17. Trade-offs and future improvements

- **Synchronous API:** a cache miss waits for orchestration. Cache hits stay cheap. A larger service could introduce asynchronous refresh or stale-while-revalidate with explicit freshness metadata.
- **Identity and currency:** normalized names are suitable for the fixture. Real feeds need stable cross-supplier hotel identity and price normalization across dates, currencies, and taxes.
- **Cache consistency:** standalone Redis transactions atomically replace the snapshot for readers. The two-key design assumes `noeviction` so Redis cannot evict the status and sorted set independently.
- **Operational scale:** monitor cache-hit rates, supplier activity latency, and worker polling. For production, make Temporal durable, introduce workflow versioning and deploy patched images on a defined cadence.

Rehearse with the [five-minute demo](DEMO_GUIDE.md), then review the [unit tests](tests/) and [Compose integration checks](integration/stack.test.cjs) for evidence you can point to during questions.
