package com.starci.locationtracker;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class LocationController {

    private final LocationService location;

    public LocationController(LocationService location) {
        this.location = location;
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", location.ping() ? "ok" : "down");
    }

    @PostMapping("/api/location/update")
    public ResponseEntity<?> update(@RequestBody UpdateRequest body) {
        if (body.driverId() == null || body.driverId().isBlank()
                || body.lat() < -90 || body.lat() > 90
                || body.lng() < -180 || body.lng() > 180) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid driverId or coordinates"));
        }
        location.updateLocation(body.driverId(), body.lat(), body.lng());
        return ResponseEntity.ok(Map.of("driverId", body.driverId(), "updated", true));
    }

    @GetMapping("/api/location/nearby")
    public ResponseEntity<?> nearby(@RequestParam double lat,
                                    @RequestParam double lng,
                                    @RequestParam double radius) {
        if (radius <= 0 || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return ResponseEntity.badRequest().body(Map.of("error", "lat, lng and positive radius are required"));
        }
        List<LocationService.NearbyDriver> drivers = location.findNearby(lat, lng, radius);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("center", Map.of("lat", lat, "lng", lng));
        response.put("radiusM", radius);
        response.put("drivers", drivers);
        return ResponseEntity.ok(response);
    }

    public record UpdateRequest(String driverId, double lat, double lng) {
    }
}
