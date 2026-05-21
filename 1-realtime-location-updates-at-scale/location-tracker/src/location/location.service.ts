import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"

const SEED_DRIVERS = [
    { driverId: "drv_11", lat: 10.7628, lng: 106.6604 },
    { driverId: "drv_27", lat: 10.7589, lng: 106.6617 },
    { driverId: "drv_41", lat: 10.7712, lng: 106.6711 },
]

@Injectable()
export class LocationService implements OnModuleInit, OnModuleDestroy {
    private redis!: Redis
    private geoKey!: string

    constructor(private readonly config: ConfigService) {}

    async onModuleInit(): Promise<void> {
        this.geoKey = this.config.get<string>("GEO_KEY") ?? "drivers:live"
        const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379"
        this.redis = new Redis(redisUrl)
        await this.redis.del(this.geoKey)
        for (const d of SEED_DRIVERS) {
            await this.redis.geoadd(this.geoKey, d.lng, d.lat, d.driverId)
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis?.quit()
    }

    /** GEOADD — ping GPS tài xế (lng, lat theo chuẩn Redis). */
    async update(driverId: string, lat: number, lng: number) {
        const added = await this.redis.geoadd(this.geoKey, lng, lat, driverId)
        return {
            driverId,
            status: added === 1 ? "indexed" : "updated",
            geoCommand: `GEOADD ${this.geoKey} ${lng} ${lat} ${driverId}`,
            engine: "Redis Geohash + Sorted Set (RAM)",
            googleApiUsed: false,
            latencyTargetMs: "< 5ms on LAN",
        }
    }

    /** GEORADIUS — quét xe trong bán kính mét. */
    async nearby(lat: number, lng: number, radiusMeters: number) {
        const raw = await this.redis.georadius(
            this.geoKey,
            lng,
            lat,
            radiusMeters,
            "m",
            "WITHDIST",
            "ASC",
            "COUNT",
            20,
        )
        const drivers = (raw as [string, string][]).map(([driverId, dist]) => ({
            driverId,
            distanceMeters: Math.round(Number(dist)),
        }))
        return {
            query: { lat, lng, radiusMeters },
            geoCommand: `GEORADIUS ${this.geoKey} ${lng} ${lat} ${radiusMeters} m WITHDIST ASC`,
            drivers,
            note: "Mỗi ping/ quét KHÔNG gọi Google — toán học nội bộ Redis.",
        }
    }
}
