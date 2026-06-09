import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common"
import { MatchingService } from "./matching.service"

interface RequestBody {
    riderId: string
    lat: number
    lng: number
}

@Controller()
export class MatchingController {
    constructor(private readonly matching: MatchingService) {}

    @Get("health")
    health(): { status: string } {
        return { status: "ok" }
    }

    @Get("api/match/quote")
    async quote(
        @Query("lat") lat: string,
        @Query("lng") lng: string,
    ): Promise<{ cell: string; demand: number; supply: number; multiplier: number }> {
        return this.matching.quoteSurge(Number(lat), Number(lng))
    }

    @Post("api/match/request")
    @HttpCode(200)
    async request(@Body() body: RequestBody): Promise<Record<string, unknown>> {
        const nearest = await this.matching.findNearestDriver(Number(body.lat), Number(body.lng))
        if (nearest === null) {
            return { riderId: body.riderId, matched: false }
        }
        return {
            riderId: body.riderId,
            driverId: nearest.driverId,
            distanceMeters: nearest.distanceMeters,
            ringMeters: nearest.ringMeters,
            matched: true,
        }
    }
}
