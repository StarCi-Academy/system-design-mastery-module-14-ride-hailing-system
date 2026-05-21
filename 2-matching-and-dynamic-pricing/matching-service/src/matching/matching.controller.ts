import { Body, Controller, Get, Post, Query } from "@nestjs/common"
import { MatchRequestDto } from "./dto"
import { MatchingService } from "./matching.service"

@Controller("api/match")
export class MatchingController {
    constructor(private readonly service: MatchingService) {}

    @Get("quote")
    quote(
        @Query("lat") lat = "10.762622",
        @Query("lng") lng = "106.660172",
    ) {
        return this.service.quote(Number(lat), Number(lng))
    }

    @Post("request")
    request(@Body() body: MatchRequestDto) {
        return this.service.request(
            body.clientId,
            body.lat,
            body.lng,
            body.distanceKm,
        )
    }
}
