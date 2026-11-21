# Five-minute technical demo

## Before the timer

From the project root in Windows PowerShell, run the commands below. The guide uses port **13000** to avoid a common local port conflict. If you use the default port 3000, substitute it in the links and set `$env:PORT = '3000'`. Use the same PowerShell session for subsequent commands.

```powershell
$env:PORT = '13000'
$base = 'http://127.0.0.1:13000'
docker compose up --build --wait
curl.exe -fsS "$base/health"
Start-Process 'http://127.0.0.1:8080'
```

Have the Temporal UI open and select the `default` namespace if needed. Keep the API and worker running. Build and install dependencies before the session if you plan to show test results. The five-minute walkthrough describes supplier failure. The optional live exercise at the end involves container restarts and is intended for rehearsal or follow-up questions.

| What to open | Exact URL on port 13000 |
| --- | --- |
| Health | [http://127.0.0.1:13000/health](http://127.0.0.1:13000/health) |
| Supplier A | [http://127.0.0.1:13000/supplierA/hotels?city=delhi](http://127.0.0.1:13000/supplierA/hotels?city=delhi) |
| Supplier B | [http://127.0.0.1:13000/supplierB/hotels?city=delhi](http://127.0.0.1:13000/supplierB/hotels?city=delhi) |
| All Delhi offers | [http://127.0.0.1:13000/api/hotels?city=delhi](http://127.0.0.1:13000/api/hotels?city=delhi) |
| Delhi price range | [http://127.0.0.1:13000/api/hotels?city=delhi&minPrice=5340&maxPrice=5900](http://127.0.0.1:13000/api/hotels?city=delhi&minPrice=5340&maxPrice=5900) |
| Reversed range | [http://127.0.0.1:13000/api/hotels?city=delhi&minPrice=5900&maxPrice=5340](http://127.0.0.1:13000/api/hotels?city=delhi&minPrice=5900&maxPrice=5340) |
| Temporal UI | [http://127.0.0.1:8080](http://127.0.0.1:8080) |

## 0:00–0:45 — Problem and architecture

**Say:** “Two suppliers can list the same hotel at different prices and commissions. This API returns one offer per hotel and lets the client filter by price. Express checks Redis first. On a miss, it starts or joins a Temporal workflow. A separate worker fetches both supplier feeds, selects offers, and writes the city snapshot.”

**Show:** The [architecture diagram](README.md#stack-and-architecture). Trace client → Express → Temporal → worker → Redis, then show Express reading Redis.

## 0:45–1:30 — Docker services and health

```powershell
docker compose ps
curl.exe -i -sS "$base/health"
```

**Say:** “Compose runs five services. The API is published on 13000 for this demo, Temporal UI on 8080, and Temporal gRPC on 7233. Redis stays on the Compose network. The health route checks Redis, the Temporal namespace, and both supplier endpoints. I'll verify the worker by showing a completed run.”

**Expect:** All five services are running. The API, Redis, and Temporal have configured container health checks. HTTP health returns 200 with this body:

```json
{"status":"healthy","services":{"api":"healthy","redis":"healthy","temporal":"healthy","supplierA":"healthy","supplierB":"healthy"}}
```

## 1:30–2:30 — Supplier feeds and aggregation

```powershell
$names = @('Holtin', 'Radison', 'Aerocity Grand')
foreach ($supplier in @('supplierA', 'supplierB')) {
    Write-Host $supplier
    $listings = Invoke-RestMethod "$base/${supplier}/hotels?city=delhi"
    $listings | Where-Object { $_.name -in $names } | Format-Table name, price, commissionPct
}
$offers = Invoke-RestMethod -Method Post "$base/api/hotels/refresh?city=delhi"
$offers.Count
$offers | Where-Object { $_.name -in $names } | Format-Table name, price, supplier, commissionPct
```

**Say:** “Each feed has seven listings. Refresh starts an aggregation even if Delhi is already cached. Holtin is cheaper from B and Radison is cheaper from A. At equal prices the first supplier wins, so Aerocity Grand keeps A's commission.”

| Hotel | Supplier A price / commission | Supplier B price / commission | Expected winner |
| --- | --- | --- | --- |
| Holtin | 6000 / 10% | 5340 / 20% | B at 5340 with 20% |
| Radison | 5900 / 13% | 6400 / 16% | A at 5900 with 13% |
| Aerocity Grand | 7000 / 14% | 7000 / 19% | A at 7000 with 14% |

**Expect:** HTTP 200, ten unique offers. Keep the latest completed Delhi run available for the UI section.

## 2:30–3:30 — Temporal workflow

**Show:** Open [Temporal UI](http://127.0.0.1:8080), choose the `default` namespace, and search for `hotel-aggregation:delhi`. If the list needs a visibility filter, use `WorkflowId = "hotel-aggregation:delhi"`. Open the latest completed `hotelAggregationWorkflow` run and show its History or Events view.

1. Find the activity-scheduled events for `fetchSupplierA` and `fetchSupplierB`. Both come from the same workflow task. Their completion order can vary.
2. Show `deduplicateOffers`, then `saveOffers`, then workflow completion.
3. Point out the stable workflow ID and the distinct run ID. Keep the latest run selected for the cache-hit comparison.

**Say:** “Both fetches are scheduled before the workflow awaits them. Temporal records execution history and gives each activity its own retry budget. Concurrent starts for the same city can share the active run. A later refresh can create a new run after the first closes.”

## 3:30–4:15 — Redis price filtering

```powershell
docker compose exec -T redis redis-cli TYPE hotels:delhi
docker compose exec -T redis redis-cli ZCARD hotels:delhi
docker compose exec -T redis redis-cli ZRANGEBYSCORE hotels:delhi 5340 5900 WITHSCORES
curl.exe -fsS "$base/api/hotels?city=delhi&minPrice=5340&maxPrice=5900"
```

**Expect:** Redis reports `zset`, then `10`, then the JSON members and scores `5340` and `5900`. The API returns:

```json
[
  {"name":"Holtin","price":5340,"supplier":"Supplier B","commissionPct":20},
  {"name":"Radison","price":5900,"supplier":"Supplier A","commissionPct":13}
]
```

**Say:** “The offer is the member and price is the score. Redis applies the range inclusively. While this snapshot is cached, this query does not launch another workflow.” Refresh the Temporal workflow list if there is time and show that the latest Delhi run ID is unchanged.

## 4:15–5:00 — Error handling and conclusion

```powershell
curl.exe -i -sS "$base/api/hotels?city=delhi&minPrice=5900&maxPrice=5340"
```

**Expect:** HTTP 400 and:

```json
{"error":{"code":"INVALID_PRICE_RANGE","message":"minPrice must be less than or equal to maxPrice."}}
```

**Say:** “Invalid filters are rejected before orchestration. If one feed fails after its retry budget, the API returns the surviving offers, identifies the failed supplier in `X-Hotel-Failed-Suppliers`, and caches that partial result for 30 seconds by default. Health reports 503 degraded. If both feeds fail, the refresh returns 503 and the workflow leaves the existing cache snapshot alone. This is a local-development stack. A public deployment needs authentication, TLS, and durable Temporal infrastructure.”

## Optional live supplier-outage exercise

Use this after the timed demo. It temporarily points the API and worker at a closed port for Supplier A. Run it from the same PowerShell session with `$base` and `$env:PORT` set. Use the default supplier configuration before starting the exercise.

```powershell
try {
    $env:DOCKER_SUPPLIER_A_URL = 'http://api:9'
    docker compose up -d --no-build --no-deps api worker
    if ($LASTEXITCODE -ne 0) { throw 'Compose could not start the outage scenario.' }
    curl.exe -fsS --retry 10 --retry-all-errors --retry-delay 1 --max-time 3 --retry-max-time 15 -o NUL "$base/supplierB/hotels?city=delhi"
    if ($LASTEXITCODE -ne 0) { throw 'Supplier B did not become reachable.' }
    curl.exe -i -sS "$base/health"
    curl.exe -i -sS -X POST "$base/api/hotels/refresh?city=delhi"
} finally {
    Remove-Item Env:DOCKER_SUPPLIER_A_URL -ErrorAction SilentlyContinue
    docker compose up --no-build --wait
    if ($LASTEXITCODE -eq 0) {
        curl.exe -fsS -X POST "$base/api/hotels/refresh?city=delhi"
        curl.exe -fsS "$base/health"
    }
}
```

**Expect during the exercise:** health gives 503 with `status: degraded`, `supplierA: unhealthy`, and `supplierB: healthy`. Refresh gives 200 with `X-Hotel-Failed-Suppliers: Supplier A` and seven Supplier B offers. The final health call should return 200, and the final refresh should return ten offers.

For a repeatable rehearsal, run `npm.cmd ci`, `npm.cmd test`, and `npm.cmd run test:integration` from the project root with Compose running and the same host port configured.
