package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// updateRequest is the POST /api/location/update body.
type updateRequest struct {
	DriverID string  `json:"driverId"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
}

func main() {
	cfg := LoadConfig()
	client := NewRedisClient(cfg)
	svc := NewLocationService(client, cfg.HeartbeatTTL)

	r := chi.NewRouter()

	// GET /api/health — readiness probe plus Redis connectivity.
	r.Get("/api/health", func(w http.ResponseWriter, req *http.Request) {
		if err := svc.Ping(req.Context()); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "down"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// POST /api/location/update — ingest a driver heartbeat via GEOADD.
	r.Post("/api/location/update", func(w http.ResponseWriter, req *http.Request) {
		var body updateRequest
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
			return
		}
		if body.DriverID == "" || body.Lat < -90 || body.Lat > 90 || body.Lng < -180 || body.Lng > 180 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid driverId or coordinates"})
			return
		}
		if err := svc.UpdateLocation(req.Context(), body.DriverID, body.Lat, body.Lng); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"driverId": body.DriverID, "updated": true})
	})

	// GET /api/location/nearby — radius query via GEOSEARCH BYRADIUS ASC.
	r.Get("/api/location/nearby", func(w http.ResponseWriter, req *http.Request) {
		lat, err1 := strconv.ParseFloat(req.URL.Query().Get("lat"), 64)
		lng, err2 := strconv.ParseFloat(req.URL.Query().Get("lng"), 64)
		radiusM, err3 := strconv.ParseFloat(req.URL.Query().Get("radius"), 64)
		if err1 != nil || err2 != nil || err3 != nil || radiusM <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "lat, lng and positive radius are required"})
			return
		}
		drivers, err := svc.FindNearby(req.Context(), lat, lng, radiusM)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"center":   map[string]float64{"lat": lat, "lng": lng},
			"radiusM":  radiusM,
			"drivers":  drivers,
		})
	})

	log.Printf("location-tracker listening on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatal(err)
	}
}

// writeJSON serializes v as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

var _ = context.Background
