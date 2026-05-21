import { Module } from "@nestjs/common"
import { H3Controller } from "./h3.controller"
import { H3Service } from "./h3.service"

@Module({
    controllers: [H3Controller],
    providers: [H3Service],
})
export class H3Module {}
