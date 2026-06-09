package com.starci.locationtracker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.geo.Circle;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResult;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.connection.RedisGeoCommands.DistanceUnit;
import org.springframework.data.redis.connection.RedisGeoCommands.GeoLocation;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.domain.geo.GeoReference;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Service
public class LocationService {

    // One shared geo set holds every active driver's position as a geohash score.
    private static final String GEO_KEY = "drivers:geo";

    private final StringRedisTemplate redis;
    private final Duration heartbeatTtl;

    public LocationService(StringRedisTemplate redis,
                           @Value("${location.heartbeat-ttl-seconds:30}") long heartbeatTtlSeconds) {
        this.redis = redis;
        this.heartbeatTtl = Duration.ofSeconds(heartbeatTtlSeconds);
    }

    // Store/refresh the driver's position and bump its heartbeat in one update.
    public void updateLocation(String driverId, double lat, double lng) {
        // GEOADD encodes (lng, lat) into a 52-bit geohash score in the sorted set: O(log N).
        // Note Redis order is longitude FIRST, then latitude.
        Point point = new Point(lng, lat);
        redis.opsForGeo().add(GEO_KEY, point, driverId);

        // Heartbeat key with a TTL marks the driver as "alive"; nearby queries filter on it.
        redis.opsForValue().set("driver:heartbeat:" + driverId, "1", heartbeatTtl);
    }

    // Find drivers within radiusMeters of (lat, lng), nearest first, online only.
    public List<NearbyDriver> findNearby(double lat, double lng, double radiusMeters) {
        Point center = new Point(lng, lat);
        Distance radius = new Distance(radiusMeters, DistanceUnit.METERS);
        Circle within = new Circle(center, radius);

        RedisGeoCommands.GeoSearchCommandArgs args = RedisGeoCommands.GeoSearchCommandArgs
                .newGeoSearchArgs()
                .includeDistance()
                .sortAscending();

        GeoResults<GeoLocation<String>> results =
                redis.opsForGeo().search(GEO_KEY, GeoReference.fromCircle(within), within.getRadius(), args);

        List<NearbyDriver> nearby = new ArrayList<>();
        if (results == null) {
            return nearby;
        }
        for (GeoResult<GeoLocation<String>> r : results.getContent()) {
            String driverId = r.getContent().getName();
            // Skip drivers whose heartbeat has expired: stale points still live in the geo set.
            if (Boolean.TRUE.equals(redis.hasKey("driver:heartbeat:" + driverId))) {
                double distM = r.getDistance().getValue();
                nearby.add(new NearbyDriver(driverId, Math.round(distM * 100.0) / 100.0));
            }
        }
        return nearby;
    }

    public boolean ping() {
        Boolean alive = redis.hasKey("__never__");
        // hasKey round-trips to Redis; a non-exception result proves connectivity.
        return alive != null || true;
    }

    public record NearbyDriver(String driverId, double distanceM) {
    }
}
