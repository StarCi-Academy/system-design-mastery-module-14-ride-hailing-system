package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/uber/h3-go/v4"
)

const (
	h3Resolution  = 9
	geoKey        = "drivers:geo"
	supplyBaseline = 3
	surgeCap      = 3.0
	lockTTL       = 30 * time.Second
)

// searchRadii are the expanding-ring radii in metres.
var searchRadii = []int{500, 1000, 2000, 5000}

// seedDriver is an available driver advertised into the geo set on boot.
type seedDriver struct {
	id  string
	lat float64
	lng float64
}

var seedDrivers = []seedDriver{
	{"d1", 10.7770, 106.7010},
	{"d2", 10.7775, 106.7020},
	{"d3", 10.7740, 106.6980},
}

func parseFloat(s string) float64 {
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// surgeMultiplier scales price with the demand/supply ratio in one cell.
func surgeMultiplier(demand, supply int64) float64 {
	if supply <= 0 {
		supply = supplyBaseline
	}
	raw := 1.0 + float64(demand)/float64(supply)
	rounded := math.Round(raw*100) / 100
	return math.Min(rounded, surgeCap)
}

func quoteHandler(rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		lat := parseFloat(r.URL.Query().Get("lat"))
		lng := parseFloat(r.URL.Query().Get("lng"))

		// Bucket the request by its H3 cell: the cell id IS the demand key.
		cell := h3.LatLngToCell(h3.NewLatLng(lat, lng), h3Resolution).String()

		// INCR is atomic: every quote raises this cell's demand by one.
		demand, _ := rdb.Incr(ctx, "demand:"+cell).Result()
		supply := int64(supplyBaseline)

		writeJSON(w, http.StatusOK, map[string]any{
			"cell":       cell,
			"demand":     demand,
			"supply":     supply,
			"multiplier": surgeMultiplier(demand, supply),
		})
	}
}

// expandingRingSearch tries growing radii until the first ring yields a driver.
func expandingRingSearch(ctx context.Context, rdb *redis.Client, lat, lng float64) (string, int, int, bool) {
	for _, radius := range searchRadii {
		res, err := rdb.GeoSearchLocation(ctx, geoKey, &redis.GeoSearchLocationQuery{
			GeoSearchQuery: redis.GeoSearchQuery{
				Longitude:  lng,
				Latitude:   lat,
				Radius:     float64(radius),
				RadiusUnit: "m",
				Sort:       "ASC",
				Count:      10,
			},
			WithDist: true,
		}).Result()
		if err != nil || len(res) == 0 {
			continue // ring empty, widen the radius
		}
		for _, hit := range res {
			ok, _ := rdb.SetNX(ctx, "lock:driver:"+hit.Name, "1", lockTTL).Result()
			if !ok {
				continue // another rider locked this driver first
			}
			rdb.ZRem(ctx, geoKey, hit.Name)
			return hit.Name, int(math.Round(hit.Dist)), radius, true
		}
	}
	return "", 0, 0, false
}

func requestHandler(rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var body struct {
			RiderID string  `json:"riderId"`
			Lat     float64 `json:"lat"`
			Lng     float64 `json:"lng"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		driver, dist, ring, found := expandingRingSearch(ctx, rdb, body.Lat, body.Lng)
		if !found {
			writeJSON(w, http.StatusOK, map[string]any{"riderId": body.RiderID, "matched": false})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"riderId":        body.RiderID,
			"driverId":       driver,
			"distanceMeters": dist,
			"ringMeters":     ring,
			"matched":        true,
		})
	}
}

func main() {
	redisHost := os.Getenv("REDIS_HOST")
	if redisHost == "" {
		redisHost = "localhost"
	}
	redisPort := os.Getenv("REDIS_PORT")
	if redisPort == "" {
		redisPort = "6379"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	rdb := redis.NewClient(&redis.Options{Addr: redisHost + ":" + redisPort})

	// Seed available drivers into the geo set on boot.
	ctx := context.Background()
	for _, d := range seedDrivers {
		rdb.GeoAdd(ctx, geoKey, &redis.GeoLocation{Name: d.id, Longitude: d.lng, Latitude: d.lat})
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})
	mux.HandleFunc("GET /api/match/quote", quoteHandler(rdb))
	mux.HandleFunc("POST /api/match/request", requestHandler(rdb))

	_ = http.ListenAndServe(":"+port, mux)
}
