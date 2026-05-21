import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { appConfig } from "./config"
import { H3Module } from "./h3"

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }), H3Module],
})
export class AppModule {}
