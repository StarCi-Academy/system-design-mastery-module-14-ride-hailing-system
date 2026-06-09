import { Inject, Injectable, OnModuleInit } from "@nestjs/common"
import { latLngToCell } from "h3-js"
import Redis from "ioredis"
import { REDIS_CLIENT } from "./redis.provider"

// H3 resolution for demand bucketing (neighborhood-sized hexagon).
const H3_RESOLUTION = 9
// Geo set key for available drivers.
const GEO_KEY = "drivers:geo"
// Supply baseline used by the surge ratio (seeded driver count).
const SUPPLY_BASELINE = 3
// Surge multiplier is clamped to this ceiling.
const SURGE_CAP = 3
// Assignment lock TTL in seconds.
const LOCK_TTL_SEC = 30
// Expanding-ring radii in metres.
const RINGS_METERS: readonly number[] = [500, 1000, 2000, 5000]

// Seeded drivers near a District 1 coordinate so the request flow has candidates.
const SEED_DRIVERS: ReadonlyArray<{ id: string; lat: number; lng: number }> = [
    { id: "d1", lat: 10.7770, lng: 106.7010 },
    { id: "d2", lat: 10.7775, lng: 106.7020 },
    { id: "d3", lat: 10.7740, lng: 106.6980 },
]

export interface SurgeQuote {
    cell: string
    demand: number
    supply: number
    multiplier: number
}

export interface NearestDriver {
    driverId: string
    distanceMeters: number
    ringMeters: number
}

@Injectable()
export class MatchingService implements OnModuleInit {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

    // Seed a few available drivers into the geo set on boot.
    async onModuleInit(): Promise<void> {
        for (const d of SEED_DRIVERS) {
            await this.redis.geoadd(GEO_KEY, d.lng, d.lat, d.id)
        }
    }

    async quoteSurge(lat: number, lng: number): Promise<SurgeQuote> {
        const cell = latLngToCell(lat, lng, H3_RESOLUTION)
        // INCR is atomic: each quote bumps this cell's live demand by one.
        const demand = await this.redis.incr(`demand:${cell}`)
        const supply = SUPPLY_BASELINE
        // Multiplier grows with demand/supply pressure, capped to avoid runaway pricing.
        const raw = 1 + demand / Math.max(supply, 1)
        const multiplier = Math.min(Math.round(raw * 100) / 100, SURGE_CAP)
        return { cell, demand, supply, multiplier }
    }

    async findNearestDriver(lat: number, lng: number): Promise<NearestDriver | null> {
        for (const radius of RINGS_METERS) {
            // GEOSEARCH reads candidates from a geohash-ordered sorted set: O(log N + K).
            const hits = (await this.redis.geosearch(
                GEO_KEY,
                "FROMLONLAT", lng, lat,
                "BYRADIUS", radius, "m",
                "ASC",
                "COUNT", 10,
                "WITHDIST",
            )) as [string, string][]
            // Inner ring empty -> widen the radius instead of scanning all drivers.
            if (hits.length === 0) continue
            for (const [driverId, dist] of hits) {
                // First driver we can lock wins; others stay free for the next rider.
                if (await this.tryLockDriver(driverId)) {
                    await this.redis.zrem(GEO_KEY, driverId)
                    return { driverId, distanceMeters: Math.round(Number(dist)), ringMeters: radius }
                }
            }
        }
        return null
    }

    private async tryLockDriver(driverId: string): Promise<boolean> {
        // SET NX is atomic: only ONE concurrent request wins the lock, no double-assign.
        const ok = await this.redis.set(`lock:driver:${driverId}`, "1", "EX", LOCK_TTL_SEC, "NX")
        return ok === "OK"
    }
}
