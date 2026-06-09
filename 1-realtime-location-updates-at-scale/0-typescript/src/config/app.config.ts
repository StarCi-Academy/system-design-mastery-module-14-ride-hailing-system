import { registerAs } from "@nestjs/config"

// Centralized config read once at boot; no scattered process.env access.
export default registerAs("app", () => ({
    port: Number(process.env.PORT) || 3017,
    redisHost: process.env.REDIS_HOST || "localhost",
    redisPort: Number(process.env.REDIS_PORT) || 6379,
    heartbeatTtlSec: Number(process.env.HEARTBEAT_TTL_SEC) || 30,
}))
