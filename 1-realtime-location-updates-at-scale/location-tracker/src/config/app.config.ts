import { registerAs } from "@nestjs/config"

export interface AppConfig {
    port: number
}

export const appConfig = registerAs("app", (): AppConfig => ({
    port: Number(process.env.PORT) || 3000,
}))
