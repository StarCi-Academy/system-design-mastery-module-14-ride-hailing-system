import { Inject, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"
import { REDIS_CLIENT } from "../redis/redis.provider"

export interface NearbyDriver {
    driverId: string
    distanceM: number
}

@Injectable()
export class LocationService {
    // drivers:geo is a sorted set whose score is the geohash of (lng, lat).
    private readonly geoKey = "drivers:geo"
    private readonly heartbeatTtlSec: number

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        cs: ConfigService,
    ) {
        this.heartbeatTtlSec = cs.get<number>("app.heartbeatTtlSec") ?? 30
    }

    async updateLocation(driverId: string, lat: number, lng: number): Promise<void> {
        // GEOADD encodes (lng, lat) into a 52-bit geohash and stores it as the
        // member's score in the sorted set: O(log N), an upsert keyed by driverId.
        // NOTE the argument order is longitude THEN latitude (Redis convention).
        await this.redis.geoadd(this.geoKey, lng, lat, driverId)

        // A short-lived heartbeat key marks the driver as "fresh". When it expires
        // the driver is considered offline; nearby queries filter on this TTL.
        await this.redis.set(`driver:heartbeat:${driverId}`, "1", "EX", this.heartbeatTtlSec)
    }

    async findNearby(lat: number, lng: number, radiusM: number): Promise<NearbyDriver[]> {
        // GEOSEARCH walks only the geohash range that covers the radius (a bounded
        // scan), returns each member WITHDIST in meters, sorted ASC so the closest
        // driver comes first — Redis does the distance pruning to ~50m.
        const rows = (await this.redis.geosearch(
            this.geoKey,
            "FROMLONLAT", lng, lat,
            "BYRADIUS", radiusM, "m",
            "ASC",
            "WITHDIST",
        )) as [string, string][]

        // Drop drivers whose heartbeat TTL has expired (offline) before returning.
        const result: NearbyDriver[] = []
        for (const [driverId, distance] of rows) {
            const alive = await this.redis.exists(`driver:heartbeat:${driverId}`)
            if (alive) result.push({ driverId, distanceM: Math.round(Number(distance) * 100) / 100 })
        }
        return result
    }

    async ping(): Promise<boolean> {
        const pong = await this.redis.ping()
        return pong === "PONG"
    }
}
