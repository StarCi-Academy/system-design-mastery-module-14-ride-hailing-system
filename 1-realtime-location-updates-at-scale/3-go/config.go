package main

import (
	"os"
	"strconv"
	"time"
)

// Config holds runtime settings read once at startup from the environment.
// All env reads are centralized here instead of scattered os.Getenv calls.
type Config struct {
	Port         string
	RedisHost    string
	RedisPort    int
	HeartbeatTTL time.Duration
}

// LoadConfig reads configuration from environment variables with safe demo defaults.
func LoadConfig() Config {
	return Config{
		Port:         getEnv("PORT", "3017"),
		RedisHost:    getEnv("REDIS_HOST", "localhost"),
		RedisPort:    getEnvInt("REDIS_PORT", 6379),
		HeartbeatTTL: time.Duration(getEnvInt("HEARTBEAT_TTL_SEC", 30)) * time.Second,
	}
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
