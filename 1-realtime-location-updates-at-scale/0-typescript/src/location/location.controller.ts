import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common"
import { LocationService } from "./location.service"

interface UpdateBody {
    driverId: string
    lat: number
    lng: number
}

@Controller()
export class LocationController {
    constructor(private readonly location: LocationService) {}

    @Get("/api/health")
    async health(): Promise<{ status: string }> {
        const ok = await this.location.ping()
        return { status: ok ? "ok" : "down" }
    }

    @Post("/api/location/update")
    async update(@Body() body: UpdateBody): Promise<{ driverId: string; updated: boolean }> {
        const { driverId, lat, lng } = body
        if (!driverId || !this.isLat(lat) || !this.isLng(lng)) {
            throw new BadRequestException("invalid driverId or coordinates")
        }
        await this.location.updateLocation(driverId, lat, lng)
        return { driverId, updated: true }
    }

    @Get("/api/location/nearby")
    async nearby(
        @Query("lat") lat: string,
        @Query("lng") lng: string,
        @Query("radius") radius: string,
    ): Promise<{ center: { lat: number; lng: number }; radiusM: number; drivers: unknown[] }> {
        const latN = Number(lat)
        const lngN = Number(lng)
        const radiusM = Number(radius)
        if (!this.isLat(latN) || !this.isLng(lngN) || !(radiusM > 0)) {
            throw new BadRequestException("lat, lng and positive radius are required")
        }
        const drivers = await this.location.findNearby(latN, lngN, radiusM)
        return { center: { lat: latN, lng: lngN }, radiusM, drivers }
    }

    private isLat(v: number): boolean {
        return Number.isFinite(v) && v >= -90 && v <= 90
    }

    private isLng(v: number): boolean {
        return Number.isFinite(v) && v >= -180 && v <= 180
    }
}
