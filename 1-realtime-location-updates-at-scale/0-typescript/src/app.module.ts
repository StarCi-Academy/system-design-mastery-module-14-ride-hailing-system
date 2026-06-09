import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import appConfig from "./config/app.config"
import { LocationController } from "./location/location.controller"
import { LocationService } from "./location/location.service"
import { redisProvider } from "./redis/redis.provider"

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
    controllers: [LocationController],
    providers: [redisProvider, LocationService],
})
export class AppModule {}
