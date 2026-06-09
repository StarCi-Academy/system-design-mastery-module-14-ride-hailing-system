package com.starci.matching;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class MatchingController {

    private final MatchingService matching;

    public MatchingController(MatchingService matching) {
        this.matching = matching;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/api/match/quote")
    public Map<String, Object> quote(@RequestParam double lat, @RequestParam double lng) {
        return matching.quote(lat, lng);
    }

    @PostMapping("/api/match/request")
    public Map<String, Object> request(@RequestBody MatchRequest body) {
        return matching.requestRide(body.riderId(), body.lat(), body.lng());
    }

    public record MatchRequest(String riderId, double lat, double lng) {
    }
}
