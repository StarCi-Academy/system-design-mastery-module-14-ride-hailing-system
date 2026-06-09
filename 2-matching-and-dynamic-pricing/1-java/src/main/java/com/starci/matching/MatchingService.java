package com.starci.matching;

import com.uber.h3core.H3Core;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResult;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.geo.Metrics;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.domain.geo.GeoReference;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class MatchingService {

    private static final int H3_RESOLUTION = 9;
    private static final String GEO_KEY = "drivers:geo";
    private static final int SUPPLY_BASELINE = 3;
    private static final double SURGE_CAP = 3.0;
    private static final long LOCK_TTL_SECONDS = 30;
    private static final double[] RINGS = { 500, 1000, 2000, 5000 };

    private static final double[][] SEED = {
            { 10.7770, 106.7010 },
            { 10.7775, 106.7020 },
            { 10.7740, 106.6980 },
    };

    private final StringRedisTemplate redis;
    private final H3Core h3;

    public MatchingService(StringRedisTemplate redis, H3Core h3) {
        this.redis = redis;
        this.h3 = h3;
    }

    // Seed a few available drivers into the geo set after the application is fully ready.
    // Using ApplicationReadyEvent instead of @PostConstruct so the HTTP server is already
    // bound and the container network DNS is stable before the first Redis write.
    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        for (int i = 0; i < SEED.length; i++) {
            String id = "d" + (i + 1);
            redis.opsForGeo().add(GEO_KEY, new Point(SEED[i][1], SEED[i][0]), id);
        }
    }

    public Map<String, Object> quote(double lat, double lng) {
        // Index the pickup point to a fixed H3 cell so demand is measured per area.
        String cell = h3.latLngToCellAddress(lat, lng, H3_RESOLUTION);
        // INCR is atomic: every quote bumps this cell's demand by exactly one.
        Long demand = redis.opsForValue().increment("demand:" + cell);
        long supply = SUPPLY_BASELINE;
        long d = demand == null ? 1 : demand;
        double raw = 1.0 + (double) d / Math.max(supply, 1);
        double multiplier = Math.min(Math.round(raw * 100.0) / 100.0, SURGE_CAP);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cell", cell);
        out.put("demand", d);
        out.put("supply", supply);
        out.put("multiplier", multiplier);
        return out;
    }

    public Map<String, Object> requestRide(String riderId, double lat, double lng) {
        for (double radius : RINGS) {
            GeoResults<RedisGeoCommands.GeoLocation<String>> hits = searchRing(lat, lng, radius);
            if (hits == null || hits.getContent().isEmpty()) {
                continue; // ring empty, expand to the next radius
            }
            for (GeoResult<RedisGeoCommands.GeoLocation<String>> hit : hits) {
                String driverId = hit.getContent().getName();
                if (tryLockDriver(driverId, riderId)) {
                    redis.opsForZSet().remove(GEO_KEY, driverId);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("riderId", riderId);
                    out.put("driverId", driverId);
                    out.put("distanceMeters", (int) Math.round(hit.getDistance().getValue() * 1000.0));
                    out.put("ringMeters", (int) radius);
                    out.put("matched", true);
                    return out;
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("riderId", riderId);
        out.put("matched", false);
        return out;
    }

    private GeoResults<RedisGeoCommands.GeoLocation<String>> searchRing(double lat, double lng, double radius) {
        Distance dist = new Distance(radius / 1000.0, Metrics.KILOMETERS);
        RedisGeoCommands.GeoSearchCommandArgs args = RedisGeoCommands.GeoSearchCommandArgs
                .newGeoSearchArgs()
                .includeDistance()
                .sortAscending()
                .limit(10);
        return redis.opsForGeo().search(GEO_KEY,
                GeoReference.fromCoordinate(new Point(lng, lat)), dist, args);
    }

    // SET NX is atomic: only the first caller writes the lock and gets the driver.
    private boolean tryLockDriver(String driverId, String riderId) {
        Boolean acquired = redis.opsForValue().setIfAbsent(
                "lock:driver:" + driverId, riderId, Duration.ofSeconds(LOCK_TTL_SECONDS));
        return Boolean.TRUE.equals(acquired);
    }
}
