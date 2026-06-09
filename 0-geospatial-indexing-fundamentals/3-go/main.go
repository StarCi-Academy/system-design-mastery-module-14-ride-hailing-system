package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"

	h3 "github.com/uber/h3-go/v4"
)

// H3 geospatial indexing demo — Go standard library + uber/h3-go/v4.
// Pure CPU work: hash lat/lng to a cell id, enumerate the k-ring, derive
// in-memory surge signal. No external datastore required.

var (
	defaultRes = 9
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func atoiDefault(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	if v, err := strconv.Atoi(s); err == nil {
		return v
	}
	return fallback
}

func atofDefault(s string, fallback float64) float64 {
	if s == "" {
		return fallback
	}
	if v, err := strconv.ParseFloat(s, 64); err == nil {
		return v
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// roundTo4 rounds a float64 to 4 decimal places (matching TS toFixed(4)).
func roundTo4(v float64) float64 {
	return math.Round(v*10000) / 10000
}

// roundTo2 rounds a float64 to 2 decimal places (matching TS toFixed(2)).
func roundTo2(v float64) float64 {
	return math.Round(v*100) / 100
}

// GET /api/h3/cell?lat=&lng=&resolution= -> deterministic cell id + geometry.
// latLngToCell is a pure function: same (lat, lng, resolution) always yields
// the same cell id — a stable bucket key for grouping drivers/demand.
func cellHandler(w http.ResponseWriter, r *http.Request) {
	// Default coordinate: Ho Chi Minh City centre.
	lat := atofDefault(r.URL.Query().Get("lat"), 10.762622)
	lng := atofDefault(r.URL.Query().Get("lng"), 106.660172)
	res := atoiDefault(r.URL.Query().Get("resolution"), defaultRes)

	// Validate: H3 only accepts lat in [-90,90] and lng in [-180,180].
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "lat must be in [-90,90] and lng in [-180,180]",
		})
		return
	}

	// Hash the coordinate into a cell id.
	cell := h3.LatLngToCell(h3.NewLatLng(lat, lng), res)

	// Center: reverse-map cell id back to its centroid.
	centerLL := h3.CellToLatLng(cell)

	// Boundary: 6 vertices of the hexagon, each as {lat, lng}.
	rawBoundary := h3.CellToBoundary(cell)
	type vertex struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	boundary := make([]vertex, 0, len(rawBoundary))
	for _, v := range rawBoundary {
		boundary = append(boundary, vertex{Lat: v.Lat, Lng: v.Lng})
	}

	// Area in km², rounded to 4 decimal places.
	areaKm2 := roundTo4(h3.CellAreaKm2(cell))

	// Use an ordered-field struct so JSON output is deterministic (alphabetical
	// key order within nested objects is a Go map-order gotcha; struct avoids it).
	type centerT struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	type resp struct {
		Lat          float64   `json:"lat"`
		Lng          float64   `json:"lng"`
		Resolution   int       `json:"resolution"`
		H3Index      string    `json:"h3Index"`
		Center       centerT   `json:"center"`
		Boundary     []vertex  `json:"boundary"`
		AreaKm2      float64   `json:"areaKm2"`
		Engine       string    `json:"engine"`
		GoogleAPIUsed bool     `json:"googleApiUsed"`
	}
	writeJSON(w, http.StatusOK, resp{
		Lat:        lat,
		Lng:        lng,
		Resolution: res,
		H3Index:    cell.String(),
		Center:     centerT{Lat: centerLL.Lat, Lng: centerLL.Lng},
		Boundary:   boundary,
		AreaKm2:    areaKm2,
		Engine:     "uber/h3-go/v4 (Uber H3, CPU on server)",
		GoogleAPIUsed: false,
	})
}

// GET /api/h3/neighbors?lat=&lng=&k= -> k-ring of cells around the coordinate.
// Accepts lat/lng directly (same as TS contract): hash to origin cell first,
// then call GridDisk(origin, k). k=1 yields 7 cells for a hexagon.
func neighborsHandler(w http.ResponseWriter, r *http.Request) {
	lat := atofDefault(r.URL.Query().Get("lat"), 10.762622)
	lng := atofDefault(r.URL.Query().Get("lng"), 106.660172)
	k := atoiDefault(r.URL.Query().Get("k"), 1)

	// Validate coordinate range.
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "lat must be in [-90,90] and lng in [-180,180]",
		})
		return
	}

	// Hash the pickup point into a cell, then enumerate the k-ring.
	origin := h3.LatLngToCell(h3.NewLatLng(lat, lng), defaultRes)
	disk := origin.GridDisk(k)

	// Each neighbour cell: return {h3Index, center} matching the TS contract.
	type centerT struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	type cellInfo struct {
		H3Index string  `json:"h3Index"`
		Center  centerT `json:"center"`
	}
	cells := make([]cellInfo, 0, len(disk))
	for _, c := range disk {
		ll := h3.CellToLatLng(c)
		cells = append(cells, cellInfo{
			H3Index: c.String(),
			Center:  centerT{Lat: ll.Lat, Lng: ll.Lng},
		})
	}

	type resp struct {
		Origin   string     `json:"origin"`
		RingSize int        `json:"ringSize"`
		Cells    []cellInfo `json:"cells"`
	}
	writeJSON(w, http.StatusOK, resp{
		Origin:   origin.String(),
		RingSize: len(disk),
		Cells:    cells,
	})
}

// GET /api/h3/surge-demo?lat=&lng= -> in-memory surge signal per cell.
// Because the cell id is deterministic, the same coordinate always yields the
// same demand/supply numbers — reproducible without external state.
func surgeDemoHandler(w http.ResponseWriter, r *http.Request) {
	lat := atofDefault(r.URL.Query().Get("lat"), 10.762622)
	lng := atofDefault(r.URL.Query().Get("lng"), 106.660172)

	cell := h3.LatLngToCell(h3.NewLatLng(lat, lng), defaultRes)
	h3Str := cell.String()

	// Deterministic demand/supply derived from the cell id string —
	// same h3Index always yields the same values (no external state needed).
	demand := 12 + (int(h3Str[len(h3Str)-1]) % 8)
	supply := 3 + (int(h3Str[0]) % 4)
	// Surge multiplier: max(1, demand / max(supply, 1)), rounded to 2 dp.
	supplyF := math.Max(float64(supply), 1)
	surge := roundTo2(math.Max(1.0, float64(demand)/supplyF))

	type resp struct {
		H3Index         string  `json:"h3Index"`
		Demand          int     `json:"demand"`
		Supply          int     `json:"supply"`
		SurgeMultiplier float64 `json:"surgeMultiplier"`
		Note            string  `json:"note"`
	}
	writeJSON(w, http.StatusOK, resp{
		H3Index:         h3Str,
		Demand:          demand,
		Supply:          supply,
		SurgeMultiplier: surge,
		Note:            "Real surge in L2 stores demand/supply per h3Index in Redis.",
	})
}

func main() {
	defaultRes = atoiDefault(os.Getenv("H3_RESOLUTION"), 9)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/h3/cell", cellHandler)
	mux.HandleFunc("/api/h3/neighbors", neighborsHandler)
	mux.HandleFunc("/api/h3/surge-demo", surgeDemoHandler)

	port := env("PORT", "3000")
	log.Printf("h3-geo-service listening on :%s", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%s", port), mux))
}
