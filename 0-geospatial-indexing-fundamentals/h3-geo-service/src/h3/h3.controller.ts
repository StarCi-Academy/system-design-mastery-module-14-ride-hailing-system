import { Controller, Get, Query } from "@nestjs/common"
import { H3Service } from "./h3.service"

@Controller("api/h3")
export class H3Controller {
    constructor(private readonly service: H3Service) {}

    @Get("cell")
    cell(
        @Query("lat") lat = "10.762622",
        @Query("lng") lng = "106.660172",
        @Query("resolution") resolution?: string,
    ) {
        return this.service.cell(
            Number(lat),
            Number(lng),
            resolution ? Number(resolution) : undefined,
        )
    }

    @Get("neighbors")
    neighbors(
        @Query("lat") lat = "10.762622",
        @Query("lng") lng = "106.660172",
        @Query("k") k = "1",
    ) {
        return this.service.neighbors(Number(lat), Number(lng), Number(k))
    }

    @Get("surge-demo")
    surgeDemo(
        @Query("lat") lat = "10.762622",
        @Query("lng") lng = "106.660172",
    ) {
        return this.service.demoSurgeByCell(Number(lat), Number(lng))
    }
}
