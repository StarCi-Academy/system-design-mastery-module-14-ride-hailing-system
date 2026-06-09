package com.starci.h3;

import com.uber.h3core.H3Core;
import com.uber.h3core.util.LatLng;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// H3Controller exposes three REST groups matching the TypeScript contract:
// /cell (hash + geometry), /neighbors (lat/lng k-ring), /surge-demo (in-memory).
// Pure CPU work — no external datastore required.
@RestController
@RequestMapping("/api/h3")
public class H3Controller {

    private final H3Core h3;

    // Default resolution injected from environment variable H3_RESOLUTION.
    @Value("${H3_RESOLUTION:9}")
    private int defaultRes;

    public H3Controller(H3Core h3) {
        this.h3 = h3;
    }

    // Hash a coordinate into an H3 hexagon cell (offline, no Google API).
    // latLngToCellAddress is a pure function: same (lat, lng, resolution) always
    // yields the same cell id — a stable bucket key for grouping drivers/demand.
    // Returns center (cellToLatLng), boundary (6 vertices), areaKm2 (cellArea).
    @GetMapping("/cell")
    public ResponseEntity<Map<String, Object>> cell(
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false) Integer resolution) {

        // Default coordinate: Ho Chi Minh City centre.
        double reqLat = (lat != null) ? lat : 10.762622;
        double reqLng = (lng != null) ? lng : 106.660172;
        int res = (resolution != null) ? resolution : defaultRes;

        // Validate: H3 only accepts lat in [-90,90] and lng in [-180,180].
        if (reqLat < -90 || reqLat > 90 || reqLng < -180 || reqLng > 180) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "lat must be in [-90,90] and lng in [-180,180]"));
        }

        String h3Index = h3.latLngToCellAddress(reqLat, reqLng, res);

        // Center of the cell: reverse-map the cell id back to its centroid.
        LatLng center = h3.cellToLatLng(h3Index);

        // Boundary: 6 vertices of the hexagon, each as {lat, lng}.
        List<LatLng> rawBoundary = h3.cellToBoundary(h3Index);
        List<Map<String, Double>> boundary = new ArrayList<>();
        for (LatLng v : rawBoundary) {
            Map<String, Double> pt = new LinkedHashMap<>();
            pt.put("lat", v.lat);
            pt.put("lng", v.lng);
            boundary.add(pt);
        }

        // Area: convert m² to km², round to 4 decimal places.
        double areaM2 = h3.cellArea(h3Index, com.uber.h3core.AreaUnit.km2);
        double areaKm2 = Math.round(areaM2 * 10000.0) / 10000.0;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("lat", reqLat);
        body.put("lng", reqLng);
        body.put("resolution", res);
        body.put("h3Index", h3Index);
        Map<String, Double> centerMap = new LinkedHashMap<>();
        centerMap.put("lat", center.lat);
        centerMap.put("lng", center.lng);
        body.put("center", centerMap);
        body.put("boundary", boundary);
        body.put("areaKm2", areaKm2);
        body.put("engine", "com.uber:h3 (H3Core, CPU on server)");
        body.put("googleApiUsed", false);
        return ResponseEntity.ok(body);
    }

    // Neighbour grid — used to widen a driver-search radius and to aggregate
    // supply/demand per region. Accepts lat/lng directly (same as TS contract):
    // hash to origin cell first, then call gridDisk(origin, k).
    // k=1 yields origin + 6 neighbours (7 cells for a hexagon).
    @GetMapping("/neighbors")
    public ResponseEntity<Map<String, Object>> neighbors(
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(defaultValue = "1") int k) {

        double reqLat = (lat != null) ? lat : 10.762622;
        double reqLng = (lng != null) ? lng : 106.660172;

        // Validate coordinate range.
        if (reqLat < -90 || reqLat > 90 || reqLng < -180 || reqLng > 180) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "lat must be in [-90,90] and lng in [-180,180]"));
        }

        // Hash the pickup point into a cell, then enumerate the k-ring.
        String originIndex = h3.latLngToCellAddress(reqLat, reqLng, defaultRes);
        List<String> disk = h3.gridDisk(originIndex, k);

        // Each neighbour cell: return {h3Index, center} matching the TS contract.
        List<Map<String, Object>> cells = new ArrayList<>();
        for (String idx : disk) {
            LatLng c = h3.cellToLatLng(idx);
            Map<String, Object> cell = new LinkedHashMap<>();
            cell.put("h3Index", idx);
            Map<String, Double> centerMap = new LinkedHashMap<>();
            centerMap.put("lat", c.lat);
            centerMap.put("lng", c.lng);
            cell.put("center", centerMap);
            cells.add(cell);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("origin", originIndex);
        body.put("ringSize", disk.size());
        body.put("cells", cells);
        return ResponseEntity.ok(body);
    }

    // Demo surge per cell (in-memory, no Redis). Because the cell id is
    // deterministic, the same coordinate always yields the same demand/supply
    // numbers, so the surge formula is reproducible without external state.
    // demand = 12 + (last char code mod 8), supply = 3 + (first char code mod 4).
    @GetMapping("/surge-demo")
    public ResponseEntity<Map<String, Object>> surgeDemo(
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng) {

        double reqLat = (lat != null) ? lat : 10.762622;
        double reqLng = (lng != null) ? lng : 106.660172;

        String h3Index = h3.latLngToCellAddress(reqLat, reqLng, defaultRes);

        // Deterministic demand/supply derived from the cell id string itself —
        // same h3Index always yields the same values (no external state needed).
        int demand = 12 + (h3Index.charAt(h3Index.length() - 1) % 8);
        int supply = 3 + (h3Index.charAt(0) % 4);
        // Surge multiplier: max(1, demand / max(supply, 1)), rounded to 2 dp.
        double raw = Math.max(1.0, (double) demand / Math.max(supply, 1));
        double surgeMultiplier = Math.round(raw * 100.0) / 100.0;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("h3Index", h3Index);
        body.put("demand", demand);
        body.put("supply", supply);
        body.put("surgeMultiplier", surgeMultiplier);
        body.put("note", "Real surge in L2 stores demand/supply per h3Index in Redis.");
        return ResponseEntity.ok(body);
    }
}
