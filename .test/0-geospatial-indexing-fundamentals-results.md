# Lesson 0 — Geospatial Indexing Fundamentals — e2e results

Stack: `docker compose up -d` (image: `starciacademy/system-design-geospatial-indexing-fundamentals-api:latest`, port 3016).

## T1 — Hash coordinate to H3 cell
`GET /api/h3/cell?lat=10.762622&lng=106.660172` → PASS
- `h3Index = 8965b566e87ffff`, `resolution = 9`, `areaKm2 = 0.121`
- `engine = "h3-js (Uber H3, CPU on server)"`, `googleApiUsed = false`

## T2 — Neighbor ring k=1
`GET /api/h3/neighbors?lat=10.762622&lng=106.660172&k=1` → PASS
- `ringSize = 7` (origin + 6 hex neighbors), each entry has `h3Index` + `center{lat,lng}`

## T3 — Cold cell (open ocean, resolution 12)
`GET /api/h3/cell?lat=0&lng=-160&resolution=12` → PASS
- `h3Index = 8c70494ab02a9ff`, `resolution = 12`, `areaKm2 = 0.0003`
- `boundary` has 6 lat/lng pairs (hex vertices)

## T4 — In-memory surge demo
`GET /api/h3/surge-demo?lat=10.762622&lng=106.660172` → PASS
- `h3Index = 8965b566e87ffff`, `demand = 18`, `supply = 3`, `surgeMultiplier = 6`
- `note` reminds production surge belongs on Redis keyed by h3Index

Teardown: `docker compose down -v` — OK (network removed).
