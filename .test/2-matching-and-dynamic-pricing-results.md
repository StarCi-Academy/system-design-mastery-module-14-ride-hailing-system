# Lesson 2 — Matching and Dynamic Pricing — e2e results

Stack: `docker compose up -d` (image: `starciacademy/system-design-matching-and-dynamic-pricing-api:latest`, port 3018; redis exposed on 6397).

## T1 — Quote at seeded location
`GET /api/match/quote?lat=10.762622&lng=106.660172` → PASS
- `h3Index = 8965b566e87ffff`, `demand = 1`, `supply = 3`, `surgeMultiplier = 1`
- `googleDirectionsUsed = false`

## T2 — Match request (driver in 500m ring)
`POST /api/match/request {"clientId":"client_1","lat":10.762622,"lng":106.660172,"distanceKm":3.5}` → PASS
- Matched `drv_88` at 71m in `ringMeters=500` (first ring)
- Fare = 22000 + 29750 = `estimatedFare = 51750` at surge 1

## T3 — Expanding ring (empty 500m, hits at 2km)
`POST /api/match/request {"clientId":"client_2","lat":10.78,"lng":106.66,"distanceKm":2.0}` → PASS
- Skipped 500m, 1000m rings; matched `drv_51` at 1442m in `ringMeters=2000`
- Confirms expanding-radius strategy works

## T4 — Surge buildup (5 quotes same cell)
`GET /api/match/quote?lat=10.762622&lng=106.660172` ×5 → PASS
- `surgeMultiplier` sequence: 1.33 → 1.67 → 2 → 2.33 → 2.67
- Demand counter increments per request on Redis key `demand:<h3Index>`

Teardown: `docker compose down -v` — OK.
