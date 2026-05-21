import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { appConfig } from "./config"
import { LocationModule } from "./location"

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }), LocationModule],
})
export class AppModule {}
