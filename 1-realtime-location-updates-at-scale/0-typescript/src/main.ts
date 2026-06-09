import { NestFactory } from "@nestjs/core"
import { ConfigService } from "@nestjs/config"
import { AppModule } from "./app.module"

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule)
    const cs = app.get(ConfigService)
    const port = cs.get<number>("app.port") ?? 3017
    await app.listen(port)
    // eslint-disable-next-line no-console
    console.log(`location-tracker listening on :${port}`)
}

void bootstrap()
