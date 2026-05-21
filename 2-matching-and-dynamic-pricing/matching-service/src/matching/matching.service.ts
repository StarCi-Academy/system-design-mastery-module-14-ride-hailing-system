import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { latLngToCell } from "h3-js"
import Redis from "ioredis"

const SEED_DRIVERS = [
    { driverId: "drv_88", lat: 10.7621, lng: 106.6598 },
    { driverId: "drv_23", lat: 10.764, lng: 106.662 },
    { driverId: "drv_51", lat: 10.768, lng: 106.665 },
]

const RING_RADIUS_METERS = [500, 1000, 2000, 5000]

@Injectable()
export class MatchingService implements OnModuleInit, OnModuleDestroy {
    private redis!: Redis
    private geoKey!: string
    private h3Resolution!: number

    constructor(private readonly config: ConfigService) {}

    async onModuleInit(): Promise<void> {
        this.geoKey = this.config.get<string>("GEO_KEY") ?? "drivers:live"
        this.h3Resolution = Number(this.config.get("H3_RESOLUTION") ?? 9)
        const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379"
        this.redis = new Redis(redisUrl)
        await this.redis.del(this.geoKey)
        for (const d of SEED_DRIVERS) {
            await this.redis.geoadd(this.geoKey, d.lng, d.lat, d.driverId)
            await this.redis.set(`supply:${d.driverId}`, "1")
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis?.quit()
    }

    private h3Index(lat: number, lng: number): string {
        return latLngToCell(lat, lng, this.h3Resolution)
    }

    /** Báo giá surge theo ô H3 + demand counter trên Redis. */
    async quote(lat: number, lng: number) {
        const cell = this.h3Index(lat, lng)
        const demand = await this.redis.incr(`demand:${cell}`)
        const supply = Number(await this.redis.get(`supply:${cell}`) ?? SEED_DRIVERS.length)
        const surgeMultiplier = Number(Math.max(1, demand / Math.max(supply, 1)).toFixed(2))
        return {
            pickup: { lat, lng },
            h3Index: cell,
            demand,
            supply,
            surgeMultiplier,
            pricingModel: "baseFare * surge (H3 cell, no Google API)",
            googleDirectionsUsed: false,
        }
    }

    /** Expanding ring: GEORADIUS 500m → 5km cho đến khi có tài xế. */
    async request(clientId: string, lat: number, lng: number, distanceKm = 5.2) {
        const cell = this.h3Index(lat, lng)
        await this.redis.incr(`demand:${cell}`)

        let matched: { driverId: string; distanceMeters: number; ringMeters: number } | null = null
        for (const ringMeters of RING_RADIUS_METERS) {
            const raw = await this.redis.georadius(
                this.geoKey,
                lng,
                lat,
                ringMeters,
                "m",
                "WITHDIST",
                "ASC",
                "COUNT",
                1,
            )
            const hit = (raw as [string, string][])[0]
            if (hit) {
                matched = {
                    driverId: hit[0],
                    distanceMeters: Math.round(Number(hit[1])),
                    ringMeters,
                }
                break
            }
        }

        const quote = await this.quote(lat, lng)
        const baseFare = 22000
        const distanceFare = Math.round(distanceKm * 8500)
        const estimatedFare = Math.round(
            (baseFare + distanceFare) * quote.surgeMultiplier,
        )

        return {
            clientId,
            pickup: { lat, lng, h3Index: cell },
            strategy: "expanding-radius (GEORADIUS rings)",
            matchedDriver: matched,
            routeEstimate: {
                distanceKm,
                source: "mock-haversine-or-directions-once-in-prod",
                googleApiOnHotPath: false,
            },
            pricing: {
                baseFare,
                distanceFare,
                surgeMultiplier: quote.surgeMultiplier,
                estimatedFare,
            },
        }
    }
}
