import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { MatchingController } from "./matching.controller"
import { MatchingService } from "./matching.service"
import { redisProvider } from "./redis.provider"

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true })],
    controllers: [MatchingController],
    providers: [redisProvider, MatchingService],
})
export class AppModule {}
