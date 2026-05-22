# Lesson 1 — Realtime Location Updates at Scale — e2e results

Stack: `docker compose up -d` (image: `starciacademy/system-design-realtime-location-updates-at-scale-api:latest`, port 3017; redis exposed on 6396).

## T1 — Seed nearby query
`GET /api/location/nearby?lat=10.762622&lng=106.660172&radiusMeters=1500` → PASS
- 2 seeded drivers in range: `drv_11` (32m), `drv_27` (446m)
- `geoCommand = "GEORADIUS drivers:live 106.660172 10.762622 1500 m WITHDIST ASC"`

## T2 — Update driver ping
`POST /api/location/update {"driverId":"drv_99","lat":10.7630,"lng":106.6605}` → PASS
- `status = "indexed"` (new key), `geoCommand = "GEOADD drivers:live 106.6605 10.763 drv_99"`
- `engine = "Redis Geohash + Sorted Set (RAM)"`, `googleApiUsed = false`

## T3 — Tiny radius (50m)
`GET /api/location/nearby?lat=10.762622&lng=106.660172&radiusMeters=50` → PASS
- Only `drv_11` (32m) returns — confirms distance pruning is exact

## T4 — Empty zone (Hanoi coordinates, 200m)
`GET /api/location/nearby?lat=21.0285&lng=105.8542&radiusMeters=200` → PASS
- `drivers = []` — no false positives across cities

Teardown: `docker compose down -v` — OK.
