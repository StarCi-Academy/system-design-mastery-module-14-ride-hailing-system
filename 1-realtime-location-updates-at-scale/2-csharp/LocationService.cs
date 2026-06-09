using StackExchange.Redis;

namespace LocationTracker;

// NearbyDriver is one entry of a nearby-search result.
public record NearbyDriver(string DriverId, double DistanceM);

// LocationService maps the HTTP contract onto Redis GEO commands.
public class LocationService
{
    // One shared geo set holds every active driver's position as a geohash score.
    private const string GeoKey = "drivers:geo";

    private readonly IDatabase _db;
    private readonly TimeSpan _heartbeatTtl;

    public LocationService(IConnectionMultiplexer mux, IConfiguration config)
    {
        _db = mux.GetDatabase();
        var ttl = Environment.GetEnvironmentVariable("HEARTBEAT_TTL_SEC")
                  ?? config["Location:HeartbeatTtlSeconds"] ?? "30";
        _heartbeatTtl = TimeSpan.FromSeconds(int.Parse(ttl));
    }

    // Store/refresh the driver's position and bump its heartbeat in one update.
    public void UpdateLocation(string driverId, double lat, double lng)
    {
        // GEOADD encodes (lng, lat) into a 52-bit geohash and stores it as the
        // member's score in a sorted set: O(log N) insert/update.
        _db.GeoAdd(GeoKey, lng, lat, driverId);
        // A separate heartbeat key with a TTL lets a driver "age out" on its own.
        _db.StringSet($"driver:heartbeat:{driverId}", "1", _heartbeatTtl);
    }

    // Find drivers within radiusMeters of (lat, lng), nearest first, online only.
    public IReadOnlyList<NearbyDriver> FindNearby(double lat, double lng, double radiusMeters)
    {
        // GEOSEARCH BYRADIUS with ascending order: range-scan the geohash neighborhood,
        // then prune by exact distance to ~50m accuracy.
        var hits = _db.GeoSearch(
            GeoKey,
            lng, lat,
            new GeoSearchCircle(radiusMeters, GeoUnit.Meters),
            order: Order.Ascending);

        var drivers = new List<NearbyDriver>();
        foreach (var h in hits)
        {
            var driverId = h.Member.ToString();
            // Skip drivers whose heartbeat has expired: stale points still live in the geo set.
            if (_db.KeyExists($"driver:heartbeat:{driverId}"))
            {
                drivers.Add(new NearbyDriver(driverId, Math.Round(h.Distance ?? 0, 2)));
            }
        }
        return drivers;
    }

    public bool Ping()
    {
        return _db.Ping() >= TimeSpan.Zero;
    }
}
