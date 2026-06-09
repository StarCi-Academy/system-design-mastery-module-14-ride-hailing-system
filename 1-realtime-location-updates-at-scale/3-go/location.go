package main

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
)

// geoKey is the single sorted set holding every active driver's position,
// scored by the 52-bit geohash of (lng, lat).
const geoKey = "drivers:geo"

// heartbeatKey returns the per-driver TTL key used to express liveness.
func heartbeatKey(driverID string) string {
	return "driver:heartbeat:" + driverID
}

// NearbyDriver is one entry of a nearby-search result.
type NearbyDriver struct {
	DriverID  string  `json:"driverId"`
	DistanceM float64 `json:"distanceM"`
}

// LocationService maps the HTTP contract onto Redis GEO commands.
type LocationService struct {
	redis        *redis.Client
	heartbeatTTL time.Duration
}

// NewLocationService wires the service with a shared Redis client.
func NewLocationService(client *redis.Client, ttl time.Duration) *LocationService {
	return &LocationService{redis: client, heartbeatTTL: ttl}
}

// UpdateLocation writes the driver's position into the geo sorted set and
// refreshes a short heartbeat TTL so stale drivers fall out of the index.
func (s *LocationService) UpdateLocation(ctx context.Context, driverID string, lat, lng float64) error {
	// GEOADD encodes (lng, lat) as a 52-bit geohash and stores it as the
	// member's score in a sorted set: O(log N) insert/update, just like ZADD.
	// Note: Redis takes longitude FIRST, then latitude.
	if err := s.redis.GeoAdd(ctx, geoKey, &redis.GeoLocation{
		Name:      driverID,
		Longitude: lng,
		Latitude:  lat,
	}).Err(); err != nil {
		return err
	}
	// Heartbeat: a per-driver key with a short TTL. If pings stop, this key
	// expires and the driver is treated as offline by nearby queries.
	return s.redis.Set(ctx, heartbeatKey(driverID), "1", s.heartbeatTTL).Err()
}

// FindNearby returns drivers within radiusM meters of (lat, lng), nearest first.
// Drivers whose heartbeat TTL has expired (offline) are filtered out.
func (s *LocationService) FindNearby(ctx context.Context, lat, lng, radiusM float64) ([]NearbyDriver, error) {
	// GEOSEARCH BYRADIUS scans only the geohash range covering the circle, then
	// prunes by exact distance. ASC returns closest-first; WithDist attaches meters.
	res, err := s.redis.GeoSearchLocation(ctx, geoKey, &redis.GeoSearchLocationQuery{
		GeoSearchQuery: redis.GeoSearchQuery{
			Longitude:  lng,
			Latitude:   lat,
			Radius:     radiusM,
			RadiusUnit: "m",
			Sort:       "ASC",
		},
		WithDist: true,
	}).Result()
	if err != nil {
		return nil, err
	}

	out := make([]NearbyDriver, 0, len(res))
	for _, loc := range res {
		// Drop drivers whose heartbeat TTL has expired (offline) before returning.
		alive, err := s.redis.Exists(ctx, heartbeatKey(loc.Name)).Result()
		if err != nil {
			return nil, err
		}
		if alive == 1 {
			out = append(out, NearbyDriver{
				DriverID:  loc.Name,
				DistanceM: round2(loc.Dist),
			})
		}
	}
	return out, nil
}

// round2 rounds a distance to two decimal places for a stable JSON response.
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// Ping verifies Redis connectivity for the health endpoint.
func (s *LocationService) Ping(ctx context.Context) error {
	return s.redis.Ping(ctx).Err()
}

// NewRedisClient builds one shared go-redis client for the whole process.
func NewRedisClient(cfg Config) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr: fmt.Sprintf("%s:%d", cfg.RedisHost, cfg.RedisPort),
	})
}
