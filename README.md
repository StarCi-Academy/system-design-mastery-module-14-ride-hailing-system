# Module 14 — Geospatial Indexing, Realtime Matching & Surge Pricing

| Lesson | Stack | API port |
|--------|-------|----------|
| 0 | Uber **h3-js** (hex grid, offline) | **3000** |
| 1 | **Redis** GEOADD / GEORADIUS | **3001** |
| 2 | **H3** + Redis surge + ring match | **3002** |

**Không dùng Google Maps API** trên hot path — chỉ toán học server + Redis RAM.

```bash
node scratch/apply_module_14_ride_hailing_rules.mjs
```
