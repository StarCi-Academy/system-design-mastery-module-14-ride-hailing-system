import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { appConfig } from "./config"
import { MatchingModule } from "./matching"

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }), MatchingModule],
})
export class AppModule {}
