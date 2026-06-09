import { Provider } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"

// Injection token for the shared ioredis connection.
export const REDIS_CLIENT = "REDIS_CLIENT"

export const redisProvider: Provider = {
    provide: REDIS_CLIENT,
    inject: [ConfigService],
    useFactory: (cs: ConfigService): Redis => {
        // Single shared ioredis connection for the whole service.
        return new Redis({
            host: cs.get<string>("REDIS_HOST", "localhost"),
            port: cs.get<number>("REDIS_PORT", 6379),
        })
    },
}
