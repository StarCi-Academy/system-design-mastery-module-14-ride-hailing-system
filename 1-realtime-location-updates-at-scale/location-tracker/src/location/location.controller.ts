import { Body, Controller, Get, Post, Query } from "@nestjs/common"
import { UpdateLocationDto } from "./dto"
import { LocationService } from "./location.service"

@Controller("api/location")
export class LocationController {
    constructor(private readonly service: LocationService) {}

    @Post("update")
    update(@Body() body: UpdateLocationDto) {
        return this.service.update(body.driverId, body.lat, body.lng)
    }

    @Get("nearby")
    nearby(
        @Query("lat") lat = "10.762622",
        @Query("lng") lng = "106.660172",
        @Query("radiusMeters") radiusMeters = "1500",
    ) {
        return this.service.nearby(
            Number(lat),
            Number(lng),
            Number(radiusMeters),
        )
    }
}
